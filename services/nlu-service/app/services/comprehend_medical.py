"""Amazon Comprehend Medical integration for medical entity extraction.

Uses the DetectEntitiesV2 API to identify medical conditions, medications,
dosages, anatomy terms, tests, and procedures from clinical text.
Entities are mapped to ICD-10 and SNOMED CT codes where available.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import boto3
import structlog
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import get_settings
from app.models import MedicalEntity, MedicalEntityType

logger = structlog.get_logger(__name__)

# Mapping from Comprehend Medical category/type to our MedicalEntityType
_ENTITY_TYPE_MAP: dict[str, MedicalEntityType] = {
    "DX_NAME": MedicalEntityType.CONDITION,
    "MEDICATION": MedicalEntityType.MEDICATION,
    "GENERIC_NAME": MedicalEntityType.MEDICATION,
    "BRAND_NAME": MedicalEntityType.MEDICATION,
    "DOSAGE": MedicalEntityType.DOSAGE,
    "ANATOMY": MedicalEntityType.ANATOMY,
    "SYSTEM_ORGAN_SITE": MedicalEntityType.ANATOMY,
    "TEST_NAME": MedicalEntityType.TEST,
    "TEST_VALUE": MedicalEntityType.TEST,
    "TREATMENT_NAME": MedicalEntityType.PROCEDURE,
    "PROCEDURE_NAME": MedicalEntityType.PROCEDURE,
    "SIGN": MedicalEntityType.SYMPTOM,
    "SYMPTOM": MedicalEntityType.SYMPTOM,
    "TIME_EXPRESSION": MedicalEntityType.TIME_EXPRESSION,
    "TIME_TO_MEDICATION_NAME": MedicalEntityType.TIME_EXPRESSION,
    "TIME_TO_DX_NAME": MedicalEntityType.TIME_EXPRESSION,
    "TIME_TO_TEST_NAME": MedicalEntityType.TIME_EXPRESSION,
    "TIME_TO_PROCEDURE_NAME": MedicalEntityType.TIME_EXPRESSION,
    "TIME_TO_TREATMENT_NAME": MedicalEntityType.TIME_EXPRESSION,
}


class ComprehendMedicalClient:
    """Wrapper around Amazon Comprehend Medical APIs."""

    def __init__(self) -> None:
        settings = get_settings()
        boto_config = BotoConfig(
            region_name=settings.aws_region,
            retries={"max_attempts": 3, "mode": "standard"},
            read_timeout=60,
            connect_timeout=10,
        )

        session_kwargs: dict[str, Any] = {}
        if settings.aws_access_key_id:
            session_kwargs["aws_access_key_id"] = settings.aws_access_key_id
        if settings.aws_secret_access_key:
            session_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key

        session = boto3.Session(**session_kwargs)
        self._client = session.client(
            "comprehendmedical",
            config=boto_config,
        )
        self._confidence_threshold = settings.comprehend_medical_confidence_threshold

        logger.info(
            "comprehend_medical_initialized",
            region=settings.aws_region,
            confidence_threshold=self._confidence_threshold,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect_entities(self, text: str) -> list[MedicalEntity]:
        """Extract medical entities from text using DetectEntitiesV2.

        Parameters
        ----------
        text : str
            Clinical text (up to 20,000 bytes in UTF-8).

        Returns
        -------
        list[MedicalEntity]
            Extracted medical entities above confidence threshold.
        """
        if not text or not text.strip():
            return []

        # Comprehend Medical has a 20,000-byte limit
        encoded = text.encode("utf-8")
        if len(encoded) > 20_000:
            logger.warning(
                "text_truncated_for_comprehend",
                original_bytes=len(encoded),
            )
            # Truncate at a valid UTF-8 character boundary
            truncated = encoded[:20_000]
            # Walk back to find a valid character boundary (max 4 bytes for UTF-8)
            while truncated and (truncated[-1] & 0xC0) == 0x80:
                truncated = truncated[:-1]
            if truncated and truncated[-1] >= 0xC0:
                # Last byte is a lead byte without its continuation bytes
                truncated = truncated[:-1]
            text = truncated.decode("utf-8")

        start_time = time.monotonic()

        try:
            response = self._client.detect_entities_v2(Text=text)
        except ClientError as exc:
            logger.error(
                "comprehend_detect_entities_error",
                error=str(exc),
            )
            return []

        elapsed_ms = (time.monotonic() - start_time) * 1000
        raw_entities = response.get("Entities", [])

        entities = self._process_entities(raw_entities)

        logger.info(
            "comprehend_detect_entities_success",
            raw_count=len(raw_entities),
            filtered_count=len(entities),
            elapsed_ms=round(elapsed_ms, 1),
        )

        return entities

    def detect_icd10_codes(self, text: str) -> list[dict[str, Any]]:
        """Infer ICD-10-CM codes from text.

        Parameters
        ----------
        text : str
            Clinical text.

        Returns
        -------
        list[dict]
            List of dicts with ``code``, ``description``, and ``confidence``.
        """
        if not text or not text.strip():
            return []

        encoded = text.encode("utf-8")
        if len(encoded) > 20_000:
            truncated = encoded[:20_000]
            while truncated and (truncated[-1] & 0xC0) == 0x80:
                truncated = truncated[:-1]
            if truncated and truncated[-1] >= 0xC0:
                truncated = truncated[:-1]
            text = truncated.decode("utf-8")

        try:
            response = self._client.infer_icd10_cm(Text=text)
        except ClientError as exc:
            logger.error("comprehend_icd10_error", error=str(exc))
            return []

        results: list[dict[str, Any]] = []
        for entity in response.get("Entities", []):
            for concept in entity.get("ICD10CMConcepts", []):
                score = concept.get("Score", 0.0)
                if score >= self._confidence_threshold:
                    results.append(
                        {
                            "code": concept.get("Code", ""),
                            "description": concept.get("Description", ""),
                            "confidence": round(score, 4),
                            "entity_text": entity.get("Text", ""),
                        }
                    )

        return results

    def detect_rx_norm_codes(self, text: str) -> list[dict[str, Any]]:
        """Infer RxNorm codes for medications mentioned in text.

        Parameters
        ----------
        text : str
            Clinical text.

        Returns
        -------
        list[dict]
            List of dicts with ``code``, ``description``, and ``confidence``.
        """
        if not text or not text.strip():
            return []

        encoded = text.encode("utf-8")
        if len(encoded) > 20_000:
            truncated = encoded[:20_000]
            while truncated and (truncated[-1] & 0xC0) == 0x80:
                truncated = truncated[:-1]
            if truncated and truncated[-1] >= 0xC0:
                truncated = truncated[:-1]
            text = truncated.decode("utf-8")

        try:
            response = self._client.infer_rx_norm(Text=text)
        except ClientError as exc:
            logger.error("comprehend_rxnorm_error", error=str(exc))
            return []

        results: list[dict[str, Any]] = []
        for entity in response.get("Entities", []):
            for concept in entity.get("RxNormConcepts", []):
                score = concept.get("Score", 0.0)
                if score >= self._confidence_threshold:
                    results.append(
                        {
                            "code": concept.get("Code", ""),
                            "description": concept.get("Description", ""),
                            "confidence": round(score, 4),
                            "entity_text": entity.get("Text", ""),
                        }
                    )

        return results

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _process_entities(
        self, raw_entities: list[dict[str, Any]]
    ) -> list[MedicalEntity]:
        """Convert raw Comprehend Medical entities to our domain model."""
        entities: list[MedicalEntity] = []

        for raw in raw_entities:
            score = raw.get("Score", 0.0)
            if score < self._confidence_threshold:
                continue

            category = raw.get("Category", "")
            entity_type_str = raw.get("Type", "")
            mapped_type = _ENTITY_TYPE_MAP.get(
                entity_type_str,
                _ENTITY_TYPE_MAP.get(category, MedicalEntityType.CONDITION),
            )

            # Extract ICD-10 codes from concepts
            icd10_codes: list[str] = []
            snomed_codes: list[str] = []
            for concept in raw.get("ICD10CMConcepts", []):
                if concept.get("Score", 0) >= self._confidence_threshold:
                    code = concept.get("Code", "")
                    if code:
                        icd10_codes.append(code)
            for concept in raw.get("SNOMEDCTConcepts", []):
                if concept.get("Score", 0) >= self._confidence_threshold:
                    code = concept.get("Code", "")
                    if code:
                        snomed_codes.append(code)

            # Extract attributes (dosage, frequency, route, etc.)
            attributes: dict[str, Any] = {}
            for attr in raw.get("Attributes", []):
                attr_type = attr.get("Type", "unknown")
                attr_text = attr.get("Text", "")
                attr_score = attr.get("Score", 0.0)
                if attr_score >= self._confidence_threshold:
                    attributes[attr_type.lower()] = attr_text

            # Check for negation in traits
            is_negated = False
            for trait in raw.get("Traits", []):
                if trait.get("Name") == "NEGATION" and trait.get("Score", 0) > 0.5:
                    is_negated = True
                    break

            if is_negated:
                attributes["negated"] = True

            entity = MedicalEntity(
                text=raw.get("Text", ""),
                entity_type=mapped_type,
                category=category,
                icd10_codes=icd10_codes,
                snomed_codes=snomed_codes,
                confidence=round(score, 4),
                attributes=attributes,
                begin_offset=raw.get("BeginOffset"),
                end_offset=raw.get("EndOffset"),
            )
            entities.append(entity)

        return entities


# Module-level singleton
_comprehend_client: Optional[ComprehendMedicalClient] = None


def get_comprehend_client() -> ComprehendMedicalClient:
    """Get or create the singleton ComprehendMedicalClient instance."""
    global _comprehend_client
    if _comprehend_client is None:
        _comprehend_client = ComprehendMedicalClient()
    return _comprehend_client
