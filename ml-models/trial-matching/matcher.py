"""
Trial Matching Model - Matcher
Multi-factor clinical trial matching using sentence-transformer embeddings,
FAISS similarity search, rule-based exclusion checking, and location proximity.
"""

import math
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import faiss
import numpy as np
import torch
from geopy.distance import geodesic
from sentence_transformers import SentenceTransformer

from .config import (
    IndexConfig,
    InferenceConfig,
    LocationConfig,
    MatchingConfig,
    ModelConfig,
    ScoringThresholds,
)


class TrialMatcher:
    """
    Matches patient profiles to clinical trials using a combination of
    semantic similarity, rule-based eligibility, demographic fit, and
    geographic proximity.
    """

    def __init__(
        self,
        model_config: Optional[ModelConfig] = None,
        matching_config: Optional[MatchingConfig] = None,
        index_config: Optional[IndexConfig] = None,
        location_config: Optional[LocationConfig] = None,
        inference_config: Optional[InferenceConfig] = None,
        scoring_thresholds: Optional[ScoringThresholds] = None,
    ) -> None:
        self.model_config = model_config or ModelConfig()
        self.matching_config = matching_config or MatchingConfig()
        self.index_config = index_config or IndexConfig()
        self.location_config = location_config or LocationConfig()
        self.inference_config = inference_config or InferenceConfig()
        self.scoring = scoring_thresholds or ScoringThresholds()

        self.model = SentenceTransformer(self.model_config.base_model)
        self.model.max_seq_length = self.model_config.max_seq_length

        self.index: Optional[faiss.Index] = None
        self._trial_metadata: List[Dict[str, Any]] = []
        # Bug 7 fix: cache stores (embedding, timestamp) tuples for TTL enforcement
        self._embedding_cache: OrderedDict[str, Tuple[np.ndarray, float]] = OrderedDict()
        self._max_cache_size = self.inference_config.cache_max_entries if hasattr(self.inference_config, 'cache_max_entries') else 10000
        self._cache_ttl_seconds = self.inference_config.cache_ttl_sec if hasattr(self.inference_config, 'cache_ttl_sec') else 3600

    # ------------------------------------------------------------------ #
    # Encoding
    # ------------------------------------------------------------------ #

    def _encode(self, texts: List[str]) -> np.ndarray:
        embeddings = self.model.encode(
            texts,
            batch_size=self.inference_config.batch_size,
            normalize_embeddings=self.model_config.normalize_embeddings,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return embeddings.astype(np.float32)

    def encode_patient_profile(self, profile: Dict[str, Any]) -> np.ndarray:
        """
        Convert a patient profile into a single embedding.

        Expected profile keys:
            conditions:  list[str]  - diagnosed conditions
            medications: list[str]  - current medications
            symptoms:    list[str]  - reported symptoms
            demographics: dict      - age, gender, ethnicity
            notes:       str        - free-text clinical notes (optional)
        """
        parts: List[str] = []

        if profile.get("conditions"):
            parts.append("conditions: " + ", ".join(profile["conditions"]))

        if profile.get("medications"):
            parts.append("medications: " + ", ".join(profile["medications"]))

        if profile.get("symptoms"):
            parts.append("symptoms: " + ", ".join(profile["symptoms"]))

        demographics = profile.get("demographics", {})
        if demographics:
            demo_parts = []
            if "age" in demographics:
                demo_parts.append(f"age {demographics['age']}")
            if "gender" in demographics:
                demo_parts.append(demographics["gender"])
            if demo_parts:
                parts.append("demographics: " + ", ".join(demo_parts))

        if profile.get("notes"):
            parts.append(profile["notes"])

        text = ". ".join(parts) if parts else ""
        patient_id = profile.get("patient_id", "")
        cache_key = f"{patient_id}:{text}" if patient_id else text

        # Bug 7 fix: check cache with TTL enforcement
        if self.inference_config.cache_embeddings and cache_key in self._embedding_cache:
            cached_embedding, cached_time = self._embedding_cache[cache_key]
            if time.time() - cached_time <= self._cache_ttl_seconds:
                return cached_embedding
            else:
                # Evict expired entry
                del self._embedding_cache[cache_key]

        embedding = self._encode([text])[0]

        # Bug 7 fix: store embedding with timestamp
        if self.inference_config.cache_embeddings:
            self._embedding_cache[cache_key] = (embedding, time.time())
            if len(self._embedding_cache) > self._max_cache_size:
                self._embedding_cache.popitem(last=False)

        return embedding

    def encode_trial_criteria(self, trial: Dict[str, Any]) -> np.ndarray:
        """
        Convert trial eligibility criteria into an embedding.

        Expected trial keys:
            title:              str
            inclusion_criteria: list[str]
            exclusion_criteria: list[str]
            conditions:         list[str]
            phase:              str
        """
        parts: List[str] = []

        if trial.get("title"):
            parts.append(trial["title"])

        if trial.get("conditions"):
            parts.append("conditions: " + ", ".join(trial["conditions"]))

        if trial.get("inclusion_criteria"):
            parts.append(
                "inclusion: " + "; ".join(trial["inclusion_criteria"])
            )

        # Bug 5 fix: include exclusion criteria in the trial semantic embedding
        if trial.get("exclusion_criteria"):
            parts.append("exclusion: " + "; ".join(trial["exclusion_criteria"]))

        text = ". ".join(parts) if parts else ""
        return self._encode([text])[0]

    # ------------------------------------------------------------------ #
    # Index management
    # ------------------------------------------------------------------ #

    def build_index(self, trials: List[Dict[str, Any]]) -> None:
        """Build a FAISS index from a list of trial metadata dicts."""
        self._trial_metadata = trials
        embeddings = np.stack(
            [self.encode_trial_criteria(t) for t in trials]
        )
        dim = embeddings.shape[1]

        if self.index_config.index_type == "IVFFlat" and len(trials) >= self.index_config.nlist:
            quantizer = faiss.IndexFlatIP(dim)
            self.index = faiss.IndexIVFFlat(
                quantizer, dim, self.index_config.nlist, faiss.METRIC_INNER_PRODUCT
            )
            self.index.nprobe = self.index_config.nprobe
            self.index.train(embeddings)
        else:
            self.index = faiss.IndexFlatIP(dim)

        self.index.add(embeddings)

    def save_index(self, path: Optional[str] = None) -> None:
        path = path or self.index_config.index_path
        if self.index is not None:
            faiss.write_index(self.index, path)

    def load_index(
        self, path: Optional[str] = None, trials: Optional[List[Dict[str, Any]]] = None
    ) -> None:
        path = path or self.index_config.index_path
        self.index = faiss.read_index(path)
        if trials is not None:
            self._trial_metadata = trials

    # ------------------------------------------------------------------ #
    # Scoring
    # ------------------------------------------------------------------ #

    def compute_match_score(
        self,
        patient: Dict[str, Any],
        trial: Dict[str, Any],
        semantic_similarity: float,
        patient_embedding: Optional[np.ndarray] = None,
    ) -> Dict[str, float]:
        """
        Compute a multi-factor match score.

        Returns a dict with individual factor scores and a weighted composite.
        """
        weights = self.matching_config.feature_weights

        condition_score = self._score_conditions(patient, trial)
        demographic_score = self._score_demographics(patient, trial)
        location_score = self._score_location(patient, trial)
        # Bug 4 fix: pass pre-computed patient_embedding to avoid recomputation
        eligibility_score = self._score_eligibility(patient, trial, patient_embedding=patient_embedding)

        composite = (
            weights["semantic_similarity"] * semantic_similarity
            + weights["conditions"] * condition_score
            + weights["demographics"] * demographic_score
            + weights["location"] * location_score
            + weights["eligibility"] * eligibility_score
        )

        if condition_score == 1.0:
            composite = min(1.0, composite + self.matching_config.boost_exact_condition_match)

        return {
            "composite": round(composite, 4),
            "semantic_similarity": round(semantic_similarity, 4),
            "conditions": round(condition_score, 4),
            "demographics": round(demographic_score, 4),
            "location": round(location_score, 4),
            "eligibility": round(eligibility_score, 4),
        }

    def _score_conditions(self, patient: Dict[str, Any], trial: Dict[str, Any]) -> float:
        patient_conditions = set(
            c.lower() for c in patient.get("conditions", [])
        )
        trial_conditions = set(
            c.lower() for c in trial.get("conditions", [])
        )
        if not trial_conditions:
            return 0.5
        overlap = patient_conditions & trial_conditions
        return len(overlap) / len(trial_conditions)

    def _score_demographics(self, patient: Dict[str, Any], trial: Dict[str, Any]) -> float:
        demographics = patient.get("demographics", {})
        criteria = trial.get("demographic_criteria", {})
        if not criteria:
            return 1.0

        scores: List[float] = []

        age = demographics.get("age")
        if age is not None:
            min_age = criteria.get("min_age", 0)
            max_age = criteria.get("max_age", 120)
            scores.append(1.0 if min_age <= age <= max_age else 0.0)

        gender = demographics.get("gender", "").lower()
        required_gender = criteria.get("gender", "").lower()
        if required_gender and required_gender != "all":
            scores.append(1.0 if gender == required_gender else 0.0)

        return sum(scores) / len(scores) if scores else 1.0

    def _score_location(self, patient: Dict[str, Any], trial: Dict[str, Any]) -> float:
        patient_loc = patient.get("location")
        trial_loc = trial.get("location")
        if not patient_loc or not trial_loc:
            return 0.5

        try:
            patient_coords = (patient_loc["lat"], patient_loc["lon"])
            trial_coords = (trial_loc["lat"], trial_loc["lon"])
            distance_km = geodesic(patient_coords, trial_coords).km
        except (KeyError, TypeError):
            return 0.5

        if distance_km >= self.location_config.max_distance_km:
            return 0.0
        return math.exp(-self.location_config.distance_decay_factor * distance_km)

    def _score_eligibility(
        self,
        patient: Dict[str, Any],
        trial: Dict[str, Any],
        patient_embedding: Optional[np.ndarray] = None,
    ) -> float:
        inclusion = trial.get("inclusion_criteria", [])
        if not inclusion:
            return 0.5

        # Bug 4 fix: use pre-computed patient embedding if provided
        if patient_embedding is None:
            patient_embedding = self.encode_patient_profile(patient)
        criteria_texts = inclusion
        criteria_embeddings = self._encode(criteria_texts)

        similarities = np.dot(criteria_embeddings, patient_embedding)
        met_criteria = int(np.sum(similarities >= self.matching_config.similarity_threshold))
        return met_criteria / len(criteria_texts)

    # ------------------------------------------------------------------ #
    # Hard exclusions (rule-based)
    # ------------------------------------------------------------------ #

    def check_hard_exclusions(
        self, patient: Dict[str, Any], trial: Dict[str, Any]
    ) -> Tuple[bool, List[str]]:
        """
        Rule-based exclusion checking.

        Returns:
            (is_excluded, list_of_reasons)
        """
        reasons: List[str] = []
        demographics = patient.get("demographics", {})
        criteria = trial.get("demographic_criteria", {})

        age = demographics.get("age")
        if age is not None:
            min_age = criteria.get("min_age")
            max_age = criteria.get("max_age")
            if min_age is not None and age < min_age:
                reasons.append(f"Patient age {age} below minimum {min_age}")
            if max_age is not None and age > max_age:
                reasons.append(f"Patient age {age} above maximum {max_age}")

        gender = demographics.get("gender", "").lower()
        required_gender = criteria.get("gender", "").lower()
        if required_gender and required_gender != "all" and gender and gender != required_gender:
            reasons.append(
                f"Patient gender '{gender}' does not match required '{required_gender}'"
            )

        patient_conditions = set(c.lower() for c in patient.get("conditions", []))
        excluded_conditions = set(
            c.lower() for c in trial.get("excluded_conditions", [])
        )
        overlap = patient_conditions & excluded_conditions
        if overlap:
            reasons.append(f"Patient has excluded conditions: {', '.join(sorted(overlap))}")

        patient_meds = set(m.lower() for m in patient.get("medications", []))
        excluded_meds = set(
            m.lower() for m in trial.get("excluded_medications", [])
        )
        med_overlap = patient_meds & excluded_meds
        if med_overlap:
            reasons.append(
                f"Patient is on excluded medications: {', '.join(sorted(med_overlap))}"
            )

        return (len(reasons) > 0, reasons)

    # ------------------------------------------------------------------ #
    # Top-level ranking
    # ------------------------------------------------------------------ #

    def rank_trials(
        self,
        patient: Dict[str, Any],
        trials: Optional[List[Dict[str, Any]]] = None,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return top-k trial matches with scores and eligibility breakdown.

        If an index has been built, it is used for the initial retrieval
        pass.  Otherwise, trials must be passed directly.
        """
        top_k = top_k or self.matching_config.top_k
        # Bug 4 fix: compute patient embedding once and pass it through
        patient_embedding = self.encode_patient_profile(patient)

        if self.index is not None and trials is None:
            candidates = self._retrieve_from_index(patient_embedding, top_k * 3)
        elif trials is not None:
            candidates = self._retrieve_brute_force(patient_embedding, trials, top_k * 3)
        else:
            raise ValueError("Either build an index or provide trials directly")

        results: List[Dict[str, Any]] = []
        for sim, trial in candidates:
            is_excluded, exclusion_reasons = self.check_hard_exclusions(patient, trial)
            if is_excluded:
                continue

            scores = self.compute_match_score(patient, trial, sim, patient_embedding=patient_embedding)
            if scores["composite"] < self.matching_config.min_eligibility_score:
                continue

            quality = self.scoring.get_quality(scores["composite"])
            results.append({
                "trial_id": trial.get("id", ""),
                "title": trial.get("title", ""),
                "scores": scores,
                "match_quality": quality,
                "phase": trial.get("phase", ""),
                "conditions": trial.get("conditions", []),
            })

        results.sort(key=lambda x: x["scores"]["composite"], reverse=True)
        return results[:top_k]

    def _retrieve_from_index(
        self, query_embedding: np.ndarray, k: int
    ) -> List[Tuple[float, Dict[str, Any]]]:
        # Bug 3 fix: guard against empty metadata when index was loaded without trials
        if not self._trial_metadata:
            raise ValueError(
                "Trial metadata is empty. When using load_index(), you must also "
                "provide the 'trials' parameter so that retrieved indices can be "
                "mapped back to trial metadata."
            )
        query = query_embedding.reshape(1, -1)
        scores, indices = self.index.search(query, min(k, self.index.ntotal))
        candidates: List[Tuple[float, Dict[str, Any]]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            candidates.append((float(score), self._trial_metadata[int(idx)]))
        return candidates

    def _retrieve_brute_force(
        self,
        query_embedding: np.ndarray,
        trials: List[Dict[str, Any]],
        k: int,
    ) -> List[Tuple[float, Dict[str, Any]]]:
        # Bug 6 fix: return empty list if trials is empty
        if not trials:
            return []
        trial_embeddings = np.stack(
            [self.encode_trial_criteria(t) for t in trials]
        )
        similarities = np.dot(trial_embeddings, query_embedding)
        top_indices = np.argsort(similarities)[::-1][:k]
        return [
            (float(similarities[i]), trials[i]) for i in top_indices
        ]

    # ------------------------------------------------------------------ #
    # Cache management
    # ------------------------------------------------------------------ #

    def clear_cache(self) -> None:
        self._embedding_cache.clear()
