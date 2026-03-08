"""
Language detection service for the Voice Processing service.

Detects spoken language (Hindi, English, mixed, and other supported Indian
languages) from audio features and/or text content.  Uses a combination
of Unicode script analysis for text and spectral heuristics for audio.
When a SageMaker endpoint is configured, delegates to an ML model;
otherwise applies rule-based detection.
"""

from __future__ import annotations

import asyncio
import io
import re
import unicodedata
import wave
from typing import Any, Optional

import numpy as np
import structlog

from app.config import Settings
from app.models import LanguageDetectionResult, LanguageScore, SupportedLanguage

logger = structlog.get_logger("voice.services.language_detector")

# ---------------------------------------------------------------------------
# Unicode block ranges used for script-based text language detection
# ---------------------------------------------------------------------------
# Unicode block ranges for all major Indian scripts
_DEVANAGARI_RANGE = range(0x0900, 0x097F + 1)   # Hindi, Marathi, Sanskrit, Nepali, Konkani, Dogri, Bodo
_BENGALI_RANGE = range(0x0980, 0x09FF + 1)       # Bengali, Assamese
_GURMUKHI_RANGE = range(0x0A00, 0x0A7F + 1)      # Punjabi
_GUJARATI_RANGE = range(0x0A80, 0x0AFF + 1)       # Gujarati
_ORIYA_RANGE = range(0x0B00, 0x0B7F + 1)          # Odia
_TAMIL_RANGE = range(0x0B80, 0x0BFF + 1)          # Tamil
_TELUGU_RANGE = range(0x0C00, 0x0C7F + 1)         # Telugu
_KANNADA_RANGE = range(0x0C80, 0x0CFF + 1)        # Kannada
_MALAYALAM_RANGE = range(0x0D00, 0x0D7F + 1)      # Malayalam
_OL_CHIKI_RANGE = range(0x1C50, 0x1C7F + 1)       # Santali
_MEETEI_MAYEK_RANGE = range(0xABC0, 0xABFF + 1)   # Manipuri (Meitei)
_ARABIC_RANGE = range(0x0600, 0x06FF + 1)          # Urdu, Sindhi, Kashmiri (Perso-Arabic)

_SCRIPT_TO_LANGUAGE: dict[str, SupportedLanguage] = {
    "devanagari": SupportedLanguage.HINDI,
    "bengali": SupportedLanguage.BENGALI,
    "gurmukhi": SupportedLanguage.PUNJABI,
    "gujarati": SupportedLanguage.GUJARATI,
    "oriya": SupportedLanguage.ODIA,
    "tamil": SupportedLanguage.TAMIL,
    "telugu": SupportedLanguage.TELUGU,
    "kannada": SupportedLanguage.KANNADA,
    "malayalam": SupportedLanguage.MALAYALAM,
    "ol_chiki": SupportedLanguage.SANTALI,
    "meetei_mayek": SupportedLanguage.MANIPURI,
    "arabic": SupportedLanguage.URDU,
    "latin": SupportedLanguage.ENGLISH_IN,
}


