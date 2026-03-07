"""
Transcription router.

POST /transcribe        - File-upload transcription via AWS Transcribe Medical
WebSocket /ws/transcribe - Real-time streaming transcription
"""

from __future__ import annotations

import base64
import time
import uuid
from typing import Optional

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from functools import lru_cache
import jwt
from jwt.exceptions import PyJWTError

from app.config import Settings, get_settings
from app.models import (
    AudioFormat,
    AudioMetadata,
    ErrorResponse,
    StreamingTranscriptionMessage,
    StreamingTranscriptionResult,
    SupportedLanguage,
    TranscriptionRequest,
    TranscriptionResponse,
    TranscriptionSegment,
    TranscriptionStatus,
)
from app.services.aws_transcribe import AWSTranscribeService
from app.services.language_detector import LanguageDetectorService
from app.utils.audio import AudioUtils

logger = structlog.get_logger("voice.transcribe")
router = APIRouter()


@lru_cache(maxsize=1)
def _get_transcribe_service() -> AWSTranscribeService:
    return AWSTranscribeService(get_settings())


@lru_cache(maxsize=1)
def _get_language_detector() -> LanguageDetectorService:
    return LanguageDetectorService(get_settings())


# ---------------------------------------------------------------------------
# POST /transcribe
# ---------------------------------------------------------------------------

@router.post(
    "/transcribe",
    response_model=TranscriptionResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
    summary="Transcribe an audio file",
    description="Upload an audio file for transcription using AWS Transcribe Medical.",
)
async def transcribe_audio(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    language: Optional[str] = Form(default=None),
    auto_detect_language: bool = Form(default=True),
    medical_vocabulary_boost: bool = Form(default=True),
    specialty: str = Form(default="PRIMARYCARE"),
    session_id: Optional[str] = Form(default=None),
    patient_id: Optional[str] = Form(default=None),
    encounter_id: Optional[str] = Form(default=None),
    settings: Settings = Depends(get_settings),
    transcribe_svc: AWSTranscribeService = Depends(_get_transcribe_service),
    lang_detector: LanguageDetectorService = Depends(_get_language_detector),
) -> TranscriptionResponse:
    request_id = uuid.uuid4()
    log = logger.bind(request_id=str(request_id), filename=file.filename)

    # --- Validate file size (chunked read to avoid memory exhaustion) ---
    chunks = []
    total = 0
    while chunk := await file.read(8192):
        total += len(chunk)
        if total > settings.max_audio_file_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum size of {settings.max_audio_file_size_mb} MB",
            )
        chunks.append(chunk)
    contents = b"".join(chunks)

    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty audio file",
        )

    # --- Determine format ---
    file_ext = (file.filename or "unknown.wav").rsplit(".", 1)[-1].lower()
    try:
        audio_fmt = AudioFormat(file_ext)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {file_ext}. Supported: {settings.supported_audio_formats}",
        )

    log.info("transcribe.started", size=len(contents), format=file_ext)

    # --- Convert to PCM WAV if necessary ---
    audio_bytes, sample_rate, duration, channels = AudioUtils.normalize_audio(
        contents, source_format=file_ext, target_sample_rate=settings.transcribe_sample_rate,
    )

    # --- Language detection ---
    detected_language: Optional[SupportedLanguage] = None
    if language:
        try:
            detected_language = SupportedLanguage(language)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported language: {language}",
            )
    elif auto_detect_language:
        detection = await lang_detector.detect_from_audio(audio_bytes, sample_rate)
        if detection:
            detected_language = detection.primary_language
            log.info("transcribe.language_detected", lang=detected_language)

    lang_code = detected_language.value if detected_language else settings.transcribe_language_code

    # --- Run transcription ---
    start = time.monotonic()
    result = await transcribe_svc.transcribe_audio(
        audio_bytes=audio_bytes,
        sample_rate=sample_rate,
        language_code=lang_code,
        specialty=specialty,
        medical_vocabulary_boost=medical_vocabulary_boost,
    )
    elapsed = time.monotonic() - start
    log.info("transcribe.completed", elapsed=round(elapsed, 3))

    audio_metadata = AudioMetadata(
        file_name=file.filename or "upload",
        file_size_bytes=len(contents),
        format=audio_fmt,
        sample_rate=sample_rate,
        channels=channels,
        duration_seconds=duration,
    )

    return TranscriptionResponse(
        request_id=request_id,
        status=TranscriptionStatus.COMPLETED,
        transcript=result["transcript"],
        segments=[
            TranscriptionSegment(**seg) for seg in result.get("segments", [])
        ],
        language_detected=detected_language,
        confidence=result.get("confidence", 0.0),
        duration_seconds=duration,
        medical_terms_detected=result.get("medical_terms", []),
        audio_metadata=audio_metadata,
        session_id=session_id,
    )


