"""
Prosody analysis service.

Extracts acoustic features (pitch, energy, pauses, speaking rate) using
librosa and computes emotional / distress scores. Uses a SageMaker endpoint
for ML-based scoring when available; otherwise falls back to a rule-based
algorithm calibrated on clinical observations.
"""

from __future__ import annotations

import asyncio
import io
import json
from typing import Any, Optional

import numpy as np
import structlog

from app.config import Settings
from app.models import EmotionalScores, ProsodyAnalysisResult, ProsodyFeatures

logger = structlog.get_logger("voice.services.prosody")

# ---------------------------------------------------------------------------
# Reference ranges for healthy adult speech (used in rule-based scoring)
# ---------------------------------------------------------------------------
REFERENCE = {
    "pitch_mean_hz": {"low": 85.0, "high": 300.0, "typical_male": 120.0, "typical_female": 210.0},
    "pitch_std_hz": {"low": 10.0, "high": 60.0},
    "speaking_rate_syl_per_sec": {"low": 2.0, "high": 6.0, "normal": 4.0},
    "energy_std_db": {"low": 3.0, "high": 15.0},
    "pause_mean_sec": {"normal": 0.4, "long": 1.0},
    "hesitation_threshold": 3,  # count above which anxiety score increases
}


class ProsodyAnalyzerService:
    """Audio prosody extraction and emotional scoring."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._sagemaker_client: Optional[Any] = None

    def _get_sagemaker_client(self) -> Optional[Any]:
        if (
            not self._settings.sagemaker_prosody_endpoint
            or self._sagemaker_client is False  # sentinel: already tried & failed
        ):
            return None
        if self._sagemaker_client is None:
            try:
                import boto3

                kwargs: dict[str, Any] = {"region_name": self._settings.aws_region}
                if self._settings.aws_access_key_id:
                    kwargs["aws_access_key_id"] = self._settings.aws_access_key_id
                    kwargs["aws_secret_access_key"] = self._settings.aws_secret_access_key
                self._sagemaker_client = boto3.client("sagemaker-runtime", **kwargs)
            except Exception:
                logger.warning("prosody.sagemaker_client_init_failed", exc_info=True)
                self._sagemaker_client = False  # type: ignore[assignment]
                return None
        return self._sagemaker_client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def analyze(
        self,
        audio_bytes: bytes,
        sample_rate: int,
        duration: float,
    ) -> ProsodyAnalysisResult:
        """
        Run full prosody analysis pipeline:
        1. Extract acoustic features with librosa
        2. Score using ML model (SageMaker) or rule-based fallback
        """
        loop = asyncio.get_running_loop()

        # Feature extraction is CPU-bound; offload to executor
        features = await loop.run_in_executor(
            None,
            self._extract_features,
            audio_bytes,
            sample_rate,
        )

        # Score emotional state
        scores, method, model_version, clinical_notes = await self._score(features)

        return ProsodyAnalysisResult(
            features=features,
            emotional_scores=scores,
            analysis_method=method,
            model_version=model_version,
            duration_seconds=duration,
            clinical_notes=clinical_notes,
        )

    # ------------------------------------------------------------------
    # Feature extraction
    # ------------------------------------------------------------------

    def _extract_features(
        self, audio_bytes: bytes, sample_rate: int
    ) -> ProsodyFeatures:
        """Extract prosodic features from raw PCM/WAV audio bytes."""
        import librosa

        # Load audio from bytes
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
        audio_array = audio_array / 32768.0  # normalise to [-1, 1]

        if len(audio_array) == 0:
            logger.warning("prosody.empty_audio")
            return ProsodyFeatures()

        # Resample if needed
        if sample_rate != 22050:
            audio_array = librosa.resample(
                audio_array, orig_sr=sample_rate, target_sr=22050
            )
            sr = 22050
        else:
            sr = sample_rate

        # --- Pitch (F0) via pyin ---
        f0, voiced_flag, voiced_prob = librosa.pyin(
            audio_array,
            fmin=librosa.note_to_hz("C2"),  # ~65 Hz
            fmax=librosa.note_to_hz("C7"),  # ~2093 Hz
            sr=sr,
        )
        f0_valid = f0[~np.isnan(f0)] if f0 is not None else np.array([])

        pitch_mean = float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0.0
        pitch_std = float(np.std(f0_valid)) if len(f0_valid) > 0 else 0.0
        pitch_min = float(np.min(f0_valid)) if len(f0_valid) > 0 else 0.0
        pitch_max = float(np.max(f0_valid)) if len(f0_valid) > 0 else 0.0

        # --- Energy (RMS in dB) ---
        rms = librosa.feature.rms(y=audio_array, frame_length=2048, hop_length=512)[0]
        rms_db = librosa.amplitude_to_db(rms + 1e-10)
        energy_mean = float(np.mean(rms_db))
        energy_std = float(np.std(rms_db))

        # --- Speaking rate estimate (onset-based syllable proxy) ---
        onset_env = librosa.onset.onset_strength(y=audio_array, sr=sr)
        onsets = librosa.onset.onset_detect(
            onset_envelope=onset_env, sr=sr, units="time"
        )
        duration_sec = len(audio_array) / sr
        speaking_rate = len(onsets) / max(duration_sec, 0.1)

        # --- Pause detection ---
        silence_threshold_db = energy_mean - 20  # 20 dB below mean
        is_silent = rms_db < silence_threshold_db
        pause_regions = self._detect_contiguous_regions(is_silent, min_length=5)
        hop_duration = 512 / sr
        pause_durations = [
            (end - start) * hop_duration for start, end in pause_regions
        ]
        # Filter pauses shorter than 200ms
        pause_durations = [d for d in pause_durations if d >= 0.2]

        pause_count = len(pause_durations)
        pause_total = sum(pause_durations)
        pause_mean = (pause_total / pause_count) if pause_count > 0 else 0.0

        # --- Hesitation detection (short pauses 200-500ms) ---
        hesitations = [d for d in pause_durations if 0.2 <= d <= 0.5]
        hesitation_count = len(hesitations)

        # --- Jitter & Shimmer approximation ---
        jitter = 0.0
        shimmer = 0.0
        if len(f0_valid) > 1:
            f0_diffs = np.abs(np.diff(f0_valid))
            jitter = float(np.mean(f0_diffs) / max(np.mean(f0_valid), 1.0))

        if len(rms) > 1:
            rms_linear = librosa.db_to_amplitude(rms_db)
            rms_diffs = np.abs(np.diff(rms_linear))
            shimmer = float(np.mean(rms_diffs) / max(np.mean(rms_linear), 1e-10))

        return ProsodyFeatures(
            pitch_mean_hz=round(pitch_mean, 2),
            pitch_std_hz=round(pitch_std, 2),
            pitch_min_hz=round(pitch_min, 2),
            pitch_max_hz=round(pitch_max, 2),
            speaking_rate_syllables_per_sec=round(speaking_rate, 2),
            energy_mean_db=round(energy_mean, 2),
            energy_std_db=round(energy_std, 2),
            pause_count=pause_count,
            pause_total_duration_sec=round(pause_total, 3),
            pause_mean_duration_sec=round(pause_mean, 3),
            hesitation_count=hesitation_count,
            voice_quality_jitter=round(jitter, 4),
            voice_quality_shimmer=round(shimmer, 4),
        )

    @staticmethod
    def _detect_contiguous_regions(
        mask: np.ndarray, min_length: int = 1
    ) -> list[tuple[int, int]]:
        """Find contiguous True regions in a boolean array."""
        regions: list[tuple[int, int]] = []
        in_region = False
        start = 0

        for i, val in enumerate(mask):
            if val and not in_region:
                start = i
                in_region = True
            elif not val and in_region:
                if i - start >= min_length:
                    regions.append((start, i))
                in_region = False

        if in_region and len(mask) - start >= min_length:
            regions.append((start, len(mask)))

        return regions

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    async def _score(
        self, features: ProsodyFeatures
    ) -> tuple[EmotionalScores, str, Optional[str], list[str]]:
        """
        Score emotional state from prosody features.

        Tries SageMaker ML model first; falls back to rule-based.
        Returns (scores, method, model_version, clinical_notes).
        """
        # Try ML model
        if self._settings.sagemaker_prosody_endpoint:
            try:
                scores, version = await self._score_ml(features)
                notes = self._generate_clinical_notes(features, scores)
                return scores, "ml_model", version, notes
            except Exception:
                logger.warning(
                    "prosody.ml_scoring_failed_falling_back",
                    exc_info=True,
                )
                if not self._settings.prosody_fallback_to_rules:
                    raise

        # Rule-based fallback
        scores = self._score_rule_based(features)
        notes = self._generate_clinical_notes(features, scores)
        return scores, "rule_based", None, notes

    async def _score_ml(
        self, features: ProsodyFeatures
    ) -> tuple[EmotionalScores, str]:
        """Invoke SageMaker endpoint for ML-based prosody scoring."""
        client = self._get_sagemaker_client()
        if client is None:
            raise RuntimeError("SageMaker client not available")

        loop = asyncio.get_running_loop()
        payload = json.dumps(features.model_dump())

        response = await loop.run_in_executor(
            None,
            lambda: client.invoke_endpoint(
                EndpointName=self._settings.sagemaker_prosody_endpoint,
                ContentType="application/json",
                Body=payload,
                CustomAttributes="accept=application/json",
            ),
        )

        result_body = response["Body"].read().decode("utf-8")
        result = json.loads(result_body)

        scores = EmotionalScores(
            distress=self._clamp(result.get("distress", 0.0)),
            pain=self._clamp(result.get("pain", 0.0)),
            anxiety=self._clamp(result.get("anxiety", 0.0)),
            fatigue=self._clamp(result.get("fatigue", 0.0)),
            confidence=self._clamp(result.get("confidence", 0.0)),
        )

        model_version = result.get("model_version", "unknown")
        return scores, model_version

    def _score_rule_based(self, features: ProsodyFeatures) -> EmotionalScores:
        """
        Rule-based emotional scoring calibrated on clinical observations.

        Heuristics:
        - Distress: high pitch variability + fast rate + high energy variability
        - Pain: monotone (low pitch std) + slow rate + frequent pauses
        - Anxiety: fast rate + many hesitations + high pitch + jitter
        - Fatigue: slow rate + low energy + long pauses + low pitch
        """
        ref = REFERENCE

        # --- Distress score ---
        distress = 0.0
        # High pitch variability
        if features.pitch_std_hz > ref["pitch_std_hz"]["high"]:
            distress += 0.3
        elif features.pitch_std_hz > ref["pitch_std_hz"]["high"] * 0.7:
            distress += 0.15

        # Fast speaking rate
        if features.speaking_rate_syllables_per_sec > ref["speaking_rate_syl_per_sec"]["high"]:
            distress += 0.25
        # High energy variability
        if features.energy_std_db > ref["energy_std_db"]["high"]:
            distress += 0.25
        # High jitter
        if features.voice_quality_jitter > 0.03:
            distress += 0.2

        # --- Pain score ---
        pain = 0.0
        # Monotone voice (low pitch variability)
        if features.pitch_std_hz < ref["pitch_std_hz"]["low"]:
            pain += 0.2
        # Slow speaking rate
        if features.speaking_rate_syllables_per_sec < ref["speaking_rate_syl_per_sec"]["low"]:
            pain += 0.3
        # Frequent / long pauses
        if features.pause_mean_duration_sec > ref["pause_mean_sec"]["long"]:
            pain += 0.25
        if features.pause_count > 5:
            pain += 0.15
        # High shimmer (voice strain)
        if features.voice_quality_shimmer > 0.05:
            pain += 0.1

        # --- Anxiety score ---
        anxiety = 0.0
        # Fast speaking rate
        if features.speaking_rate_syllables_per_sec > ref["speaking_rate_syl_per_sec"]["high"]:
            anxiety += 0.2
        # Many hesitations
        if features.hesitation_count > ref["hesitation_threshold"]:
            anxiety += 0.3
        elif features.hesitation_count > 1:
            anxiety += 0.1
        # High pitch
        if features.pitch_mean_hz > ref["pitch_mean_hz"]["high"]:
            anxiety += 0.2
        # High jitter (voice tremor)
        if features.voice_quality_jitter > 0.025:
            anxiety += 0.2
        # Short pauses (rushed speech)
        if features.pause_count > 3 and features.pause_mean_duration_sec < 0.3:
            anxiety += 0.1

        # --- Fatigue score ---
        fatigue = 0.0
        # Slow rate
        if features.speaking_rate_syllables_per_sec < ref["speaking_rate_syl_per_sec"]["low"]:
            fatigue += 0.3
        # Low energy
        if features.energy_mean_db < -30:
            fatigue += 0.25
        # Long pauses
        if features.pause_mean_duration_sec > ref["pause_mean_sec"]["long"]:
            fatigue += 0.2
        # Low pitch variability (monotone)
        if features.pitch_std_hz < ref["pitch_std_hz"]["low"]:
            fatigue += 0.15
        # Low pitch
        if features.pitch_mean_hz < ref["pitch_mean_hz"]["low"]:
            fatigue += 0.1

        return EmotionalScores(
            distress=self._clamp(distress),
            pain=self._clamp(pain),
            anxiety=self._clamp(anxiety),
            fatigue=self._clamp(fatigue),
            confidence=0.6,  # rule-based confidence ceiling
        )

    # ------------------------------------------------------------------
    # Clinical notes generation
    # ------------------------------------------------------------------

    def _generate_clinical_notes(
        self, features: ProsodyFeatures, scores: EmotionalScores
    ) -> list[str]:
        """Generate human-readable clinical observations from prosody analysis."""
        notes: list[str] = []

        if scores.distress > 0.6:
            notes.append(
                "Elevated vocal distress indicators detected. "
                "Consider assessing patient's emotional state."
            )
        if scores.pain > 0.5:
            notes.append(
                "Voice patterns suggest possible pain or discomfort. "
                "Speech is slower with frequent pauses."
            )
        if scores.anxiety > 0.5:
            notes.append(
                "Anxiety markers observed: increased speech rate, "
                "hesitations, and pitch variability."
            )
        if scores.fatigue > 0.5:
            notes.append(
                "Fatigue indicators present: reduced energy, slower "
                "speech, and prolonged pauses."
            )

        if features.hesitation_count > 5:
            notes.append(
                f"Frequent hesitations detected ({features.hesitation_count}). "
                "May indicate uncertainty or cognitive load."
            )

        if features.pause_total_duration_sec > 10:
            notes.append(
                f"Total pause duration is {features.pause_total_duration_sec:.1f}s. "
                "Extended silences may warrant clinical attention."
            )

        if not notes:
            notes.append("No significant prosodic abnormalities detected.")

        return notes

    @staticmethod
    def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
        return max(lo, min(hi, value))
