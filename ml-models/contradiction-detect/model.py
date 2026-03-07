"""
Contradiction Detection Model - Model Definition
Fine-tuned BERT for medical text entailment with contradiction-type
classification and severity mapping.
"""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import BertModel, BertTokenizer

from .config import (
    CONTRADICTION_TYPES,
    ENTAILMENT_LABELS,
    ContradictionTypeConfig,
    ClinicalThresholds,
    InferenceConfig,
    ModelConfig,
)


class ContradictionDetector(nn.Module):
    """
    BERT-based detector for contradictions in medical text pairs.

    Takes a premise (e.g. patient history statement) and a hypothesis
    (e.g. newly reported symptom) and classifies the relationship as
    entailment, neutral, or contradiction.  When a contradiction is
    detected the model further classifies it into a clinical
    contradiction type and assigns a severity level.
    """

    def __init__(
        self,
        model_config: Optional[ModelConfig] = None,
        type_config: Optional[ContradictionTypeConfig] = None,
    ) -> None:
        super().__init__()
        self.model_config = model_config or ModelConfig()
        self.type_config = type_config or ContradictionTypeConfig()

        self.encoder = BertModel.from_pretrained(self.model_config.base_model)
        self._apply_freezing()

        self.entailment_head = nn.Sequential(
            nn.Linear(self.model_config.hidden_dim, self.model_config.classifier_hidden),
            nn.GELU(),
            nn.Dropout(self.model_config.classifier_dropout),
            nn.Linear(self.model_config.classifier_hidden, self.model_config.num_labels),
        )

        self.type_head = nn.Sequential(
            nn.Linear(self.model_config.hidden_dim, self.model_config.classifier_hidden),
            nn.GELU(),
            nn.Dropout(self.model_config.classifier_dropout),
            nn.Linear(self.model_config.classifier_hidden, self.type_config.num_types),
        )

        self._tokenizer: Optional[BertTokenizer] = None

    # ------------------------------------------------------------------ #
    # Freezing helpers
    # ------------------------------------------------------------------ #

    def _apply_freezing(self) -> None:
        if self.model_config.freeze_embeddings:
            for param in self.encoder.embeddings.parameters():
                param.requires_grad = False

        for i, layer in enumerate(self.encoder.encoder.layer):
            if i < self.model_config.freeze_encoder_layers:
                for param in layer.parameters():
                    param.requires_grad = False

    # ------------------------------------------------------------------ #
    # Tokenizer
    # ------------------------------------------------------------------ #

    @property
    def tokenizer(self) -> BertTokenizer:
        if self._tokenizer is None:
            self._tokenizer = BertTokenizer.from_pretrained(
                self.model_config.base_model
            )
        return self._tokenizer

    # ------------------------------------------------------------------ #
    # Forward
    # ------------------------------------------------------------------ #

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        token_type_ids: torch.Tensor,
    ) -> Dict[str, torch.Tensor]:
        """
        Forward pass.

        Args:
            input_ids:      (B, L) token ids for [CLS] premise [SEP] hypothesis [SEP]
            attention_mask: (B, L) attention mask
            token_type_ids: (B, L) segment ids (0 = premise, 1 = hypothesis)

        Returns:
            dict with keys:
                entailment_logits: (B, 3) logits for entailment / neutral / contradiction
                type_logits:       (B, num_types) logits for contradiction type
        """
        outputs = self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )
        cls_hidden = outputs.last_hidden_state[:, 0, :]

        entailment_logits = self.entailment_head(cls_hidden)
        type_logits = self.type_head(cls_hidden)

        return {
            "entailment_logits": entailment_logits,
            "type_logits": type_logits,
        }

    # ------------------------------------------------------------------ #
    # Input preparation
    # ------------------------------------------------------------------ #

    def prepare_inputs(
        self,
        premises: List[str],
        hypotheses: List[str],
        max_length: Optional[int] = None,
        device: Optional[torch.device] = None,
    ) -> Dict[str, torch.Tensor]:
        """Convert raw medical text pairs into model-ready tensors."""
        if not premises or not hypotheses:
            raise ValueError("premises and hypotheses must be non-empty lists")
        if len(premises) != len(hypotheses):
            raise ValueError(
                f"premises and hypotheses must have the same length, "
                f"got {len(premises)} and {len(hypotheses)}"
            )

        max_length = max_length or self.model_config.max_seq_length
        device = device or next(self.parameters()).device

        # Bug 11 fix: pad to longest in batch instead of max_length for efficiency
        encoded = self.tokenizer(
            premises,
            hypotheses,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )

        return {
            "input_ids": encoded["input_ids"].to(device),
            "attention_mask": encoded["attention_mask"].to(device),
            "token_type_ids": encoded["token_type_ids"].to(device),
        }

    # ------------------------------------------------------------------ #
    # Prediction post-processing
    # ------------------------------------------------------------------ #

    @torch.no_grad()
    def predict(
        self,
        premises: List[str],
        hypotheses: List[str],
        inference_config: Optional[InferenceConfig] = None,
        thresholds: Optional[ClinicalThresholds] = None,
    ) -> List[Dict]:
        """
        End-to-end inference: raw text pairs -> structured contradiction results.

        Returns a list of dicts, one per input pair, each containing:
            label:              entailment | neutral | contradiction
            confidence:         float
            contradiction_type: str or None
            type_confidence:    float or None
            severity:           str or None
            requires_escalation: bool
        """
        self.eval()
        inference_config = inference_config or InferenceConfig()
        thresholds = thresholds or ClinicalThresholds()

        # Bug 2 fix: process inputs in batches to avoid OOM on large inputs
        batch_size = inference_config.batch_size
        all_entailment_probs = []
        all_type_probs = []

        for start in range(0, len(premises), batch_size):
            end = start + batch_size
            batch_premises = premises[start:end]
            batch_hypotheses = hypotheses[start:end]

            inputs = self.prepare_inputs(
                batch_premises, batch_hypotheses, max_length=inference_config.max_seq_length
            )
            outputs = self.forward(**inputs)

            all_entailment_probs.append(F.softmax(outputs["entailment_logits"], dim=-1))
            all_type_probs.append(F.softmax(outputs["type_logits"], dim=-1))

        if not all_entailment_probs:
            return []
        entailment_probs = torch.cat(all_entailment_probs, dim=0)
        type_probs = torch.cat(all_type_probs, dim=0)

        results: List[Dict] = []
        for i in range(len(premises)):
            ent_prob = entailment_probs[i]
            pred_label_idx = int(torch.argmax(ent_prob).item())
            confidence = float(ent_prob[pred_label_idx].item())
            label = ENTAILMENT_LABELS[pred_label_idx]

            result: Dict = {
                "label": label,
                "confidence": confidence,
                "contradiction_type": None,
                "type_confidence": None,
                "severity": None,
                "requires_escalation": False,
            }

            if label == "contradiction" and confidence >= inference_config.confidence_threshold:
                type_prob = type_probs[i]
                type_idx = int(torch.argmax(type_prob).item())
                type_idx = min(type_idx, len(CONTRADICTION_TYPES) - 1)
                type_conf = float(type_prob[type_idx].item())
                contradiction_type = CONTRADICTION_TYPES[type_idx]
                severity = thresholds.get_severity(confidence)

                result.update({
                    "contradiction_type": contradiction_type,
                    "type_confidence": type_conf,
                    "severity": severity,
                    "requires_escalation": thresholds.requires_escalation(
                        contradiction_type, severity
                    ),
                })

            if inference_config.return_all_scores:
                result["all_scores"] = {
                    ENTAILMENT_LABELS[j]: float(ent_prob[j].item())
                    for j in range(len(ENTAILMENT_LABELS))
                }
                result["all_type_scores"] = {
                    CONTRADICTION_TYPES[j]: float(type_probs[i][j].item())
                    for j in range(len(CONTRADICTION_TYPES))
                }

            results.append(result)

        return results

    # ------------------------------------------------------------------ #
    # Serialisation helpers
    # ------------------------------------------------------------------ #

    def save_model(self, path: str) -> None:
        """Save model weights and config to a directory.

        Creates ``path/model.pt`` (weights only) and ``path/config.json``
        (dataclass configs as JSON) so that ``load_model`` can use
        ``weights_only=True`` safely.
        """
        save_dir = Path(path)
        save_dir.mkdir(parents=True, exist_ok=True)
        torch.save(self.state_dict(), save_dir / "model.pt")
        with open(save_dir / "config.json", "w") as f:
            json.dump(
                {
                    "model_config": asdict(self.model_config),
                    "type_config": asdict(self.type_config),
                },
                f,
                indent=2,
            )

    @classmethod
    def load_model(cls, path: str, device: str = "cpu") -> "ContradictionDetector":
        load_dir = Path(path)
        config_path = load_dir / "config.json"
        weights_path = load_dir / "model.pt"

        if config_path.exists() and weights_path.exists():
            with open(config_path) as f:
                configs = json.load(f)
            model = cls(
                model_config=ModelConfig(**configs["model_config"]),
                type_config=ContradictionTypeConfig(**configs["type_config"]),
            )
            model.load_state_dict(
                torch.load(weights_path, map_location=device, weights_only=True)
            )
        else:
            # Legacy fallback: single-file checkpoint (pre-separation format)
            checkpoint = torch.load(path, map_location=device, weights_only=False)
            model = cls(
                model_config=checkpoint["model_config"],
                type_config=checkpoint["type_config"],
            )
            model.load_state_dict(checkpoint["model_state_dict"])

        model.to(device)
        model.eval()
        return model
