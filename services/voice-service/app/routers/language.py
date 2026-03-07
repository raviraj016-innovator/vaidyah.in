"""
Language detection router.

POST /detect-language - Auto-detect language from audio and/or text input.
"""

from __future__ import annotations

import uuid
from typing import Optional

from functools import lru_cache

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
from app.models import ErrorResponse, LanguageDetectionResult
from app.services.language_detector import LanguageDetectorService
from app.utils.audio import AudioUtils

logger = structlog.get_logger("voice.language")
router = APIRouter()


@lru_cache(maxsize=1)
def _get_language_detector() -> LanguageDetectorService:
    return LanguageDetectorService(get_settings())


# ---------------------------------------------------------------------------
# POST /detect-language
# ---------------------------------------------------------------------------

@router.post(
    "/detect-language",
    response_model=LanguageDetectionResult,
    responses={400: {"model": ErrorResponse}},
    summary="Detect language from audio or text",
    description=(
        "Automatically detect the spoken/written language. Supports: "
        "English (en-IN), Hindi (hi-IN), Bengali (bn-IN), Tamil (ta-IN), "
        "Telugu (te-IN), and Marathi (mr-IN). Provide audio, text, or both."
    ),
)
async def detect_language(
    file: Optional[UploadFile] = File(default=None, description="Audio file"),
    text: Optional[str] = Form(default=None, description="Text content to analyse"),
    settings: Settings = Depends(get_settings),
    lang_detector: LanguageDetectorService = Depends(_get_language_detector),
) -> LanguageDetectionResult:
    request_id = uuid.uuid4()
    log = logger.bind(request_id=str(request_id))

    if file is None and not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one of: audio file or text.",
        )

    audio_result: Optional[LanguageDetectionResult] = None
    text_result: Optional[LanguageDetectionResult] = None

    # --- Audio-based detection ---
    if file is not None:
        chunks = []
        total = 0
        while chunk := await file.read(8192):
            total += len(chunk)
            if total > settings.max_audio_file_size_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds {settings.max_audio_file_size_mb} MB",
                )
            chunks.append(chunk)
        contents = b"".join(chunks)

        file_ext = (file.filename or "audio.wav").rsplit(".", 1)[-1].lower()
        try:
            audio_bytes, sample_rate, duration, _ = AudioUtils.normalize_audio(
                contents,
                source_format=file_ext,
                target_sample_rate=settings.default_sample_rate,
            )
        except Exception as exc:
            log.warning("language.audio_normalize_failed", error=str(exc))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not process audio file. Please check the format and try again.",
            )

        audio_result = await lang_detector.detect_from_audio(audio_bytes, sample_rate)
        log.info(
            "language.audio_detected",
            lang=audio_result.primary_language.value,
            conf=audio_result.confidence,
        )

    # --- Text-based detection ---
    if text:
        text_result = await lang_detector.detect_from_text(text)
        log.info(
            "language.text_detected",
            lang=text_result.primary_language.value,
            conf=text_result.confidence,
        )

    # --- Combine if both provided ---
    if audio_result and text_result:
        combined = await lang_detector.combine_results(audio_result, text_result)
        combined.request_id = request_id
        combined.detection_source = "combined"
        return combined

    result = audio_result or text_result
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of audio_file or text must be provided",
        )
    result.request_id = request_id
    return result
