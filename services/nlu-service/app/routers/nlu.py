"""NLU router -- symptom extraction, entity recognition, contradiction detection, follow-ups, translation, SOAP, and summarization."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.config import get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.models import (
    Contradiction,
    ContradictionCheckRequest,
    ContradictionCheckResponse,
    ContradictionSeverity,
    FollowUpQuestion,
    FollowUpQuestionRequest,
    FollowUpQuestionResponse,
    MedicalEntity,
    Symptom,
    SymptomExtractionRequest,
    SymptomExtractionResponse,
    SupportedLanguage,
    TranslationRequest,
    TranslationResponse,
    VitalSigns,
)
from app.services.bedrock_client import BedrockClient, BedrockClientError
from app.services.comprehend_medical import ComprehendMedicalClient
from app.services.medical_prompts import (
    SYSTEM_PROMPT_CONTRADICTION_CHECK,
    SYSTEM_PROMPT_FOLLOWUP_GENERATION,
    SYSTEM_PROMPT_TRANSLATION,
)
from app.services.symptom_extractor import SymptomExtractor

# Re-use the same prompt-injection sanitizer across all LLM-facing endpoints
_sanitize = SymptomExtractor._sanitize_user_input

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nlu", tags=["nlu"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_bedrock(request: Request) -> BedrockClient:
    client = request.app.state.bedrock_client
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bedrock client is not available. AWS services may be down.",
        )
    return client


def _get_comprehend(request: Request) -> ComprehendMedicalClient:
    client = request.app.state.comprehend_client
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Comprehend Medical client is not available. AWS services may be down.",
        )
    return client


def _get_extractor(request: Request) -> SymptomExtractor:
    extractor = request.app.state.symptom_extractor
    if extractor is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Symptom extractor is not available. AWS services may be down.",
        )
    return extractor


# ---------------------------------------------------------------------------
# Request / Response models unique to this router
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class MedicalEntitiesRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50000, description="Clinical text to analyse")


class MedicalEntitiesResponse(BaseModel):
    entities: list[MedicalEntity]
    processing_time_ms: float = 0.0


class SOAPRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=100000, description="Full consultation transcript")
    symptoms: list[Symptom] = Field(default_factory=list)
    vitals: VitalSigns | None = None
    triage_level: str = Field(
        default="routine",
        description="routine | soon | urgent | emergent",
    )
    patient_id: str | None = None
    session_id: str | None = None


class SOAPNote(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class SOAPResponse(BaseModel):
    soap: SOAPNote
    processing_time_ms: float = 0.0


class SummarizeRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=100000, description="Conversation transcript to summarize")
    language: SupportedLanguage = SupportedLanguage.ENGLISH
    patient_id: str | None = None
    session_id: str | None = None


class SummarizeResponse(BaseModel):
    summary: str
    key_findings: list[str] = Field(default_factory=list)
    processing_time_ms: float = 0.0


# ---------------------------------------------------------------------------
# Prompt templates for SOAP and Summarize (not in medical_prompts.py)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_SOAP = """\
You are a clinical documentation assistant in the Vaidyah healthcare platform. \
Generate a structured SOAP note from the provided consultation data.

## Rules
1. **Subjective**: Patient-reported symptoms, history, and complaints in narrative form.
2. **Objective**: Vital signs, examination findings, and measurable data.
3. **Assessment**: Clinical impression, differential diagnoses, and severity assessment.
4. **Plan**: Investigations ordered, medications prescribed, follow-up instructions, referrals.

Keep each section concise and clinically accurate. Use standard medical terminology.

## Output Format
Return ONLY a JSON object:
```json
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "..."
}
```
"""

_SYSTEM_PROMPT_SUMMARIZE = """\
You are a clinical summarization assistant in the Vaidyah healthcare platform. \
Produce a concise clinical summary of the patient-doctor conversation.

## Rules
1. Capture the chief complaint and history of present illness.
2. List key positive and pertinent negative findings.
3. Note any red flags or urgent concerns.
4. Keep the summary under 200 words unless the conversation is very long.
5. Use standard medical terminology.