# ---------------------------------------------------------------------------
# WebSocket /ws/transcribe
# ---------------------------------------------------------------------------

@router.websocket("/ws/transcribe")
async def ws_transcribe(
    websocket: WebSocket,
    settings: Settings = Depends(get_settings),
) -> None:
    """
    Real-time streaming transcription over WebSocket.

    Protocol:
    0. Client connects and sends first message: {"type": "auth", "token": "<JWT>"}
    1. Client sends a JSON config message: {"type": "config", "language": "en-IN", "sample_rate": 16000}
    2. Client sends binary audio chunks or JSON: {"type": "audio_chunk", "data": "<base64>"}
    3. Server sends partial/final transcript messages back.
    4. Client sends: {"type": "end_stream"} to close gracefully.
    """
    # Accept connection first, then authenticate via message (NOT query param,
    # which leaks tokens to server logs, proxy logs, and browser history).
    await websocket.accept()
    log = logger.bind(client=websocket.client)
    log.info("ws_transcribe.connected")

    # --- Authenticate via first message ---
    if settings.auth_enabled:
        import asyncio
        try:
            raw = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        except (asyncio.TimeoutError, Exception):
            await websocket.send_json({"type": "error", "message": "Authentication timeout. Send auth message within 10 seconds."})
            await websocket.close(code=4001)
            return

        if not isinstance(raw, dict) or raw.get("type") != "auth" or not raw.get("token"):
            await websocket.send_json({"type": "error", "message": "First message must be: {\"type\": \"auth\", \"token\": \"<JWT>\"}"})
            await websocket.close(code=4003)
            return

        try:
            jwt.decode(
                raw["token"],
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
                issuer=settings.jwt_issuer,
                audience="vaidyah",
                options={"require": ["sub", "exp", "iat"]},
            )
        except PyJWTError as exc:
            logger.warning("ws_transcribe.auth_failed", reason=str(exc))
            await websocket.send_json({"type": "error", "message": "Authentication failed"})
            await websocket.close(code=4003)
            return

        await websocket.send_json({"type": "auth_success"})

    transcribe_svc = AWSTranscribeService(settings)
    stream_session = None
    language_code = settings.transcribe_language_code
    sample_rate = settings.transcribe_sample_rate

    # --- Session limits ---
    MAX_CHUNKS_PER_SECOND = 10
    MAX_SESSION_DURATION_SECONDS = 30 * 60  # 30 minutes
    MAX_SESSION_BYTES = 100 * 1024 * 1024   # 100 MB
    session_start = time.monotonic()
    total_bytes_received = 0
    chunk_timestamps: list[float] = []

    try:
        while True:
            # Check session duration
            elapsed = time.monotonic() - session_start
            if elapsed > MAX_SESSION_DURATION_SECONDS:
                await websocket.send_json({"type": "error", "message": "Session duration limit exceeded (30 minutes)"})
                await websocket.close(code=1008)
                break

            raw = await websocket.receive()

            # Rate limiting: max chunks per second
            now = time.monotonic()
            chunk_timestamps = [t for t in chunk_timestamps if now - t < 1.0]

            # Binary frame: raw audio chunk
            if "bytes" in raw:
                chunk_timestamps.append(now)
                if len(chunk_timestamps) > MAX_CHUNKS_PER_SECOND:
                    await websocket.send_json({"type": "error", "message": "Rate limit exceeded: max 10 chunks/second"})
                    continue
                total_bytes_received += len(raw["bytes"])
                if total_bytes_received > MAX_SESSION_BYTES:
                    await websocket.send_json({"type": "error", "message": "Session data limit exceeded (100 MB)"})
                    await websocket.close(code=1009)
                    break
                chunk = raw["bytes"]
                if stream_session is None:
                    stream_session = await transcribe_svc.start_stream(
                        language_code=language_code,
                        sample_rate=sample_rate,
                    )
                results = await transcribe_svc.feed_audio_chunk(
                    stream_session, chunk
                )
                for res in (results or []):
                    await websocket.send_json(
                        StreamingTranscriptionResult(
                            type="partial" if res["is_partial"] else "final",
                            transcript=res["transcript"],
                            confidence=res.get("confidence", 0.0),
                            is_partial=res["is_partial"],
                            medical_terms=res.get("medical_terms", []),
                        ).model_dump(mode="json")
                    )
                continue

            # Text frame: JSON control message
            if "text" in raw:
                try:
                    msg = StreamingTranscriptionMessage.model_validate_json(
                        raw["text"]
                    )
                except Exception:
                    await websocket.send_json(
                        StreamingTranscriptionResult(
                            type="error",
                            error="Invalid message format",
                        ).model_dump(mode="json")
                    )
                    continue

                if msg.type == "config":
                    language_code = msg.language or language_code
                    sample_rate = msg.sample_rate or sample_rate
                    log.info(
                        "ws_transcribe.config",
                        language=language_code,
                        sample_rate=sample_rate,
                    )
                    await websocket.send_json(
                        StreamingTranscriptionResult(
                            type="metadata",
                            transcript="",
                        ).model_dump(mode="json")
                    )

                elif msg.type == "audio_chunk" and msg.data:
                    try:
                        chunk = base64.b64decode(msg.data)
                    except Exception:
                        await websocket.send_json({"type": "error", "message": "Invalid base64 audio data"})
                        continue
                    if stream_session is None:
                        stream_session = await transcribe_svc.start_stream(
                            language_code=language_code,
                            sample_rate=sample_rate,
                        )
                    results = await transcribe_svc.feed_audio_chunk(
                        stream_session, chunk
                    )
                    for res in results:
                        await websocket.send_json(
                            StreamingTranscriptionResult(
                                type="partial" if res["is_partial"] else "final",
                                transcript=res["transcript"],
                                confidence=res.get("confidence", 0.0),
                                is_partial=res["is_partial"],
                                medical_terms=res.get("medical_terms", []),
                            ).model_dump(mode="json")
                        )

                elif msg.type == "end_stream":
                    if stream_session:
                        final = await transcribe_svc.end_stream(stream_session)
                        if final:
                            await websocket.send_json(
                                StreamingTranscriptionResult(
                                    type="final",
                                    transcript=final["transcript"],
                                    confidence=final.get("confidence", 0.0),
                                    is_partial=False,
                                    medical_terms=final.get("medical_terms", []),
                                ).model_dump(mode="json")
                            )
                    await websocket.close()
                    break

    except WebSocketDisconnect:
        log.info("ws_transcribe.disconnected")
    except Exception:
        log.error("ws_transcribe.error", exc_info=True)
        try:
            await websocket.send_json(
                StreamingTranscriptionResult(
                    type="error",
                    error="Internal transcription error",
                ).model_dump(mode="json")
            )
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        if stream_session:
            try:
                await transcribe_svc.end_stream(stream_session)
            except Exception:
                pass
        log.info("ws_transcribe.session_ended")
