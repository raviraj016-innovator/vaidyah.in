"""Pydantic models for the NLU service request/response schemas."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class BodySystem(str, Enum):
    CARDIOVASCULAR = "cardiovascular"
    RESPIRATORY = "respiratory"
    GASTROINTESTINAL = "gastrointestinal"
    NEUROLOGICAL = "neurological"
    MUSCULOSKELETAL = "musculoskeletal"
    DERMATOLOGICAL = "dermatological"
    GENITOURINARY = "genitourinary"
    ENDOCRINE = "endocrine"
    HEMATOLOGICAL = "hematological"
    IMMUNOLOGICAL = "immunological"
    OPHTHALMOLOGICAL = "ophthalmological"
    ENT = "ent"
    PSYCHIATRIC = "psychiatric"
    GENERAL = "general"
    UNKNOWN = "unknown"


class ContradictionSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SupportedLanguage(str, Enum):
    """All 22 Scheduled Languages of India plus English."""
    ENGLISH = "en"
    HINDI = "hi"
    BENGALI = "bn"
    TAMIL = "ta"
    TELUGU = "te"
    MARATHI = "mr"
    GUJARATI = "gu"
    KANNADA = "kn"
    MALAYALAM = "ml"
    PUNJABI = "pa"
    ODIA = "or"
    ASSAMESE = "as"
    URDU = "ur"
    MAITHILI = "mai"
    SANTALI = "sat"
    KASHMIRI = "ks"
    NEPALI = "ne"
    SINDHI = "sd"
    KONKANI = "kok"
    DOGRI = "doi"
    MANIPURI = "mni"
    BODO = "brx"
    SANSKRIT = "sa"


class MedicalEntityType(str, Enum):
    CONDITION = "condition"
    MEDICATION = "medication"
    DOSAGE = "dosage"
    ANATOMY = "anatomy"
    TEST = "test"
    PROCEDURE = "procedure"
    SYMPTOM = "symptom"
    TIME_EXPRESSION = "time_expression"


# ---------------------------------------------------------------------------
# Core domain objects
# ---------------------------------------------------------------------------

class Symptom(BaseModel):
    """A structured representation of a patient-reported symptom."""

    name: str = Field(..., description="Standardized medical name of the symptom")
    original_text: str = Field(
        ..., description="Original text as spoken by the patient"
    )
    severity: Severity = Field(default=Severity.UNKNOWN)
    duration: Optional[str] = Field(
        default=None,
        description="Duration of the symptom, e.g. '3 days', '2 weeks'",
    )
    onset: Optional[str] = Field(
        default=None,
        description="Onset pattern: sudden, gradual, intermittent",
    )
    body_system: BodySystem = Field(default=BodySystem.UNKNOWN)
    icd10_code: Optional[str] = Field(
        default=None,
        description="Mapped ICD-10 code if available",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Confidence score for this extraction",
    )
    negated: bool = Field(
        default=False,
        description="Whether the patient denied this symptom",
    )
    qualifiers: list[str] = Field(
        default_factory=list,
        description="Additional qualifiers like 'intermittent', 'worsening'",
    )


class MedicalEntity(BaseModel):
    """A medical entity extracted via Comprehend Medical or Claude."""

    text: str = Field(..., description="The entity text as found in the input")
    entity_type: MedicalEntityType
    category: Optional[str] = None
    icd10_codes: list[str] = Field(default_factory=list)
    snomed_codes: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    attributes: dict[str, Any] = Field(default_factory=dict)
    begin_offset: Optional[int] = None
    end_offset: Optional[int] = None


class Contradiction(BaseModel):
    """A detected contradiction between statements or clinical data points."""

    description: str = Field(
        ..., description="Human-readable description of the contradiction"
    )
    statement_a: str = Field(..., description="First conflicting statement")
    statement_b: str = Field(..., description="Second conflicting statement")
    severity: ContradictionSeverity = Field(default=ContradictionSeverity.MEDIUM)
    category: str = Field(
        default="general",
        description="Category: symptom_conflict, medication_conflict, "
        "temporal_inconsistency, vital_symptom_mismatch, semantic",
    )
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    suggested_questions: list[str] = Field(
        default_factory=list,
        description="Clarifying questions to resolve the contradiction",
    )


class DifferentialDiagnosis(BaseModel):
    """A single differential diagnosis with supporting evidence."""

    condition: str = Field(..., description="Name of the condition")
    icd10_code: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    supporting_evidence: list[str] = Field(default_factory=list)
    contradicting_evidence: list[str] = Field(default_factory=list)
    recommended_tests: list[str] = Field(default_factory=list)
    urgency: str = Field(
        default="routine",
        description="routine, soon, urgent, emergent",
    )


class FollowUpQuestion(BaseModel):
    """A contextually generated follow-up question."""

    question_en: str = Field(..., description="Question in English")
    question_local: Optional[str] = Field(
        default=None, description="Question in patient's language"
    )
    purpose: str = Field(
        ...,
        description="Clinical purpose of asking this question",
    )
    target_symptom: Optional[str] = None
    priority: int = Field(
        default=1,
        ge=1,
        le=5,
        description="Priority 1 (highest) to 5 (lowest)",
    )
    expected_response_type: str = Field(
        default="open",
        description="open, yes_no, scale, duration, frequency",
    )


class VitalSigns(BaseModel):
    """Patient vital signs."""

    temperature_celsius: Optional[float] = None
    heart_rate_bpm: Optional[int] = None
    blood_pressure_systolic: Optional[int] = None
    blood_pressure_diastolic: Optional[int] = None
    respiratory_rate: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    blood_glucose_mg_dl: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None


class PatientDemographics(BaseModel):
    """Basic patient demographics relevant to clinical reasoning."""

    age: Optional[int] = None
    sex: Optional[str] = None
    pregnancy_status: Optional[bool] = None
    known_allergies: list[str] = Field(default_factory=list)
    chronic_conditions: list[str] = Field(default_factory=list)
    current_medications: list[str] = Field(default_factory=list)
    family_history: list[str] = Field(default_factory=list)
    region: Optional[str] = Field(
        default=None,
        description="Geographic region for epidemiological context",
    )


class ConversationTurn(BaseModel):
    """A single turn in the patient-doctor conversation."""

    role: str = Field(..., description="'doctor' or 'patient'")
    text: str = Field(..., max_length=50000)
    language: SupportedLanguage = SupportedLanguage.ENGLISH
    timestamp: Optional[datetime] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"user", "assistant", "system", "doctor", "patient"}
        if v not in allowed:
            raise ValueError(f"role must be one of {sorted(allowed)}, got {v!r}")
        return v


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SymptomExtractionRequest(BaseModel):
    """Request to extract symptoms from transcript text."""

    text: str = Field(
        ..., min_length=1, max_length=50000, description="Transcript text from the patient conversation"
    )
    language: SupportedLanguage = Field(default=SupportedLanguage.ENGLISH)
    patient_id: Optional[str] = None
    session_id: Optional[str] = None
    include_negated: bool = Field(
        default=True,
        description="Whether to include symptoms the patient explicitly denied",
    )


class ContradictionCheckRequest(BaseModel):
    """Request to detect contradictions."""

    current_symptoms: list[Symptom] = Field(
        ..., description="Symptoms from the current conversation"
    )
    medical_history: Optional[dict[str, Any]] = Field(
        default=None,
        description="Patient's medical history including past conditions, "
        "medications, and previous visit notes",
    )
    conversation_history: list[ConversationTurn] = Field(default_factory=list, max_length=200)
    vital_signs: Optional[VitalSigns] = None
    patient_id: Optional[str] = None
    session_id: Optional[str] = None


class ClinicalReasoningRequest(BaseModel):
    """Request for differential diagnosis and clinical reasoning."""

    symptoms: list[Symptom] = Field(
        ..., description="Extracted and validated symptoms"
    )
    vital_signs: Optional[VitalSigns] = None
    medical_history: Optional[dict[str, Any]] = None
    demographics: Optional[PatientDemographics] = None
    conversation_history: list[ConversationTurn] = Field(default_factory=list, max_length=200)
    max_diagnoses: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Maximum number of differential diagnoses",
    )
    patient_id: Optional[str] = None
    session_id: Optional[str] = None


class FollowUpQuestionRequest(BaseModel):
    """Request to generate follow-up questions."""

    conversation_history: list[ConversationTurn] = Field(
        ..., description="Conversation so far", max_length=200
    )
    extracted_symptoms: list[Symptom] = Field(default_factory=list)
    medical_history: Optional[dict[str, Any]] = None
    language: SupportedLanguage = Field(default=SupportedLanguage.ENGLISH)
    max_questions: int = Field(default=3, ge=1, le=10)
    patient_id: Optional[str] = None
    session_id: Optional[str] = None


class TranslationRequest(BaseModel):
    """Request for medical-aware translation."""

    text: str = Field(..., min_length=1, max_length=50000, description="Text to translate")
    source_language: SupportedLanguage
    target_language: SupportedLanguage
    context: str = Field(
        default="medical_consultation",
        description="Context for translation: medical_consultation, "
        "prescription, discharge_summary, lab_report",
    )
    preserve_medical_terms: bool = Field(
        default=True,
        description="Keep medical terms in English even when translating",
    )


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class SymptomExtractionResponse(BaseModel):
    """Response containing extracted symptoms."""

    symptoms: list[Symptom]
    medical_entities: list[MedicalEntity] = Field(default_factory=list)
    raw_text: str
    language_detected: SupportedLanguage
    processing_time_ms: float = 0.0
    model_version: str = ""


class ContradictionCheckResponse(BaseModel):
    """Response containing detected contradictions."""

    contradictions: list[Contradiction]
    has_critical: bool = Field(
        default=False,
        description="Whether any critical contradictions were found",
    )
    summary: str = Field(default="", description="Brief summary of findings")
    processing_time_ms: float = 0.0


class ClinicalReasoningResponse(BaseModel):
    """Response containing differential diagnoses and reasoning."""

    differential_diagnoses: list[DifferentialDiagnosis]
    reasoning_chain: list[str] = Field(
        default_factory=list,
        description="Step-by-step reasoning explanation",
    )
    red_flags: list[str] = Field(
        default_factory=list,
        description="Critical findings requiring immediate attention",
    )
    recommended_tests: list[str] = Field(default_factory=list)
    triage_level: str = Field(
        default="routine",
        description="routine, soon, urgent, emergent",
    )
    confidence_note: str = Field(
        default="",
        description="Note about overall confidence and limitations",
    )
    processing_time_ms: float = 0.0


class FollowUpQuestionResponse(BaseModel):
    """Response containing generated follow-up questions."""

    questions: list[FollowUpQuestion]
    reasoning: str = Field(
        default="",
        description="Why these questions were chosen",
    )
    gaps_identified: list[str] = Field(
        default_factory=list,
        description="Information gaps that the questions aim to fill",
    )
    processing_time_ms: float = 0.0


class TranslationResponse(BaseModel):
    """Response containing translated text."""

    translated_text: str
    source_language: SupportedLanguage
    target_language: SupportedLanguage
    medical_terms_preserved: list[str] = Field(
        default_factory=list,
        description="Medical terms kept in original language",
    )
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    processing_time_ms: float = 0.0
