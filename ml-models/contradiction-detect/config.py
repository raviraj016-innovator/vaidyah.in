"""
Contradiction Detection Model - Configuration
Hyperparameters, contradiction taxonomy, and clinical thresholds
for detecting contradictions in medical text (symptom-history, medication
interactions, vital-sign vs. symptom mismatches, temporal inconsistencies).
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple


CONTRADICTION_TYPES: List[str] = [
    "symptom_vs_history",
    "medication_interaction",
    "vital_vs_symptom",
    "temporal_inconsistency",
    "dosage_conflict",
    "allergy_contraindication",
]

ENTAILMENT_LABELS: Dict[int, str] = {
    0: "entailment",
    1: "neutral",
    2: "contradiction",
}


@dataclass
class ModelConfig:
    """BERT-based entailment model configuration."""
    base_model: str = "bert-base-multilingual-cased"
    num_labels: int = 3  # entailment / neutral / contradiction
    hidden_dim: int = 768
    classifier_hidden: int = 256
    classifier_dropout: float = 0.3
    max_seq_length: int = 512
    freeze_embeddings: bool = True
    freeze_encoder_layers: int = 6


@dataclass
class ContradictionTypeConfig:
    """Per-type severity weights and clinical importance."""
    type_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "symptom_vs_history": 1.0,
            "medication_interaction": 1.5,
            "vital_vs_symptom": 1.2,
            "temporal_inconsistency": 0.8,
            "dosage_conflict": 1.4,
            "allergy_contraindication": 2.0,
        }
    )
    type_labels: List[str] = field(
        default_factory=lambda: list(CONTRADICTION_TYPES)
    )
    num_types: int = len(CONTRADICTION_TYPES)


@dataclass
class TrainingConfig:
    """Training hyperparameters."""
    # Optimizer
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    adam_beta1: float = 0.9
    adam_beta2: float = 0.999
    adam_epsilon: float = 1e-8
    max_grad_norm: float = 1.0

    # Scheduler
    scheduler: str = "linear"
    warmup_steps: int = 500
    num_epochs: int = 10
    early_stopping_patience: int = 3
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
    label_smoothing: float = 0.05
    class_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "entailment": 0.5,
            "neutral": 1.0,
            "contradiction": 1.5,
        }
    )

    # Checkpointing
    save_best_only: bool = True
    metric_for_best: str = "val_f1"
    metric_mode: str = "max"

    # Reproducibility
    seed: int = 42


@dataclass
class InferenceConfig:
    """Inference-time configuration."""
    confidence_threshold: float = 0.7
    max_seq_length: int = 512
    batch_size: int = 32
    return_all_scores: bool = True
    device: str = "cpu"


@dataclass
class SageMakerConfig:
    """SageMaker deployment configuration."""
    endpoint_name: str = "vaidyah-contradiction-detect"
    instance_type: str = "ml.g4dn.xlarge"
    instance_count: int = 1
    model_data_s3: str = "s3://vaidyah-models/contradiction-detect/model.tar.gz"
    role_arn: str = ""
    max_concurrent_invocations: int = 4
    timeout_sec: int = 60


@dataclass
class ClinicalThresholds:
    """
    Severity classification for detected contradictions.
    Thresholds should be validated clinically before deployment.
    """
    severity_levels: Dict[str, Tuple[float, float]] = field(
        default_factory=lambda: {
            "low": (0.0, 0.8),
            "moderate": (0.8, 0.9),
            "high": (0.9, 0.95),
            "critical": (0.95, 1.0),
        }
    )

    escalation_types: List[str] = field(
        default_factory=lambda: [
            "medication_interaction",
            "allergy_contraindication",
            "dosage_conflict",
        ]
    )

    def get_severity(self, confidence: float) -> str:
        """Get severity label for a contradiction confidence score."""
        for level, (low, high) in self.severity_levels.items():
            if low <= confidence < high:
                return level
        return "critical" if confidence >= 0.95 else "low"

    def requires_escalation(self, contradiction_type: str, severity: str) -> bool:
        """Determine whether a detected contradiction requires clinical escalation."""
        if severity in ("high", "critical"):
            return True
        if contradiction_type in self.escalation_types and severity == "moderate":
            return True
        return False


# --------------------------------------------------------------------------- #
# Convenience: build a full config from SageMaker hyperparameters or env vars
# --------------------------------------------------------------------------- #

def load_config_from_env() -> dict:
    """Load configuration overrides from environment variables (SageMaker style)."""
    config = {
        "model": ModelConfig(),
        "contradiction_types": ContradictionTypeConfig(),
        "training": TrainingConfig(),
        "inference": InferenceConfig(),
        "sagemaker": SageMakerConfig(),
        "thresholds": ClinicalThresholds(),
    }

    env_overrides = {
        "SM_HP_LEARNING_RATE": ("training", "learning_rate", float),
        "SM_HP_BATCH_SIZE": ("training", "batch_size", int),
        "SM_HP_NUM_EPOCHS": ("training", "num_epochs", int),
        "SM_HP_DROPOUT": ("model", "classifier_dropout", float),
        "SM_HP_WEIGHT_DECAY": ("training", "weight_decay", float),
        "SM_HP_WARMUP_STEPS": ("training", "warmup_steps", int),
        "SM_HP_LABEL_SMOOTHING": ("training", "label_smoothing", float),
        "SM_HP_FREEZE_LAYERS": ("model", "freeze_encoder_layers", int),
        "SM_HP_EARLY_STOPPING_PATIENCE": ("training", "early_stopping_patience", int),
        "SM_HP_BASE_MODEL": ("model", "base_model", str),
        "SM_HP_CONFIDENCE_THRESHOLD": ("inference", "confidence_threshold", float),
        "SM_HP_MAX_SEQ_LENGTH": ("inference", "max_seq_length", int),
    }

    for env_key, (section, attr, dtype) in env_overrides.items():
        value = os.environ.get(env_key)
        if value is not None:
            setattr(config[section], attr, dtype(value))

    return config
