"""
Prosody Analysis Model - Configuration
Hyperparameters, feature configuration, and clinical thresholds
for voice-based distress/pain/anxiety detection in healthcare settings.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple


@dataclass
class AudioConfig:
    """Audio preprocessing configuration."""
    sample_rate: int = 16000
    mono: bool = True
    max_duration_sec: float = 30.0
    min_duration_sec: float = 0.5
    normalize_audio: bool = True
    pre_emphasis_coeff: float = 0.97


@dataclass
class MFCCConfig:
    """MFCC feature extraction configuration."""
    n_mfcc: int = 13
    n_fft: int = 512
    hop_length: int = 160  # 10ms at 16kHz
    win_length: int = 400  # 25ms at 16kHz
    n_mels: int = 80
    fmin: float = 20.0
    fmax: float = 8000.0
    include_deltas: bool = True
    include_delta_deltas: bool = True


@dataclass
class PitchConfig:
    """Pitch (F0) extraction configuration."""
    fmin: float = 50.0    # Hz - lower bound for adult speech
    fmax: float = 600.0   # Hz - upper bound (covers high-pitched distressed speech)
    frame_length: int = 512
    hop_length: int = 160
    method: str = "pyin"  # pYIN for robust pitch tracking


@dataclass
class EnergyConfig:
    """Energy envelope configuration."""
    frame_length: int = 512
    hop_length: int = 160
    normalize: bool = True


@dataclass
class SpeakingRateConfig:
    """Speaking rate estimation configuration."""
    energy_threshold_db: float = -40.0
    min_syllable_duration_sec: float = 0.05
    max_syllable_duration_sec: float = 0.5
    smoothing_window_ms: int = 50


@dataclass
class PauseConfig:
    """Pause detection configuration."""
    silence_threshold_db: float = -45.0
    min_pause_duration_sec: float = 0.2
    max_pause_duration_sec: float = 5.0
    filled_pause_markers: List[str] = field(
        default_factory=lambda: ["um", "uh", "ah", "hmm"]
    )


@dataclass
class VoiceQualityConfig:
    """Jitter and shimmer configuration."""
    min_pitch_for_jitter: float = 50.0
    max_pitch_for_jitter: float = 500.0
    jitter_period_factor: float = 1.3  # max period deviation factor
    shimmer_amplitude_factor: float = 1.6  # max amplitude deviation factor


@dataclass
class FeatureConfig:
    """Complete feature extraction configuration."""
    audio: AudioConfig = field(default_factory=AudioConfig)
    mfcc: MFCCConfig = field(default_factory=MFCCConfig)
    pitch: PitchConfig = field(default_factory=PitchConfig)
    energy: EnergyConfig = field(default_factory=EnergyConfig)
    speaking_rate: SpeakingRateConfig = field(default_factory=SpeakingRateConfig)
    pause: PauseConfig = field(default_factory=PauseConfig)
    voice_quality: VoiceQualityConfig = field(default_factory=VoiceQualityConfig)

    @property
    def total_feature_dim(self) -> int:
        """Calculate total feature dimension for the MLP head."""
        dim = 0
        # MFCC: n_mfcc * (1 + deltas + delta-deltas) stats (mean, std, skew, kurt)
        n_mfcc_channels = 1
        if self.mfcc.include_deltas:
            n_mfcc_channels += 1
        if self.mfcc.include_delta_deltas:
            n_mfcc_channels += 1
        dim += self.mfcc.n_mfcc * n_mfcc_channels * 4  # 4 stats per coeff

        # Pitch stats: mean, std, range, slope, voiced_ratio
        dim += 5

        # Energy stats: mean, std, dynamic_range, contour_slope
        dim += 4

        # Speaking rate: rate, variability
        dim += 2

        # Pause features: count, total_duration, mean_duration, pause_ratio
        dim += 4

        # Voice quality: jitter_local, jitter_ppq5, shimmer_local, shimmer_apq5, hnr
        dim += 5

        return dim


@dataclass
class Wav2Vec2Config:
    """Wav2Vec2 feature extractor configuration."""
    model_name: str = "facebook/wav2vec2-base"
    freeze_feature_extractor: bool = True
    freeze_transformer_layers: int = 8  # freeze first N transformer layers
    output_dim: int = 768
    use_weighted_layer_sum: bool = True


@dataclass
class MLPHeadConfig:
    """MLP classification head configuration."""
    hidden_dims: List[int] = field(default_factory=lambda: [512, 256, 128])
    dropout: float = 0.3
    activation: str = "gelu"
    batch_norm: bool = True
    num_outputs: int = 3  # distress, pain, anxiety


@dataclass
class TrainingConfig:
    """Training hyperparameters."""
    # Optimizer
    learning_rate: float = 1e-4
    weight_decay: float = 0.01
    adam_beta1: float = 0.9
    adam_beta2: float = 0.999
    adam_epsilon: float = 1e-8
    max_grad_norm: float = 1.0

    # Scheduler
    scheduler: str = "cosine"  # "cosine" or "linear"
    warmup_ratio: float = 0.1
    num_epochs: int = 50
    early_stopping_patience: int = 7
    early_stopping_min_delta: float = 0.001

    # Batch
    batch_size: int = 16
    eval_batch_size: int = 32
    gradient_accumulation_steps: int = 2

    # Data
    train_split: float = 0.8
    val_split: float = 0.1
    test_split: float = 0.1
    num_workers: int = 4
    pin_memory: bool = True

    # Loss
    loss_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "distress": 1.0,
            "pain": 1.2,      # slightly higher weight for pain detection
            "anxiety": 1.0,
        }
    )

    # Regularization
    label_smoothing: float = 0.05
    mixup_alpha: float = 0.2

    # Checkpointing
    save_best_only: bool = True
    metric_for_best: str = "val_loss"
    metric_mode: str = "min"

    # Reproducibility
    seed: int = 42


@dataclass
class ClinicalThresholds:
    """
    Clinical thresholds for prosody-based scores.
    These define severity levels for each output.
    Thresholds should be validated clinically before deployment.
    """
    distress: Dict[str, Tuple[float, float]] = field(
        default_factory=lambda: {
            "none": (0.0, 0.2),
            "mild": (0.2, 0.4),
            "moderate": (0.4, 0.6),
            "severe": (0.6, 0.8),
            "critical": (0.8, 1.0),
        }
    )
    pain: Dict[str, Tuple[float, float]] = field(
        default_factory=lambda: {
            "none": (0.0, 0.15),
            "mild": (0.15, 0.35),
            "moderate": (0.35, 0.55),
            "severe": (0.55, 0.75),
            "critical": (0.75, 1.0),
        }
    )
    anxiety: Dict[str, Tuple[float, float]] = field(
        default_factory=lambda: {
            "none": (0.0, 0.2),
            "mild": (0.2, 0.4),
            "moderate": (0.4, 0.6),
            "severe": (0.6, 0.8),
            "critical": (0.8, 1.0),
        }
    )

    def get_severity(self, dimension: str, score: float) -> str:
        """Get severity label for a given dimension and score."""
        thresholds = getattr(self, dimension)
        for level, (low, high) in thresholds.items():
            if low <= score < high:
                return level
        return "critical" if score >= 0.8 else "none"


@dataclass
class InferenceConfig:
    """Inference-time configuration."""
    max_audio_length_sec: float = 60.0
    chunk_length_sec: float = 10.0
    chunk_overlap_sec: float = 2.0
    aggregation: str = "mean"  # "mean", "max", "weighted_mean"
    confidence_calibration: bool = True
    return_features: bool = False
    device: str = "cpu"  # overridden at runtime


# --------------------------------------------------------------------------- #
# Convenience: build a full config from SageMaker hyperparameters or env vars
# --------------------------------------------------------------------------- #

def load_config_from_env() -> dict:
    """Load configuration overrides from environment variables (SageMaker style)."""
    config = {
        "training": TrainingConfig(),
        "feature": FeatureConfig(),
        "wav2vec2": Wav2Vec2Config(),
        "mlp_head": MLPHeadConfig(),
        "thresholds": ClinicalThresholds(),
        "inference": InferenceConfig(),
    }

    # Override from environment variables set by SageMaker
    env_overrides = {
        "SM_HP_LEARNING_RATE": ("training", "learning_rate", float),
        "SM_HP_BATCH_SIZE": ("training", "batch_size", int),
        "SM_HP_NUM_EPOCHS": ("training", "num_epochs", int),
        "SM_HP_DROPOUT": ("mlp_head", "dropout", float),
        "SM_HP_WEIGHT_DECAY": ("training", "weight_decay", float),
        "SM_HP_WARMUP_RATIO": ("training", "warmup_ratio", float),
        "SM_HP_LABEL_SMOOTHING": ("training", "label_smoothing", float),
        "SM_HP_FREEZE_LAYERS": ("wav2vec2", "freeze_transformer_layers", int),
        "SM_HP_EARLY_STOPPING_PATIENCE": ("training", "early_stopping_patience", int),
        "SM_HP_WAV2VEC2_MODEL": ("wav2vec2", "model_name", str),
    }

    for env_key, (section, attr, dtype) in env_overrides.items():
        value = os.environ.get(env_key)
        if value is not None:
            setattr(config[section], attr, dtype(value))

    return config