## Output Format
Return ONLY a JSON object:
```json
{
  "summary": "Narrative clinical summary...",
  "key_findings": ["finding 1", "finding 2"]
}
```
"""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/extract-symptoms",
    response_model=SymptomExtractionResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract structured symptoms from transcript text",
)
async def extract_symptoms(
    body: SymptomExtractionRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> SymptomExtractionResponse:
    extractor = _get_extractor(request)
    try:
        result = await extractor.extract(
            text=body.text,
            language=body.language,
            include_negated=body.include_negated,
        )
    except Exception as exc:
        logger.exception("extract_symptoms_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Symptom extraction failed. Please try again.",
        ) from exc

    return SymptomExtractionResponse(
        symptoms=result["symptoms"],
        medical_entities=result["medical_entities"],
        raw_text=body.text,
        language_detected=body.language,
        processing_time_ms=result["processing_time_ms"],
        model_version=get_settings().bedrock_model_id,
    )


@router.post(
    "/contradictions",
    response_model=ContradictionCheckResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect contradictions in patient symptoms, history, and vitals",
)
async def check_contradictions(
    body: ContradictionCheckRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> ContradictionCheckResponse:
    bedrock = _get_bedrock(request)
    start = time.monotonic()

    symptoms_block = "\n".join(
        f"- {s.name} | severity={s.severity.value} | duration={s.duration} | "
        f"onset={s.onset} | negated={s.negated}"
        for s in body.current_symptoms
    ) or "No symptoms provided."

    vitals_block = "None provided."
    if body.vital_signs:
        pairs = [
            f"{k}={v}"
            for k, v in body.vital_signs.model_dump(exclude_none=True).items()
        ]
        vitals_block = ", ".join(pairs) if pairs else "None provided."

    history_block = "None provided."
    if body.medical_history:
        history_block = str(body.medical_history)[:2000]

    conversation_block = "\n".join(
        f"[{turn.role}] {_sanitize(turn.text)}" for turn in body.conversation_history
    ) if body.conversation_history else "No conversation history."

    user_message = (
        f"Current symptoms:\n{symptoms_block}\n\n"
        f"Vital signs:\n{vitals_block}\n\n"
        f"Medical history:\n{history_block}\n\n"
        f"Conversation:\n{conversation_block}\n\n"
        "Analyze for contradictions. Return JSON only."
    )

    try:
        result = await asyncio.to_thread(
            bedrock.invoke_and_parse_json,
            system_prompt=SYSTEM_PROMPT_CONTRADICTION_CHECK,
            user_message=user_message,
            temperature=0.1,
        )
        data: dict[str, Any] = result["data"]
    except (BedrockClientError, ValueError) as exc:
        logger.exception("contradiction_check_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Contradiction check failed. Please try again.",
        ) from exc

    elapsed = (time.monotonic() - start) * 1000

    contradictions: list[Contradiction] = []
    for c in data.get("contradictions", []):
        try:
            contradictions.append(
                Contradiction(
                    description=c.get("description", ""),
                    statement_a=c.get("statement_a", ""),
                    statement_b=c.get("statement_b", ""),
                    severity=ContradictionSeverity(c.get("severity", "medium")),
                    category=c.get("category", "general"),
                    confidence=float(c.get("confidence", 0.5)),
                    suggested_questions=c.get("suggested_questions", []),
                )
            )
        except (ValueError, KeyError):
            logger.warning("contradiction_parse_error", raw=c)

    has_critical = any(
        c.severity in (ContradictionSeverity.CRITICAL, ContradictionSeverity.HIGH)
        for c in contradictions
    )

    return ContradictionCheckResponse(
        contradictions=contradictions,
        has_critical=has_critical,
        summary=data.get("summary", ""),
        processing_time_ms=round(elapsed, 1),
    )


@router.post(
    "/medical-entities",
    response_model=MedicalEntitiesResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract medical entities via Amazon Comprehend Medical",
)
async def medical_entities(
    body: MedicalEntitiesRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> MedicalEntitiesResponse:
    comprehend = _get_comprehend(request)
    start = time.monotonic()
    try:
        entities = await asyncio.to_thread(comprehend.detect_entities, body.text)
    except Exception as exc:
        logger.exception("medical_entities_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Medical entity extraction failed. Please try again.",
        ) from exc
    elapsed = (time.monotonic() - start) * 1000

    return MedicalEntitiesResponse(
        entities=entities,
        processing_time_ms=round(elapsed, 1),
    )


@router.post(
    "/followup-questions",
    response_model=FollowUpQuestionResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate context-aware follow-up questions",
)
async def followup_questions(
    body: FollowUpQuestionRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> FollowUpQuestionResponse:
    bedrock = _get_bedrock(request)
    start = time.monotonic()

    conversation_block = "\n".join(
        f"[{turn.role}] {_sanitize(turn.text)}" for turn in body.conversation_history
    )
    symptoms_block = "\n".join(
        f"- {s.name} (severity={s.severity.value}, duration={s.duration})"
        for s in body.extracted_symptoms
    ) or "No symptoms extracted yet."

    user_message = (
        f"Language: {body.language.value}\n"
        f"Max questions: {body.max_questions}\n\n"
        f"Conversation so far:\n{conversation_block}\n\n"
        f"Extracted symptoms:\n{symptoms_block}\n\n"
        "Generate follow-up questions. Return JSON only."
    )

    try:
        result = await asyncio.to_thread(
            bedrock.invoke_and_parse_json,
            system_prompt=SYSTEM_PROMPT_FOLLOWUP_GENERATION,
            user_message=user_message,
            temperature=0.2,
        )
        data: dict[str, Any] = result["data"]
    except (BedrockClientError, ValueError) as exc:
        logger.exception("followup_generation_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Follow-up question generation failed. Please try again.",
        ) from exc

    elapsed = (time.monotonic() - start) * 1000

    questions: list[FollowUpQuestion] = []
    for q in data.get("questions", []):
        try:
            questions.append(FollowUpQuestion(**q))
        except Exception:
            logger.warning("followup_question_parse_error", raw=q)

    return FollowUpQuestionResponse(
        questions=questions[: body.max_questions],
        reasoning=data.get("reasoning", ""),
        gaps_identified=data.get("gaps_identified", []),
        processing_time_ms=round(elapsed, 1),
    )


@router.post(
    "/translate",
    response_model=TranslationResponse,
    status_code=status.HTTP_200_OK,
    summary="Translate medical text between supported languages",
)
async def translate(
    body: TranslationRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> TranslationResponse:
    bedrock = _get_bedrock(request)
    start = time.monotonic()

    user_message = (
        f"Source language: {body.source_language.value}\n"
        f"Target language: {body.target_language.value}\n"
        f"Context: {_sanitize(body.context)}\n"
        f"Preserve medical terms: {body.preserve_medical_terms}\n\n"
        f"Text to translate:\n<user_input>\n{_sanitize(body.text)}\n</user_input>\n\n"
        "Translate the text. Return JSON only."
    )

    try:
        result = await asyncio.to_thread(
            bedrock.invoke_and_parse_json,
            system_prompt=SYSTEM_PROMPT_TRANSLATION,
            user_message=user_message,
            temperature=0.1,
        )
        data: dict[str, Any] = result["data"]
    except (BedrockClientError, ValueError) as exc:
        logger.exception("translation_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Translation failed. Please try again.",
        ) from exc

    elapsed = (time.monotonic() - start) * 1000

    return TranslationResponse(
        translated_text=data.get("translated_text", ""),
        source_language=body.source_language,
        target_language=body.target_language,
        medical_terms_preserved=data.get("medical_terms_preserved", []),
        confidence=_safe_float(data.get("confidence"), 0.0),
        processing_time_ms=round(elapsed, 1),
    )


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert a value to float, returning default on failure."""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


