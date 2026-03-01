"""
Prosody analysis router.

POST /analyze-prosody - Extract prosodic features from audio and compute
                        emotional / distress scores.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from app.config import Settings, get_settings
from app.models import (
    AudioFormat,
    AudioMetadata,
    ErrorResponse,
    ProsodyAnalysisResult,
)
from app.services.prosody_analyzer import ProsodyAnalyzerService
from app.utils.audio import AudioUtils

logger = structlog.get_logger("voice.prosody")
router = APIRouter()


def _get_prosody_service(
    settings: Settings = Depends(get_settings),
) -> ProsodyAnalyzerService:
    return ProsodyAnalyzerService(settings)


# ---------------------------------------------------------------------------
# POST /analyze-prosody
# ---------------------------------------------------------------------------

@router.post(
    "/analyze-prosody",
    response_model=ProsodyAnalysisResult,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
    summary="Analyze prosody in an audio file",
    description=(
        "Extract pitch, pace, energy, and pause patterns from audio. "
        "Returns distress, pain, and anxiety scores (0-1). Uses a SageMaker "
        "ML model when available, otherwise falls back to rule-based analysis."
    ),
)
async def analyze_prosody(
    file: UploadFile = File(..., description="Audio file to analyze"),
    patient_id: str | None = Form(default=None),
    encounter_id: str | None = Form(default=None),
    settings: Settings = Depends(get_settings),
    prosody_svc: ProsodyAnalyzerService = Depends(_get_prosody_service),
) -> ProsodyAnalysisResult:
    request_id = uuid.uuid4()
    log = logger.bind(request_id=str(request_id), filename=file.filename)

    # --- Read & validate ---
    contents = await file.read()
    if len(contents) > settings.max_audio_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_audio_file_size_mb} MB",
        )

    file_ext = (file.filename or "audio.wav").rsplit(".", 1)[-1].lower()
    try:
        audio_fmt = AudioFormat(file_ext)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {file_ext}",
        )

    log.info("prosody.analysis_started", size=len(contents))

    # --- Normalise audio ---
    try:
        audio_bytes, sample_rate, duration, channels = AudioUtils.normalize_audio(
            contents,
            source_format=file_ext,
            target_sample_rate=settings.default_sample_rate,
        )
    except Exception as exc:
        log.error("prosody.audio_normalize_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not process audio file: {exc}",
        )

    # --- Analyse prosody ---
    try:
        result = await prosody_svc.analyze(
            audio_bytes=audio_bytes,
            sample_rate=sample_rate,
            duration=duration,
        )
    except Exception as exc:
        log.error("prosody.analysis_failed", error=str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Prosody analysis failed.",
        )

    audio_metadata = AudioMetadata(
        file_name=file.filename or "upload",
        file_size_bytes=len(contents),
        format=audio_fmt,
        sample_rate=sample_rate,
        channels=channels,
        duration_seconds=duration,
    )

    result.request_id = request_id
    result.audio_metadata = audio_metadata
    result.duration_seconds = duration

    log.info(
        "prosody.analysis_completed",
        method=result.analysis_method,
        distress=result.emotional_scores.distress,
        pain=result.emotional_scores.pain,
        anxiety=result.emotional_scores.anxiety,
    )

    return result
