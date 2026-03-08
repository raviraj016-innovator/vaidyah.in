"""Tests for prompt engineering templates and generation logic."""

from __future__ import annotations

import pytest

from app.services.medical_prompts import (
    SYSTEM_PROMPT_CONTRADICTION_CHECK,
    SYSTEM_PROMPT_CLINICAL_REASONING,
    SYSTEM_PROMPT_FOLLOWUP_GENERATION,
    SYSTEM_PROMPT_SYMPTOM_EXTRACTION,
    SYSTEM_PROMPT_TRANSLATION,
)


class TestSymptomExtractionPrompt:
    """Verify the symptom extraction system prompt structure."""

    def test_prompt_includes_json_output_format(self):
        """The prompt instructs the model to return JSON."""
        assert "JSON" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION
        assert "Return ONLY" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION

    def test_prompt_includes_hindi_medical_terms(self):
        """The prompt includes Hindi-to-English symptom mappings for India context."""
        hindi_terms = ["sir dard", "bukhar", "khansi", "pet mein dard", "chakkar"]
        for term in hindi_terms:
            assert term in SYSTEM_PROMPT_SYMPTOM_EXTRACTION, (
                f"Expected Hindi term '{term}' in symptom extraction prompt"
            )

    def test_prompt_includes_severity_levels(self):
        """The prompt defines all severity levels."""
        for level in ["mild", "moderate", "severe", "critical", "unknown"]:
            assert level in SYSTEM_PROMPT_SYMPTOM_EXTRACTION

    def test_prompt_includes_negation_detection(self):
        """The prompt covers negation detection rules."""
        assert "negat" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION.lower()
        assert "bukhar nahi hai" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION

    def test_prompt_includes_body_systems(self):
        """The prompt references body system categorization."""
        assert "body_system" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION
        assert "cardiovascular" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION
        assert "respiratory" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION
        assert "neurological" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION

    def test_prompt_includes_icd10_mapping(self):
        """The prompt mentions ICD-10 code mapping."""
        assert "ICD-10" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION
        assert "icd10_code" in SYSTEM_PROMPT_SYMPTOM_EXTRACTION


class TestContradictionPrompt:
    """Verify the contradiction detection system prompt."""

    def test_contradiction_categories(self):
        """The prompt defines all contradiction categories."""
        categories = [
            "Symptom Conflicts",
            "Medication Conflicts",
            "Temporal Inconsistencies",
            "Vital-Symptom Mismatches",
        ]
        for cat in categories:
            assert cat in SYSTEM_PROMPT_CONTRADICTION_CHECK, (
                f"Missing category '{cat}' in contradiction prompt"
            )

    def test_contradiction_severity_levels(self):
        """The prompt defines severity levels."""
        for sev in ["low", "medium", "high", "critical"]:
            assert sev in SYSTEM_PROMPT_CONTRADICTION_CHECK

    def test_contradiction_prompt_includes_history(self):
        """The prompt considers medical history conflicts."""
        assert "medical history" in SYSTEM_PROMPT_CONTRADICTION_CHECK.lower()
        assert "History-Symptom Conflicts" in SYSTEM_PROMPT_CONTRADICTION_CHECK

    def test_contradiction_prompt_indian_context(self):
        """The prompt includes India-specific healthcare context."""
        assert "Ayurveda" in SYSTEM_PROMPT_CONTRADICTION_CHECK
        assert "Unani" in SYSTEM_PROMPT_CONTRADICTION_CHECK


class TestClinicalReasoningPrompt:
    """Verify the clinical reasoning system prompt."""

    def test_reasoning_steps(self):
        """The prompt defines the step-by-step clinical reasoning process."""
        steps = [
            "Problem Representation",
            "Identify Key Features",
            "Generate Differential Diagnoses",
            "Red Flags",
            "Indian Epidemiological Context",
            "Recommended Investigations",
        ]
        for step in steps:
            assert step in SYSTEM_PROMPT_CLINICAL_REASONING, (
                f"Missing reasoning step '{step}'"
            )

    def test_reasoning_prompt_indian_diseases(self):
        """The prompt covers India-prevalent diseases."""
        diseases = ["dengue", "malaria", "tuberculosis", "typhoid"]
        for disease in diseases:
            assert disease.lower() in SYSTEM_PROMPT_CLINICAL_REASONING.lower(), (
                f"Missing Indian disease '{disease}' in reasoning prompt"
            )

    def test_reasoning_prompt_safety_rules(self):
        """The prompt includes critical safety disclaimers."""
        assert "NEVER claim certainty" in SYSTEM_PROMPT_CLINICAL_REASONING
        assert "red flags" in SYSTEM_PROMPT_CLINICAL_REASONING.lower()


class TestFollowUpPrompt:
    """Verify the follow-up question generation prompt."""

    def test_followup_prompt_structure(self):
        """The prompt includes question categories and output format."""
        assert "Red flag screening" in SYSTEM_PROMPT_FOLLOWUP_GENERATION
        assert "OLDCARTS" in SYSTEM_PROMPT_FOLLOWUP_GENERATION
        assert "question_en" in SYSTEM_PROMPT_FOLLOWUP_GENERATION
        assert "question_local" in SYSTEM_PROMPT_FOLLOWUP_GENERATION

    def test_followup_prompt_language_handling(self):
        """The prompt includes Hindi translations for patient-facing questions."""
        assert "Kya dard kahin aur jaata hai" in SYSTEM_PROMPT_FOLLOWUP_GENERATION
        assert "Hindi" in SYSTEM_PROMPT_FOLLOWUP_GENERATION


class TestTranslationPrompt:
    """Verify the medical translation prompt."""

    def test_translation_prompt_all_languages(self):
        """The prompt references all supported Indian languages."""
        languages = [
            "Hindi", "Bengali", "Tamil", "Telugu", "Marathi",
            "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia",
            "Assamese", "Urdu", "Nepali", "Kashmiri", "Sanskrit",
        ]
        for lang in languages:
            assert lang in SYSTEM_PROMPT_TRANSLATION, (
                f"Missing language '{lang}' in translation prompt"
            )

    def test_translation_prompt_preserves_medical_terms(self):
        """The prompt instructs preserving drug names and medical acronyms."""
        assert "Drug names ALWAYS stay in English" in SYSTEM_PROMPT_TRANSLATION
        assert "ECG" in SYSTEM_PROMPT_TRANSLATION
        assert "Metformin" in SYSTEM_PROMPT_TRANSLATION

    def test_translation_prompt_context_types(self):
        """The prompt covers different translation contexts."""
        contexts = [
            "medical_consultation",
            "prescription",
            "discharge_summary",
            "lab_report",
        ]
        for ctx in contexts:
            assert ctx in SYSTEM_PROMPT_TRANSLATION, (
                f"Missing context '{ctx}' in translation prompt"
            )

    def test_soap_note_prompt_structure(self):
        """The SOAP note prompt (in nlu.py) defines all four SOAP sections."""
        # Import the SOAP prompt from the router module
        from app.routers.nlu import _SYSTEM_PROMPT_SOAP

        for section in ["Subjective", "Objective", "Assessment", "Plan"]:
            assert section in _SYSTEM_PROMPT_SOAP, (
                f"SOAP prompt missing section '{section}'"
            )
        assert "JSON" in _SYSTEM_PROMPT_SOAP