class LanguageDetectorService:
    """Detects language from audio and/or text input."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def detect_from_audio(
        self, audio_bytes: bytes, sample_rate: int
    ) -> LanguageDetectionResult:
        """Detect language from audio content.

        Uses spectral analysis heuristics or a SageMaker endpoint when
        configured.  Returns a ``LanguageDetectionResult`` with per-language
        confidence scores.
        """
        loop = asyncio.get_running_loop()

        # TODO: Use dedicated sagemaker_language_endpoint when available
        # For now, skip ML-based detection if no dedicated endpoint is configured

        # Rule-based audio detection (offload CPU work)
        scores = await loop.run_in_executor(
            None,
            self._detect_audio_rule_based,
            audio_bytes,
            sample_rate,
        )

        primary = max(scores, key=lambda s: s.confidence)

        return LanguageDetectionResult(
            primary_language=primary.language,
            confidence=primary.confidence,
            all_scores=scores,
            detection_source="audio",
        )

    async def detect_from_text(self, text: str) -> LanguageDetectionResult:
        """Detect language from text using Unicode script analysis.

        Analyses the distribution of characters across writing systems to
        determine the primary language and whether the text is code-mixed.
        """
        scores = self._detect_text_by_script(text)
        primary = max(scores, key=lambda s: s.confidence)

        # Determine if code-mixed
        script_detected: Optional[str] = None
        high_scores = [s for s in scores if s.confidence > 0.2]
        if len(high_scores) > 1:
            script_detected = "mixed"
        else:
            script_detected = primary.language.value

        return LanguageDetectionResult(
            primary_language=primary.language,
            confidence=primary.confidence,
            all_scores=scores,
            detection_source="text",
            script_detected=script_detected,
        )

    async def combine_results(
        self,
        audio_result: LanguageDetectionResult,
        text_result: LanguageDetectionResult,
    ) -> LanguageDetectionResult:
        """Combine audio-based and text-based detection results.

        Weighted merge: audio = 0.4, text = 0.6 (text is generally more
        reliable for language identification).
        """
        audio_weight = 0.4
        text_weight = 0.6

        # Build score map
        combined_map: dict[SupportedLanguage, float] = {}
        for score in audio_result.all_scores:
            combined_map[score.language] = score.confidence * audio_weight
        for score in text_result.all_scores:
            combined_map.setdefault(score.language, 0.0)
            combined_map[score.language] += score.confidence * text_weight

        # Normalize
        total = sum(combined_map.values()) or 1.0
        combined_scores = [
            LanguageScore(language=lang, confidence=round(conf / total, 4))
            for lang, conf in sorted(
                combined_map.items(), key=lambda x: x[1], reverse=True
            )
        ]

        primary = combined_scores[0] if combined_scores else LanguageScore(
            language=SupportedLanguage.ENGLISH_IN, confidence=0.5
        )

        return LanguageDetectionResult(
            primary_language=primary.language,
            confidence=primary.confidence,
            all_scores=combined_scores,
            detection_source="combined",
        )

    # ------------------------------------------------------------------
    # Audio-based detection (rule-based)
    # ------------------------------------------------------------------

    def _detect_audio_rule_based(
        self, audio_bytes: bytes, sample_rate: int
    ) -> list[LanguageScore]:
        """Heuristic language detection from audio spectral features.

        This is a simplified approach that analyses formant-like energy
        distribution.  Indian languages tend to have different spectral
        characteristics, but accurate audio-only language ID normally
        requires a trained model.  This heuristic provides reasonable
        defaults while the ML model is unavailable.
        """
        try:
            # Parse WAV header to extract raw PCM frames (avoids interpreting
            # the 44-byte WAV header as sample data).
            with wave.open(io.BytesIO(audio_bytes), 'rb') as wf:
                raw_frames = wf.readframes(wf.getnframes())
            audio_array = np.frombuffer(raw_frames, dtype=np.int16).astype(
                np.float32
            )
            audio_array = audio_array / 32768.0

            if len(audio_array) < sample_rate * 0.5:
                # Too short for reliable detection; default to English
                return self._default_scores(SupportedLanguage.ENGLISH_IN, 0.4)

            # Compute simple spectral features
            # Use windowed FFT to get energy distribution
            window_size = min(2048, len(audio_array))
            spectrum = np.abs(np.fft.rfft(audio_array[:window_size]))
            freqs = np.fft.rfftfreq(window_size, d=1.0 / sample_rate)

            # Energy in different frequency bands
            low_band = np.sum(spectrum[(freqs >= 100) & (freqs < 500)])
            mid_band = np.sum(spectrum[(freqs >= 500) & (freqs < 2000)])
            high_band = np.sum(spectrum[(freqs >= 2000) & (freqs < 4000)])
            total = low_band + mid_band + high_band + 1e-10

            low_ratio = low_band / total
            mid_ratio = mid_band / total
            high_ratio = high_band / total

            # Heuristic scoring based on typical spectral profiles
            # Hindi tends to have stronger mid-frequency energy due to
            # retroflex consonants; English has more high-frequency energy
            hindi_score = 0.3 + 0.3 * mid_ratio - 0.1 * high_ratio
            english_score = 0.3 + 0.2 * high_ratio + 0.1 * mid_ratio

            # Clamp scores
            hindi_score = max(0.1, min(0.9, hindi_score))
            english_score = max(0.1, min(0.9, english_score))

            # Normalize
            total_score = hindi_score + english_score
            hindi_score /= total_score
            english_score /= total_score

            scores = [
                LanguageScore(
                    language=SupportedLanguage.ENGLISH_IN,
                    confidence=round(english_score, 4),
                ),
                LanguageScore(
                    language=SupportedLanguage.HINDI,
                    confidence=round(hindi_score, 4),
                ),
            ]

            # Add low-confidence entries for all other supported languages
            scored_langs = {SupportedLanguage.ENGLISH_IN, SupportedLanguage.HINDI}
            for lang in SupportedLanguage:
                if lang not in scored_langs:
                    scores.append(LanguageScore(language=lang, confidence=0.02))

            return sorted(scores, key=lambda s: s.confidence, reverse=True)

        except Exception:
            logger.warning("language_detector.audio_heuristic_failed", exc_info=True)
            return self._default_scores(SupportedLanguage.ENGLISH_IN, 0.5)

    # ------------------------------------------------------------------
    # Audio-based detection (ML model via SageMaker)
    # ------------------------------------------------------------------

    async def _detect_audio_ml(
        self, audio_bytes: bytes, sample_rate: int
    ) -> LanguageDetectionResult:
        """Invoke SageMaker endpoint for ML-based language detection."""
        import json

        import boto3

        loop = asyncio.get_running_loop()
        kwargs: dict[str, Any] = {"region_name": self._settings.aws_region}
        if self._settings.aws_access_key_id:
            kwargs["aws_access_key_id"] = self._settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = self._settings.aws_secret_access_key

        client = boto3.client("sagemaker-runtime", **kwargs)

        # Send raw audio bytes to the endpoint
        response = await loop.run_in_executor(
            None,
            lambda: client.invoke_endpoint(
                EndpointName=self._settings.sagemaker_prosody_endpoint,
                ContentType="application/octet-stream",
                Body=audio_bytes,
                CustomAttributes=json.dumps({"sample_rate": sample_rate}),
            ),
        )

        body_stream = response["Body"]
        try:
            result_body = body_stream.read().decode("utf-8")
        finally:
            body_stream.close()
        result = json.loads(result_body)

        # Parse model response
        scores: list[LanguageScore] = []
        for lang_code, conf in result.get("scores", {}).items():
            try:
                lang = SupportedLanguage(lang_code)
                scores.append(LanguageScore(language=lang, confidence=conf))
            except ValueError:
                continue

        if not scores:
            scores = self._default_scores(SupportedLanguage.ENGLISH_IN, 0.5)

        scores.sort(key=lambda s: s.confidence, reverse=True)
        primary = scores[0]

        return LanguageDetectionResult(
            primary_language=primary.language,
            confidence=primary.confidence,
            all_scores=scores,
            detection_source="audio",
        )

    # ------------------------------------------------------------------
    # Text-based detection
    # ------------------------------------------------------------------

    def _detect_text_by_script(self, text: str) -> list[LanguageScore]:
        """Detect language by analysing the Unicode script of each character."""
        if not text or not text.strip():
            return self._default_scores(SupportedLanguage.ENGLISH_IN, 0.5)

        script_counts: dict[str, int] = {
            "devanagari": 0, "bengali": 0, "gurmukhi": 0, "gujarati": 0,
            "oriya": 0, "tamil": 0, "telugu": 0, "kannada": 0,
            "malayalam": 0, "ol_chiki": 0, "meetei_mayek": 0,
            "arabic": 0, "latin": 0,
        }
        total_chars = 0

        for char in text:
            cp = ord(char)
            if char.isspace() or unicodedata.category(char).startswith("P"):
                continue
            total_chars += 1

            if cp in _DEVANAGARI_RANGE:
                script_counts["devanagari"] += 1
            elif cp in _BENGALI_RANGE:
                script_counts["bengali"] += 1
            elif cp in _GURMUKHI_RANGE:
                script_counts["gurmukhi"] += 1
            elif cp in _GUJARATI_RANGE:
                script_counts["gujarati"] += 1
            elif cp in _ORIYA_RANGE:
                script_counts["oriya"] += 1
            elif cp in _TAMIL_RANGE:
                script_counts["tamil"] += 1
            elif cp in _TELUGU_RANGE:
                script_counts["telugu"] += 1
            elif cp in _KANNADA_RANGE:
                script_counts["kannada"] += 1
            elif cp in _MALAYALAM_RANGE:
                script_counts["malayalam"] += 1
            elif cp in _OL_CHIKI_RANGE:
                script_counts["ol_chiki"] += 1
            elif cp in _MEETEI_MAYEK_RANGE:
                script_counts["meetei_mayek"] += 1
            elif cp in _ARABIC_RANGE:
                script_counts["arabic"] += 1
            elif char.isascii() and char.isalpha():
                script_counts["latin"] += 1

        if total_chars == 0:
            return self._default_scores(SupportedLanguage.ENGLISH_IN, 0.5)

        scores: list[LanguageScore] = []
        for script, count in script_counts.items():
            lang = _SCRIPT_TO_LANGUAGE.get(script, SupportedLanguage.ENGLISH_IN)
            confidence = round(count / total_chars, 4) if total_chars > 0 else 0.0
            scores.append(LanguageScore(language=lang, confidence=confidence))

        # Devanagari script is shared by Hindi, Marathi, Sanskrit, Nepali, Konkani, Dogri, Bodo
        devanagari_conf = script_counts["devanagari"] / max(total_chars, 1)
        if devanagari_conf > 0.1:
            # Without lexical analysis, assign decreasing scores to Devanagari languages
            # Hindi is most common in Indian healthcare context
            devanagari_langs = [
                (SupportedLanguage.MARATHI, 0.7),
                (SupportedLanguage.NEPALI, 0.3),
                (SupportedLanguage.KONKANI, 0.2),
                (SupportedLanguage.DOGRI, 0.15),
                (SupportedLanguage.BODO, 0.1),
                (SupportedLanguage.SANSKRIT, 0.05),
            ]
            for lang, factor in devanagari_langs:
                scores.append(
                    LanguageScore(
                        language=lang,
                        confidence=round(devanagari_conf * factor, 4),
                    )
                )

        # Bengali script is shared by Bengali and Assamese
        bengali_conf = script_counts["bengali"] / max(total_chars, 1)
        if bengali_conf > 0.1:
            scores.append(
                LanguageScore(
                    language=SupportedLanguage.ASSAMESE,
                    confidence=round(bengali_conf * 0.6, 4),
                )
            )

        # Arabic script is shared by Urdu, Sindhi, and Kashmiri
        arabic_conf = script_counts["arabic"] / max(total_chars, 1)
        if arabic_conf > 0.1:
            scores.append(
                LanguageScore(language=SupportedLanguage.SINDHI, confidence=round(arabic_conf * 0.5, 4))
            )
            scores.append(
                LanguageScore(language=SupportedLanguage.KASHMIRI, confidence=round(arabic_conf * 0.3, 4))
            )

        scores.sort(key=lambda s: s.confidence, reverse=True)

        # Ensure minimum confidence for primary language
        if scores and scores[0].confidence < 0.1:
            scores[0] = LanguageScore(
                language=SupportedLanguage.ENGLISH_IN, confidence=0.5
            )

        return scores

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _default_scores(
        primary: SupportedLanguage, confidence: float
    ) -> list[LanguageScore]:
        """Return a default score list with the given primary language."""
        all_langs = list(SupportedLanguage)
        scores: list[LanguageScore] = []
        remaining = 1.0 - confidence
        other_count = len(all_langs) - 1

        for lang in all_langs:
            if lang == primary:
                scores.append(LanguageScore(language=lang, confidence=confidence))
            else:
                scores.append(
                    LanguageScore(
                        language=lang,
                        confidence=round(remaining / max(other_count, 1), 4),
                    )
                )

        return sorted(scores, key=lambda s: s.confidence, reverse=True)