@router.post(
    "/soap-generate",
    response_model=SOAPResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate a SOAP note from consultation data",
)
async def soap_generate(
    body: SOAPRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> SOAPResponse:
    bedrock = _get_bedrock(request)
    start = time.monotonic()

    symptoms_block = "\n".join(
        f"- {s.name} | severity={s.severity.value} | duration={s.duration} | "
        f"icd10={s.icd10_code} | negated={s.negated}"
        for s in body.symptoms
    ) or "None provided."

    vitals_block = "None provided."
    if body.vitals:
        pairs = [
            f"{k}={v}"
            for k, v in body.vitals.model_dump(exclude_none=True).items()
        ]
        vitals_block = ", ".join(pairs) if pairs else "None provided."

    user_message = (
        f"Triage level: {_sanitize(body.triage_level)}\n\n"
        f"Transcript:\n<user_input>\n{_sanitize(body.transcript)}\n</user_input>\n\n"
        f"Extracted symptoms:\n{symptoms_block}\n\n"
        f"Vital signs:\n{vitals_block}\n\n"
        "Generate a SOAP note. Return JSON only."
    )

    try:
        result = await asyncio.to_thread(
            bedrock.invoke_and_parse_json,
            system_prompt=_SYSTEM_PROMPT_SOAP,
            user_message=user_message,
            temperature=0.1,
        )
        data: dict[str, Any] = result["data"]
    except (BedrockClientError, ValueError) as exc:
        logger.exception("soap_generation_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="SOAP generation failed. Please try again.",
        ) from exc

    elapsed = (time.monotonic() - start) * 1000

    return SOAPResponse(
        soap=SOAPNote(
            subjective=data.get("subjective", ""),
            objective=data.get("objective", ""),
            assessment=data.get("assessment", ""),
            plan=data.get("plan", ""),
        ),
        processing_time_ms=round(elapsed, 1),
    )


@router.post(
    "/summarize",
    response_model=SummarizeResponse,
    status_code=status.HTTP_200_OK,
    summary="Summarize a clinical conversation",
)
async def summarize(
    body: SummarizeRequest,
    request: Request,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> SummarizeResponse:
    bedrock = _get_bedrock(request)
    start = time.monotonic()

    user_message = (
        f"Language: {body.language.value}\n\n"
        f"Conversation transcript:\n<user_input>\n{_sanitize(body.transcript)}\n</user_input>\n\n"
        "Summarize this clinical conversation. Return JSON only."
    )

    try:
        result = await asyncio.to_thread(
            bedrock.invoke_and_parse_json,
            system_prompt=_SYSTEM_PROMPT_SUMMARIZE,
            user_message=user_message,
            temperature=0.1,
        )
        data: dict[str, Any] = result["data"]
    except (BedrockClientError, ValueError) as exc:
        logger.exception("summarization_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Summarization failed. Please try again.",
        ) from exc

    elapsed = (time.monotonic() - start) * 1000

    return SummarizeResponse(
        summary=data.get("summary", ""),
        key_findings=data.get("key_findings", []),
        processing_time_ms=round(elapsed, 1),
    )
