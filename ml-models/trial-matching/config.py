"""
Trial Matching Model - Configuration
Hyperparameters, matching weights, FAISS index parameters, and scoring
thresholds for matching patient profiles to clinical trial eligibility criteria.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple


@dataclass
class ModelConfig:
    """Sentence transformer configuration for semantic embedding."""
    base_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dim: int = 384
    max_seq_length: int = 256
    normalize_embeddings: bool = True
    pooling_strategy: str = "mean"


@dataclass
class MatchingConfig:
    """Matching parameters and feature weights."""
    similarity_threshold: float = 0.65
    top_k: int = 10
    feature_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "semantic_similarity": 0.35,
            "conditions": 0.25,
            "demographics": 0.15,
            "location": 0.10,
            "eligibility": 0.15,
        }
    )
    min_eligibility_score: float = 0.5
    boost_exact_condition_match: float = 0.15


@dataclass
class IndexConfig:
    """FAISS index configuration for efficient similarity search."""
    index_type: str = "IVFFlat"
    nlist: int = 100  # number of Voronoi cells
    nprobe: int = 10  # cells to visit during search
    metric: str = "inner_product"  # equivalent to cosine when embeddings are normalized
    use_gpu: bool = False
    train_size: int = 10000  # minimum vectors to train IVF
    index_path: str = "trial_index.faiss"


@dataclass
class LocationConfig:
    """Location-based matching parameters."""
    max_distance_km: float = 200.0
    distance_decay_factor: float = 0.01
    default_lat: float = 28.6139
    default_lon: float = 77.2090


@dataclass
class TrainingConfig:
    """Training hyperparameters for fine-tuning the sentence transformer."""
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    adam_epsilon: float = 1e-8
    max_grad_norm: float = 1.0

    scheduler: str = "linear"
    warmup_steps: int = 200
    num_epochs: int = 5
    early_stopping_patience: int = 3

    batch_size: int = 64
    eval_batch_size: int = 128
    num_workers: int = 4
    pin_memory: bool = True

    train_split: float = 0.8
    val_split: float = 0.1
    test_split: float = 0.1

    loss_function: str = "multiple_negatives_ranking"
    mining_strategy: str = "hard"

    save_best_only: bool = True
    metric_for_best: str = "val_mrr"
    metric_mode: str = "max"

    seed: int = 42


@dataclass
class InferenceConfig:
    """Inference-time configuration."""
    batch_size: int = 64
    max_seq_length: int = 256
    device: str = "cpu"
    cache_embeddings: bool = True
    cache_ttl_sec: int = 3600
    cache_max_entries: int = 10000


@dataclass
class SageMakerConfig:
    """SageMaker deployment configuration."""
    endpoint_name: str = "vaidyah-trial-matching"
    instance_type: str = "ml.g4dn.xlarge"
    instance_count: int = 1
    model_data_s3: str = "s3://vaidyah-models/trial-matching/model.tar.gz"
    role_arn: str = ""
    max_concurrent_invocations: int = 8
    timeout_sec: int = 30


@dataclass
class ScoringThresholds:
    """
    Thresholds for match quality classification.
    Thresholds should be validated clinically before deployment.
    """
    match_quality: Dict[str, Tuple[float, float]] = field(
        default_factory=lambda: {
            "poor": (0.0, 0.3),
            "fair": (0.3, 0.5),
            "good": (0.5, 0.7),
            "strong": (0.7, 0.85),
            "excellent": (0.85, 1.0),
        }
    )

    def get_quality(self, score: float) -> str:
        """Get match quality label for a composite score."""
        for level, (low, high) in self.match_quality.items():
            if low <= score < high:
                return level
        return "excellent" if score >= 0.85 else "poor"


# --------------------------------------------------------------------------- #
# Convenience: build a full config from SageMaker hyperparameters or env vars
# --------------------------------------------------------------------------- #

def load_config_from_env() -> dict:
    """Load configuration overrides from environment variables (SageMaker style)."""
    config = {
        "model": ModelConfig(),
        "matching": MatchingConfig(),
        "index": IndexConfig(),
        "location": LocationConfig(),
        "training": TrainingConfig(),
        "inference": InferenceConfig(),
        "sagemaker": SageMakerConfig(),
        "scoring": ScoringThresholds(),
    }

    env_overrides = {
        "SM_HP_LEARNING_RATE": ("training", "learning_rate", float),
        "SM_HP_BATCH_SIZE": ("training", "batch_size", int),
        "SM_HP_NUM_EPOCHS": ("training", "num_epochs", int),
        "SM_HP_WEIGHT_DECAY": ("training", "weight_decay", float),
        "SM_HP_WARMUP_STEPS": ("training", "warmup_steps", int),
        "SM_HP_EARLY_STOPPING_PATIENCE": ("training", "early_stopping_patience", int),
        "SM_HP_BASE_MODEL": ("model", "base_model", str),
        "SM_HP_SIMILARITY_THRESHOLD": ("matching", "similarity_threshold", float),
        "SM_HP_TOP_K": ("matching", "top_k", int),
        "SM_HP_NLIST": ("index", "nlist", int),
        "SM_HP_NPROBE": ("index", "nprobe", int),
        "SM_HP_MAX_DISTANCE_KM": ("location", "max_distance_km", float),
    }

    for env_key, (section, attr, dtype) in env_overrides.items():
        value = os.environ.get(env_key)
        if value is not None:
            setattr(config[section], attr, dtype(value))

    return config
