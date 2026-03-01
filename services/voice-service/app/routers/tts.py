"""
Text-to-Speech router.

POST /synthesize - Convert text to speech using Amazon Polly with neural voices.
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.models import ErrorResponse, SupportedLanguage, TTSRequest, TTSResponse
from app.services.aws_polly import AWSPollyService

logger = structlog.get_logger("voice.tts")
router = APIRouter()


def _get_polly_service(
    settings: Settings = Depends(get_settings),
) -> AWSPollyService:
    return AWSPollyService(settings)


# ---------------------------------------------------------------------------
# POST /synthesize
# ---------------------------------------------------------------------------

@router.post(
    "/synthesize",
    response_model=TTSResponse,
    responses={400: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
    summary="Synthesize speech from text",
    description=(
        "Convert text to speech using Amazon Polly neural voices. "
        "Supports Hindi, English, Bengali, Tamil, Telugu, and Marathi."
    ),
)
async def synthesize_speech(
    request: TTSRequest,
    settings: Settings = Depends(get_settings),
    polly_svc: AWSPollyService = Depends(_get_polly_service),
) -> TTSResponse:
    request_id = uuid.uuid4()
    log = logger.bind(
        request_id=str(request_id),
        language=request.language.value,
        text_length=len(request.text),
    )
    log.info("tts.synthesize_started")

    # --- Validate language has a mapped voice ---
    voice_id = polly_svc.get_voice_for_language(request.language)
    if not voice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No voice available for language: {request.language.value}",
        )

    # --- Build SSML if speed/pitch/volume adjustments requested ---
    synthesis_text = request.text
    text_type = "ssml" if request.use_ssml else "text"

    if not request.use_ssml and (
        request.speed != 1.0 or request.pitch != 1.0 or request.volume != 1.0
    ):
        synthesis_text = polly_svc.wrap_ssml(
            text=request.text,
            speed=request.speed,
            pitch=request.pitch,
            volume=request.volume,
        )
        text_type = "ssml"

    # --- Check cache ---
    if request.cache_enabled:
        cached = await polly_svc.get_cached(synthesis_text, voice_id, request.output_format)
        if cached:
            log.info("tts.cache_hit")
            return TTSResponse(
                request_id=request_id,
                audio_base64=cached["audio_base64"],
                audio_url=cached.get("audio_url"),
                content_type=cached["content_type"],
                duration_seconds=cached.get("duration_seconds"),
                language=request.language,
                voice_id=voice_id,
                characters_synthesized=len(request.text),
                cached=True,
            )

    # --- Synthesize ---
    try:
        result = await polly_svc.synthesize(
            text=synthesis_text,
            text_type=text_type,
            voice_id=voice_id,
            output_format=request.output_format,
            sample_rate=request.sample_rate,
            language_code=request.language.value,
        )
    except Exception as exc:
        log.error("tts.synthesize_failed", error=str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech synthesis failed. Please try again later.",
        )

    # --- Cache result ---
    if request.cache_enabled:
        await polly_svc.cache_result(
            text=synthesis_text,
            voice_id=voice_id,
            output_format=request.output_format,
            result=result,
        )

    log.info("tts.synthesize_completed", voice=voice_id)

    return TTSResponse(
        request_id=request_id,
        audio_base64=result["audio_base64"],
        audio_url=result.get("audio_url"),
        content_type=result["content_type"],
        duration_seconds=result.get("duration_seconds"),
        language=request.language,
        voice_id=voice_id,
        characters_synthesized=len(request.text),
        cached=False,
    )


# ---------------------------------------------------------------------------
# POST /synthesize/stream  (streaming audio response)
# ---------------------------------------------------------------------------

@router.post(
    "/synthesize/stream",
    summary="Stream synthesized speech audio",
    description="Returns raw audio bytes as a streaming response.",
    responses={400: {"model": ErrorResponse}},
)
async def synthesize_speech_stream(
    request: TTSRequest,
    settings: Settings = Depends(get_settings),
    polly_svc: AWSPollyService = Depends(_get_polly_service),
) -> StreamingResponse:
    voice_id = polly_svc.get_voice_for_language(request.language)
    if not voice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No voice available for language: {request.language.value}",
        )

    synthesis_text = request.text
    text_type = "ssml" if request.use_ssml else "text"
    if not request.use_ssml and (
        request.speed != 1.0 or request.pitch != 1.0 or request.volume != 1.0
    ):
        synthesis_text = polly_svc.wrap_ssml(
            text=request.text,
            speed=request.speed,
            pitch=request.pitch,
            volume=request.volume,
        )
        text_type = "ssml"

    content_type_map = {
        "mp3": "audio/mpeg",
        "ogg_vorbis": "audio/ogg",
        "pcm": "audio/pcm",
    }

    audio_stream = await polly_svc.synthesize_stream(
        text=synthesis_text,
        text_type=text_type,
        voice_id=voice_id,
        output_format=request.output_format,
        sample_rate=request.sample_rate,
        language_code=request.language.value,
    )

    return StreamingResponse(
        content=audio_stream,
        media_type=content_type_map.get(request.output_format, "audio/mpeg"),
        headers={
            "Content-Disposition": "attachment; filename=speech.mp3",
        },
    )
