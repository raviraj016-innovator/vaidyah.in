"""
Prosody Analysis - Audio Feature Extraction
Extracts clinically relevant prosodic features from speech audio
for distress, pain, and anxiety detection.
"""

import warnings
from typing import Dict, List, Optional, Tuple

import librosa
import numpy as np
import scipy.signal
from scipy.stats import kurtosis, skew

from .config import (
    AudioConfig,
    EnergyConfig,
    FeatureConfig,
    MFCCConfig,
    PauseConfig,
    PitchConfig,
    SpeakingRateConfig,
    VoiceQualityConfig,
)

warnings.filterwarnings("ignore", category=UserWarning, module="librosa")


class ProsodyFeatureExtractor:
    """
    Extracts prosodic features from speech audio for clinical analysis.

    Features include:
    - MFCC (13 coefficients with deltas)
    - Pitch tracking (F0 contour)
    - Energy envelope
    - Speaking rate (syllables/sec)
    - Pause detection and counting
    - Voice quality: jitter, shimmer, HNR
    """

    def __init__(self, config: Optional[FeatureConfig] = None):
        self.config = config or FeatureConfig()
        self._normalization_stats: Optional[Dict[str, Tuple[np.ndarray, np.ndarray]]] = None

    # ---------------------------------------------------------------------- #
    #  Top-level extraction
    # ---------------------------------------------------------------------- #

    def extract_all(
        self, audio: np.ndarray, sr: int, normalize: bool = True
    ) -> Dict[str, np.ndarray]:
        """
        Extract all prosodic features from an audio signal.

        Args:
            audio: 1-D float32 audio waveform.
            sr: Sample rate in Hz.
            normalize: If True, apply feature-level normalization.

        Returns:
            Dictionary mapping feature names to numpy arrays.
        """
        audio = self._preprocess_audio(audio, sr)
        sr = self.config.audio.sample_rate  # after resampling

        features: Dict[str, np.ndarray] = {}

        # MFCC features
        mfcc_stats = self.extract_mfcc(audio, sr)
        features["mfcc"] = mfcc_stats

        # Pitch features
        pitch_stats = self.extract_pitch(audio, sr)
        features["pitch"] = pitch_stats

        # Energy features
        energy_stats = self.extract_energy(audio, sr)
        features["energy"] = energy_stats

        # Speaking rate
        speaking_rate = self.extract_speaking_rate(audio, sr)
        features["speaking_rate"] = speaking_rate

        # Pause features
        pause_feats = self.extract_pause_features(audio, sr)
        features["pause"] = pause_feats

        # Voice quality (jitter, shimmer, HNR)
        vq = self.extract_voice_quality(audio, sr)
        features["voice_quality"] = vq

        if normalize and self._normalization_stats is not None:
            features = self._apply_normalization(features)

        return features

    # Canonical feature order matching FeatureConfig.total_feature_dim layout
    FEATURE_ORDER = ["mfcc", "pitch", "energy", "speaking_rate", "pause", "voice_quality"]

    def extract_flat_vector(
        self, audio: np.ndarray, sr: int, normalize: bool = True
    ) -> np.ndarray:
        """Extract all features and return as a single flat vector."""
        features = self.extract_all(audio, sr, normalize=normalize)
        return np.concatenate(
            [features[k].ravel() for k in self.FEATURE_ORDER], axis=0
        ).astype(np.float32)

    # ---------------------------------------------------------------------- #
    #  Audio preprocessing
    # ---------------------------------------------------------------------- #

    def _preprocess_audio(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """Resample, convert to mono, clip length, and apply pre-emphasis."""
        cfg = self.config.audio

        # Handle both (channels, samples) and (samples, channels) layouts
        if audio.ndim == 2:
            if audio.shape[0] <= 2:  # Likely (channels, samples)
                audio = np.mean(audio, axis=0)
            else:  # Likely (samples, channels)
                audio = np.mean(audio, axis=1)
        elif audio.ndim > 2:
            raise ValueError(f"Expected 1-D or 2-D audio, got {audio.ndim}-D")

        # Resample
        if sr != cfg.sample_rate:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=cfg.sample_rate)

        # Bug 9 fix: enforce minimum duration before pre-emphasis
        min_samples = int(cfg.min_duration_sec * cfg.sample_rate)
        if len(audio) < min_samples:
            raise ValueError(
                f"Audio too short: {len(audio)} samples "
                f"({len(audio) / cfg.sample_rate:.3f}s), minimum required is "
                f"{min_samples} samples ({cfg.min_duration_sec}s)"
            )

        # Clip to max duration
        max_samples = int(cfg.max_duration_sec * cfg.sample_rate)
        if len(audio) > max_samples:
            audio = audio[:max_samples]

        # Normalize amplitude
        if cfg.normalize_audio:
            peak = np.max(np.abs(audio))
            if peak > 0:
                audio = audio / peak

        # Pre-emphasis filter
        if cfg.pre_emphasis_coeff > 0:
            audio = np.append(audio[0], audio[1:] - cfg.pre_emphasis_coeff * audio[:-1])

        return audio.astype(np.float32)

    # ---------------------------------------------------------------------- #
    #  MFCC Features
    # ---------------------------------------------------------------------- #

    def extract_mfcc(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """
        Extract MFCC features with optional deltas and delta-deltas.

        Returns statistics (mean, std, skew, kurtosis) for each coefficient,
        yielding a fixed-length feature vector regardless of audio duration.
        """
        cfg = self.config.mfcc

        mfcc = librosa.feature.mfcc(
            y=audio,
            sr=sr,
            n_mfcc=cfg.n_mfcc,
            n_fft=cfg.n_fft,
            hop_length=cfg.hop_length,
            win_length=cfg.win_length,
            n_mels=cfg.n_mels,
            fmin=cfg.fmin,
            fmax=cfg.fmax,
        )

        feature_matrices = [mfcc]

        if cfg.include_deltas:
            delta = librosa.feature.delta(mfcc, order=1)
            feature_matrices.append(delta)

        if cfg.include_delta_deltas:
            delta2 = librosa.feature.delta(mfcc, order=2)
            feature_matrices.append(delta2)

        # Compute summary statistics for each coefficient in each matrix
        stats = []
        for mat in feature_matrices:
            for i in range(mat.shape[0]):
                row = mat[i]
                stats.extend([
                    np.mean(row),
                    np.std(row),
                    float(skew(row)) if len(row) > 2 else 0.0,
                    float(kurtosis(row)) if len(row) > 3 else 0.0,
                ])

        return np.array(stats, dtype=np.float32)

    # ---------------------------------------------------------------------- #
    #  Pitch (F0) Tracking
    # ---------------------------------------------------------------------- #

    def extract_pitch(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """
        Extract pitch (F0) contour using pYIN and compute summary statistics.

        Returns: [mean_f0, std_f0, range_f0, slope_f0, voiced_ratio]
        """
        cfg = self.config.pitch

        f0, voiced_flag, voiced_probs = librosa.pyin(
            audio,
            fmin=cfg.fmin,
            fmax=cfg.fmax,
            sr=sr,
            frame_length=cfg.frame_length,
            hop_length=cfg.hop_length,
        )

        # Filter to voiced frames only
        voiced_f0 = f0[~np.isnan(f0)] if f0 is not None else np.array([])

        if len(voiced_f0) < 2:
            return np.zeros(5, dtype=np.float32)

        mean_f0 = np.mean(voiced_f0)
        std_f0 = np.std(voiced_f0)
        range_f0 = np.max(voiced_f0) - np.min(voiced_f0)

        # Linear regression slope over voiced F0 (intonation trend)
        x = np.arange(len(voiced_f0))
        slope_f0 = np.polyfit(x, voiced_f0, 1)[0] if len(voiced_f0) > 1 else 0.0

        # Voiced ratio: proportion of frames that are voiced
        total_frames = len(f0)
        voiced_ratio = len(voiced_f0) / total_frames if total_frames > 0 else 0.0

        return np.array(
            [mean_f0, std_f0, range_f0, slope_f0, voiced_ratio], dtype=np.float32
        )

    # ---------------------------------------------------------------------- #
    #  Energy Envelope
    # ---------------------------------------------------------------------- #

    def extract_energy(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """
        Extract energy envelope and compute summary statistics.

        Returns: [mean_energy, std_energy, dynamic_range_db, slope]
        """
        cfg = self.config.energy

        # RMS energy per frame
        rms = librosa.feature.rms(
            y=audio,
            frame_length=cfg.frame_length,
            hop_length=cfg.hop_length,
        )[0]

        if len(rms) < 2:
            return np.zeros(4, dtype=np.float32)

        # Convert to dB
        rms_db = librosa.amplitude_to_db(rms, ref=np.max(rms) + 1e-10)

        mean_energy = float(np.mean(rms_db))
        std_energy = float(np.std(rms_db))
        dynamic_range = float(np.max(rms_db) - np.min(rms_db))

        # Energy contour slope
        x = np.arange(len(rms_db))
        slope = np.polyfit(x, rms_db, 1)[0] if len(rms_db) > 1 else 0.0

        return np.array(
            [mean_energy, std_energy, dynamic_range, slope], dtype=np.float32
        )

    # ---------------------------------------------------------------------- #
    #  Speaking Rate
    # ---------------------------------------------------------------------- #

    def extract_speaking_rate(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """
        Estimate speaking rate in syllables per second using energy-based
        syllable nuclei detection.

        Returns: [speaking_rate, rate_variability]
        """
        cfg = self.config.speaking_rate

        # Compute spectral flux for onset detection
        hop = int(sr * cfg.smoothing_window_ms / 1000)
        onset_env = librosa.onset.onset_strength(y=audio, sr=sr, hop_length=hop)

        # Peak picking for syllable nuclei
        peaks = librosa.util.peak_pick(
            onset_env,
            pre_max=3,
            post_max=3,
            pre_avg=3,
            post_avg=5,
            delta=0.05,
            wait=int(cfg.min_syllable_duration_sec * sr / hop),
        )

        duration_sec = len(audio) / sr
        if duration_sec < 0.1:
            return np.zeros(2, dtype=np.float32)

        num_syllables = len(peaks)
        speaking_rate = num_syllables / duration_sec

        # Rate variability: compute local rates in 2-second windows
        if num_syllables > 2:
            peak_times = peaks * hop / sr
            intervals = np.diff(peak_times)
            local_rates = 1.0 / (intervals + 1e-10)
            rate_variability = float(np.std(local_rates))
        else:
            rate_variability = 0.0

        return np.array([speaking_rate, rate_variability], dtype=np.float32)

    # ---------------------------------------------------------------------- #
    #  Pause Detection
    # ---------------------------------------------------------------------- #

    def extract_pause_features(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """
        Detect and characterize pauses in speech.

        Returns: [pause_count, total_pause_duration, mean_pause_duration, pause_ratio]
        """
        cfg = self.config.pause

        # Frame-level energy in dB
        hop = self.config.energy.hop_length
        rms = librosa.feature.rms(
            y=audio, frame_length=self.config.energy.frame_length, hop_length=hop
        )[0]
        rms_db = librosa.amplitude_to_db(rms, ref=np.max(rms) + 1e-10)

        # Silence mask
        is_silent = rms_db < cfg.silence_threshold_db

        # Find contiguous silent regions
        pauses: List[float] = []
        in_pause = False
        pause_start = 0

        for i, silent in enumerate(is_silent):
            if silent and not in_pause:
                in_pause = True
                pause_start = i
            elif not silent and in_pause:
                in_pause = False
                pause_duration_sec = (i - pause_start) * hop / sr
                if cfg.min_pause_duration_sec <= pause_duration_sec <= cfg.max_pause_duration_sec:
                    pauses.append(pause_duration_sec)

        # Handle trailing pause
        if in_pause:
            pause_duration_sec = (len(is_silent) - pause_start) * hop / sr
            if cfg.min_pause_duration_sec <= pause_duration_sec <= cfg.max_pause_duration_sec:
                pauses.append(pause_duration_sec)

        total_duration = len(audio) / sr
        pause_count = len(pauses)
        total_pause = sum(pauses) if pauses else 0.0
        mean_pause = np.mean(pauses) if pauses else 0.0
        pause_ratio = total_pause / total_duration if total_duration > 0 else 0.0

        return np.array(
            [pause_count, total_pause, mean_pause, pause_ratio], dtype=np.float32
        )

    # ---------------------------------------------------------------------- #
    #  Voice Quality: Jitter, Shimmer, HNR
    # ---------------------------------------------------------------------- #

    def extract_voice_quality(self, audio: np.ndarray, sr: int) -> np.ndarray:
        """
        Extract voice quality measures: jitter, shimmer, and harmonic-to-noise ratio.

        These are important clinical indicators:
        - High jitter/shimmer indicate vocal instability (stress, pathology).
        - Low HNR indicates breathy or rough voice quality.

        Returns: [jitter_local, jitter_ppq5, shimmer_local, shimmer_apq5, hnr]
        """
        cfg = self.config.voice_quality

        # Get pitch for period extraction
        f0, _, _ = librosa.pyin(
            audio,
            fmin=cfg.min_pitch_for_jitter,
            fmax=cfg.max_pitch_for_jitter,
            sr=sr,
            frame_length=512,
            hop_length=160,
        )

        voiced_f0 = f0[~np.isnan(f0)] if f0 is not None else np.array([])

        if len(voiced_f0) < 5:
            return np.zeros(5, dtype=np.float32)

        # --- Jitter (period perturbation) ---
        # Filter out near-zero F0 values that would produce unrealistic periods
        voiced_f0 = voiced_f0[voiced_f0 > 50.0]  # Minimum 50 Hz
        if len(voiced_f0) < 5:
            return np.zeros(5, dtype=np.float32)

        periods = 1.0 / voiced_f0

        # Local jitter: mean absolute difference between consecutive periods
        period_diffs = np.abs(np.diff(periods))
        mean_period = np.mean(periods)
        jitter_local = float(np.mean(period_diffs) / mean_period) if mean_period > 0 else 0.0

        # PPQ5 jitter: 5-point period perturbation quotient
        if len(periods) >= 5:
            smoothed = np.convolve(periods, np.ones(5) / 5, mode="valid")
            ppq5_diffs = np.abs(periods[2 : 2 + len(smoothed)] - smoothed)
            jitter_ppq5 = float(np.mean(ppq5_diffs) / (np.mean(periods) + 1e-10))
        else:
            jitter_ppq5 = jitter_local

        # --- Shimmer (amplitude perturbation) ---
        # Extract amplitudes at pitch-synchronous points
        hop = 160
        frame_length = 512
        rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop)[0]

        # Use voiced frame indices to pick corresponding RMS values
        voiced_indices = np.where(~np.isnan(f0))[0] if f0 is not None else np.array([])
        if len(voiced_indices) > 0:
            valid_indices = voiced_indices[voiced_indices < len(rms)]
            amplitudes = rms[valid_indices]
        else:
            amplitudes = rms

        if len(amplitudes) < 5:
            return np.array([jitter_local, jitter_ppq5, 0.0, 0.0, 0.0], dtype=np.float32)

        amp_diffs = np.abs(np.diff(amplitudes))
        shimmer_local = float(np.mean(amp_diffs) / (np.mean(amplitudes) + 1e-10))

        # APQ5 shimmer
        if len(amplitudes) >= 5:
            smoothed_amp = np.convolve(amplitudes, np.ones(5) / 5, mode="valid")
            apq5_diffs = np.abs(amplitudes[2 : 2 + len(smoothed_amp)] - smoothed_amp)
            shimmer_apq5 = float(np.mean(apq5_diffs) / (np.mean(amplitudes) + 1e-10))
        else:
            shimmer_apq5 = shimmer_local

        # --- Harmonic-to-Noise Ratio ---
        hnr = self._compute_hnr(audio, sr)

        return np.array(
            [jitter_local, jitter_ppq5, shimmer_local, shimmer_apq5, hnr],
            dtype=np.float32,
        )

    def _compute_hnr(self, audio: np.ndarray, sr: int) -> float:
        """Compute Harmonic-to-Noise Ratio using autocorrelation method."""
        frame_len = int(0.04 * sr)  # 40ms frames
        hop = int(0.01 * sr)
        hnr_values = []

        for start in range(0, len(audio) - frame_len, hop):
            frame = audio[start : start + frame_len]

            # Autocorrelation
            acf = np.correlate(frame, frame, mode="full")
            acf = acf[len(acf) // 2 :]
            acf = acf / (acf[0] + 1e-10)

            # Find first peak after zero-crossing (fundamental period)
            min_lag = int(sr / 500)  # 500 Hz max
            max_lag = int(sr / 50)   # 50 Hz min

            if max_lag > len(acf):
                continue

            search_region = acf[min_lag:max_lag]
            if len(search_region) == 0:
                continue

            peak_idx = np.argmax(search_region)
            peak_val = search_region[peak_idx]

            if peak_val > 0 and peak_val < 0.9999:
                hnr_db = 10.0 * np.log10(peak_val / max(1.0 - peak_val, 1e-6))
                hnr_values.append(hnr_db)

        return float(np.mean(hnr_values)) if hnr_values else 0.0

    # ---------------------------------------------------------------------- #
    #  Normalization
    # ---------------------------------------------------------------------- #

    def fit_normalization(self, feature_list: List[Dict[str, np.ndarray]]) -> None:
        """
        Compute per-feature mean and std from a list of extracted feature dicts.
        Call this on the training set before calling extract_all with normalize=True.
        """
        # Bug 6 fix: return early with empty stats if feature_list is empty
        if not feature_list:
            self._normalization_stats = {}
            return

        stats: Dict[str, Tuple[np.ndarray, np.ndarray]] = {}

        keys = feature_list[0].keys()
        for key in keys:
            all_vals = np.stack([f[key] for f in feature_list], axis=0)
            stats[key] = (np.mean(all_vals, axis=0), np.std(all_vals, axis=0) + 1e-8)

        self._normalization_stats = stats

    def _apply_normalization(
        self, features: Dict[str, np.ndarray]
    ) -> Dict[str, np.ndarray]:
        """Apply z-score normalization using stored statistics."""
        if self._normalization_stats is None:
            return features

        normalized = {}
        for key, arr in features.items():
            if key in self._normalization_stats:
                mean, std = self._normalization_stats[key]
                normalized[key] = (arr - mean) / std
            else:
                normalized[key] = arr
        return normalized

    def get_normalization_stats(self) -> Optional[Dict[str, Tuple[np.ndarray, np.ndarray]]]:
        """Return the stored normalization statistics for serialization."""
        return self._normalization_stats

    def set_normalization_stats(
        self, stats: Dict[str, Tuple[np.ndarray, np.ndarray]]
    ) -> None:
        """Load normalization statistics (e.g., from a saved model artifact)."""
        self._normalization_stats = stats
