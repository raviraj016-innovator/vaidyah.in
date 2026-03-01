"""Symptom extraction service combining Claude (Bedrock) and Comprehend Medical.

Pipeline:
1. Run Comprehend Medical entity extraction for structured NER.
2. Run Claude prompt-based extraction for deeper semantic understanding.
3. Merge and deduplicate results.
4. Normalize terms and map to ICD-10 codes.
"""

from __future__ import annotations

import json
import time
from typing import Any

import structlog

from app.config import settings
from app.models import (
    BodySystem,
    MedicalEntity,
    Severity,
    Symptom,
    SupportedLanguage,
)
from app.services.bedrock_client import BedrockClient, get_bedrock_client
from app.services.comprehend_medical import (
    ComprehendMedicalClient,
    get_comprehend_client,
)
from app.services.medical_prompts import SYSTEM_PROMPT_SYMPTOM_EXTRACTION
from app.utils.medical_normalizer import MedicalNormalizer

logger = structlog.get_logger(__name__)


class SymptomExtractor:
    """Extracts structured symptoms from patient conversation text."""

    def __init__(
        self,
        bedrock_client: BedrockClient | None = None,
        comprehend_client: ComprehendMedicalClient | None = None,
        normalizer: MedicalNormalizer | None = None,
    ) -> None:
        self._bedrock = bedrock_client or get_bedrock_client()
        self._comprehend = comprehend_client or get_comprehend_client()
        self._normalizer = normalizer or MedicalNormalizer()

    async def extract(
        self,
        text: str,
        language: SupportedLanguage = SupportedLanguage.ENGLISH,
        include_negated: bool = True,
    ) -> dict[str, Any]:
        """Extract symptoms from transcript text.

        Returns
        -------
        dict
            ``symptoms`` (list[Symptom]), ``medical_entities`` (list[MedicalEntity]),
            ``processing_time_ms`` (float).
        """
        start_time = time.monotonic()

        # Step 1: Comprehend Medical entity extraction (English text only)
        comprehend_entities: list[MedicalEntity] = []
        if settings.comprehend_medical_enabled:
            english_text = self._normalizer.transliterate_to_english(text, language)
            comprehend_entities = self._comprehend.detect_entities(english_text)
            logger.info(
                "comprehend_extraction_done",
                entity_count=len(comprehend_entities),
            )

        # Step 2: Claude-based extraction
        claude_symptoms = self._extract_via_claude(text, language)
        logger.info(
            "claude_extraction_done",
            symptom_count=len(claude_symptoms),
        )

        # Step 3: Merge results
        merged = self._merge_symptoms(claude_symptoms, comprehend_entities)

        # Step 4: Normalize and enrich
        normalized = [self._normalize_symptom(s) for s in merged]

        # Step 5: Filter negated if not requested
        if not include_negated:
            normalized = [s for s in normalized if not s.negated]

        elapsed_ms = (time.monotonic() - start_time) * 1000

        return {
            "symptoms": normalized,
            "medical_entities": comprehend_entities,
            "processing_time_ms": round(elapsed_ms, 1),
        }

    # ------------------------------------------------------------------
    # Claude extraction
    # ------------------------------------------------------------------

    def _extract_via_claude(
        self, text: str, language: SupportedLanguage
    ) -> list[Symptom]:
        """Use Claude (via Bedrock) to extract symptoms from text."""
        user_message = (
            f"Language: {language.value}\n\n"
            f"Patient transcript:\n\"\"\"\n{text}\n\"\"\"\n\n"
            "Extract all symptoms from the transcript above. Return JSON array only."
        )

        try:
            result = self._bedrock.invoke_and_parse_json(
                system_prompt=SYSTEM_PROMPT_SYMPTOM_EXTRACTION,
                user_message=user_message,
                temperature=0.05,
            )
            raw_data = result["data"]
        except Exception:
            logger.exception("claude_symptom_extraction_failed")
            return []

        # Parse the raw JSON into Symptom objects
        symptom_list: list[dict[str, Any]] = []
        if isinstance(raw_data, list):
            symptom_list = raw_data
        elif isinstance(raw_data, dict) and "symptoms" in raw_data:
            symptom_list = raw_data["symptoms"]

        symptoms: list[Symptom] = []
        for item in symptom_list:
            try:
                symptom = Symptom(
                    name=item.get("name", "unknown"),
                    original_text=item.get("original_text", ""),
                    severity=self._parse_severity(item.get("severity", "unknown")),
                    duration=item.get("duration"),
                    onset=item.get("onset"),
                    body_system=self._parse_body_system(
                        item.get("body_system", "unknown")
                    ),
                    icd10_code=item.get("icd10_code"),
                    confidence=float(item.get("confidence", 0.0)),
                    negated=bool(item.get("negated", False)),
                    qualifiers=item.get("qualifiers", []),
                )
                symptoms.append(symptom)
            except Exception:
                logger.warning(
                    "symptom_parse_error",
                    raw_item=item,
                )
                continue

        return symptoms

    # ------------------------------------------------------------------
    # Merging
    # ------------------------------------------------------------------

    def _merge_symptoms(
        self,
        claude_symptoms: list[Symptom],
        comprehend_entities: list[MedicalEntity],
    ) -> list[Symptom]:
        """Merge Claude-extracted symptoms with Comprehend Medical entities.

        Claude output is treated as primary. Comprehend entities that are
        symptoms/conditions and NOT already captured by Claude are added.
        Overlapping entries get their confidence boosted.
        """
        merged = list(claude_symptoms)
        claude_names_lower = {s.name.lower() for s in claude_symptoms}

        from app.models import MedicalEntityType

        symptom_entity_types = {
            MedicalEntityType.SYMPTOM,
            MedicalEntityType.CONDITION,
        }

        for entity in comprehend_entities:
            if entity.entity_type not in symptom_entity_types:
                continue

            normalized_name = self._normalizer.normalize_term(entity.text)
            if normalized_name.lower() in claude_names_lower:
                # Boost confidence for matching symptoms
                for s in merged:
                    if s.name.lower() == normalized_name.lower():
                        s.confidence = min(1.0, s.confidence + 0.05)
                continue

            # Add as a new symptom from Comprehend
            new_symptom = Symptom(
                name=normalized_name,
                original_text=entity.text,
                severity=Severity.UNKNOWN,
                body_system=BodySystem.UNKNOWN,
                icd10_code=(
                    entity.icd10_codes[0] if entity.icd10_codes else None
                ),
                confidence=entity.confidence,
                negated=entity.attributes.get("negated", False),
            )
            merged.append(new_symptom)

        return merged

    # ------------------------------------------------------------------
    # Normalization
    # ------------------------------------------------------------------

    def _normalize_symptom(self, symptom: Symptom) -> Symptom:
        """Normalize the symptom name and enrich with ICD-10 if missing."""
        normalized_name = self._normalizer.normalize_term(symptom.name)
        if normalized_name != symptom.name:
            symptom.name = normalized_name

        # Try to fill in ICD-10 if missing
        if not symptom.icd10_code:
            icd_code = self._normalizer.get_icd10_code(normalized_name)
            if icd_code:
                symptom.icd10_code = icd_code

        return symptom

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_severity(val: str) -> Severity:
        try:
            return Severity(val.lower())
        except ValueError:
            return Severity.UNKNOWN

    @staticmethod
    def _parse_body_system(val: str) -> BodySystem:
        try:
            return BodySystem(val.lower())
        except ValueError:
            return BodySystem.UNKNOWN
