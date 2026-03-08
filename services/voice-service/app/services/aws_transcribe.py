"""
AWS Transcribe Medical integration.

Provides both batch (file-upload) and real-time streaming transcription
with medical vocabulary boosting and custom vocabulary support.

Streaming transcription uses the Amazon Transcribe Streaming SDK
(amazon-transcribe-streaming-sdk) when available, falling back to
batch-per-chunk processing otherwise.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import time
import uuid
from typing import Any, Optional

import boto3
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import Settings

logger = structlog.get_logger("voice.services.transcribe")

# Try to import the Amazon Transcribe Streaming SDK
_HAS_STREAMING_SDK = False
try:
    from amazon_transcribe.client import TranscribeStreamingClient
    from amazon_transcribe.handlers import TranscriptResultStreamHandler
    from amazon_transcribe.model import TranscriptEvent, TranscriptResultStream
    _HAS_STREAMING_SDK = True
    logger.info("transcribe.streaming_sdk_available")
except ImportError:
    logger.info(
        "transcribe.streaming_sdk_unavailable",
        detail="amazon-transcribe-streaming-sdk not installed; "
               "streaming will fall back to batch-per-chunk mode",
    )

# Medical terms to boost recognition (common Indian healthcare terms)
MEDICAL_VOCABULARY_BOOST: list[str] = [
    "paracetamol", "metformin", "amlodipine", "atorvastatin",
    "omeprazole", "losartan", "pantoprazole", "clopidogrel",
    "aspirin", "insulin", "glimepiride", "telmisartan",
    "ramipril", "enalapril", "ciprofloxacin", "amoxicillin",
    "azithromycin", "doxycycline", "prednisolone", "salbutamol",
    "diabetes", "hypertension", "tuberculosis", "malaria",
    "dengue", "chikungunya", "typhoid", "cholesterol",
    "hemoglobin", "creatinine", "bilirubin", "thyroid",
    "ECG", "MRI", "CT scan", "X-ray", "ultrasound",
    "OPD", "IPD", "ICU", "NICU", "OT",
    "Ayurveda", "Unani", "Siddha", "homeopathy",
    "blood pressure", "blood sugar", "pulse rate", "SpO2",
    "fever", "cough", "breathlessness", "chest pain",
    "abdominal pain", "headache", "dizziness", "fatigue",
]


class _StreamingResultCollector:
    """
    Collects partial and final transcript results from the AWS Transcribe
    Streaming SDK event stream.

    Used only when the streaming SDK is available.
    """

    def __init__(self) -> None:
        self.partial_transcript: str = ""
        self.final_transcript: str = ""
        self.final_segments: list[dict] = []
        self.confidence_sum: float = 0.0
        self.confidence_count: int = 0
        self._pending_results: list[dict[str, Any]] = []

    def drain_results(self) -> list[dict[str, Any]]:
        """Return and clear any pending results."""
        results = list(self._pending_results)
        self._pending_results.clear()
        return results

    def handle_transcript_event(self, event: dict[str, Any]) -> None:
        """
        Handle a transcript event from the streaming response.

        Each event may contain one or more results, each of which is either
        partial (is_partial=True) or final.
        """
        results = event.get("Transcript", {}).get("Results", [])
        for result in results:
            is_partial = result.get("IsPartial", True)
            alternatives = result.get("Alternatives", [])
            if not alternatives:
                continue

            best = alternatives[0]
            transcript_text = best.get("Transcript", "")
            items = best.get("Items", [])

            # Compute confidence from items
            seg_confidences: list[float] = []
            for item in items:
                if item.get("Type") == "pronunciation":
                    conf = float(item.get("Confidence", 0.0))
                    seg_confidences.append(conf)

            avg_confidence = (
                sum(seg_confidences) / len(seg_confidences)
                if seg_confidences
                else 0.0
            )

            if is_partial:
                self.partial_transcript = transcript_text
                self._pending_results.append(
                    {
                        "transcript": transcript_text,
                        "is_partial": True,
                        "confidence": avg_confidence,
                        "medical_terms": [],
                    }
                )
            else:
                self.partial_transcript = ""
                self.final_transcript += (" " + transcript_text).lstrip()
                self.confidence_sum += avg_confidence
                self.confidence_count += 1

                # Detect medical terms in the final segment
                lower_text = transcript_text.lower()
                medical_terms = [
                    term
                    for term in MEDICAL_VOCABULARY_BOOST
                    if term.lower() in lower_text
                ]

                # Build segment entries
                for item in items:
                    if item.get("Type") == "pronunciation":
                        alts = [item] if "Confidence" in item else []
                        self.final_segments.append(
                            {
                                "text": item.get("Content", ""),
                                "start_time": float(
                                    item.get("StartTime", 0.0)
                                ),
                                "end_time": float(
                                    item.get("EndTime", 0.0)
                                ),
                                "confidence": float(
                                    item.get("Confidence", 0.0)
                                ),
                                "is_partial": False,
                            }
                        )

                self._pending_results.append(
                    {
                        "transcript": transcript_text,
                        "is_partial": False,
                        "confidence": avg_confidence,
                        "medical_terms": medical_terms,
                    }
                )


class StreamSession:
    """Holds state for an active streaming transcription session."""

    def __init__(self, session_id: str, language_code: str, sample_rate: int):
        if sample_rate <= 0:
            raise ValueError(f"sample_rate must be positive, got {sample_rate}")
        self.session_id = session_id
        self.language_code = language_code
        self.sample_rate = sample_rate
        self.audio_buffer: bytearray = bytearray()
        self.partial_transcript: str = ""
        self.final_segments: list[dict] = []
        self.is_active: bool = True
        self.created_at: float = time.monotonic()

        # --- Streaming SDK fields ---
        # When the amazon-transcribe-streaming-sdk is available and we are in
        # production mode, these hold the active streaming connection state.
        self.stream_client: Any = None
        self.stream_response: Any = None
        self._result_collector: Optional[_StreamingResultCollector] = None
        self._stream_task: Optional[asyncio.Task] = None
        self._audio_stream: Any = None
        self.uses_streaming_sdk: bool = False


class AWSTranscribeService:
    """Wrapper around AWS Transcribe Medical for healthcare speech-to-text."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Optional[Any] = None
        self._s3_client: Optional[Any] = None

    def _get_client(self) -> Any:
        if self._client is None:
            kwargs: dict[str, Any] = {"region_name": self._settings.aws_region}
            if self._settings.aws_access_key_id and self._settings.aws_secret_access_key:
                kwargs["aws_access_key_id"] = self._settings.aws_access_key_id
                kwargs["aws_secret_access_key"] = self._settings.aws_secret_access_key
                if self._settings.aws_session_token:
                    kwargs["aws_session_token"] = self._settings.aws_session_token
            self._client = boto3.client("transcribe", **kwargs)
        return self._client

    def _get_s3_client(self) -> Any:
        if self._s3_client is None:
            kwargs: dict[str, Any] = {"region_name": self._settings.aws_region}
            if self._settings.aws_access_key_id and self._settings.aws_secret_access_key:
                kwargs["aws_access_key_id"] = self._settings.aws_access_key_id
                kwargs["aws_secret_access_key"] = self._settings.aws_secret_access_key
                if self._settings.aws_session_token:
                    kwargs["aws_session_token"] = self._settings.aws_session_token
            self._s3_client = boto3.client("s3", **kwargs)
        return self._s3_client

    # ------------------------------------------------------------------
    # Batch transcription (file upload)
    # ------------------------------------------------------------------

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        sample_rate: int,
        language_code: str = "en-IN",
        specialty: str = "PRIMARYCARE",
        medical_vocabulary_boost: bool = True,
    ) -> dict[str, Any]:
        """
        Transcribe an audio buffer using AWS Transcribe Medical.

        For production, this starts a transcription job, uploads to S3,
        and polls for results. For simplicity in the service layer, we use
        the synchronous StartMedicalTranscriptionJob API.
        """
        log = logger.bind(language=language_code, specialty=specialty)

        job_name = f"vaidyah-{uuid.uuid4().hex[:12]}-{int(time.time())}"
        log.info("transcribe.job_starting", job_name=job_name)

        try:
            result = await self._run_transcription_job(
                audio_bytes=audio_bytes,
                job_name=job_name,
                language_code=language_code,
                sample_rate=sample_rate,
                specialty=specialty,
                medical_vocabulary_boost=medical_vocabulary_boost,
            )
            return result
        except Exception as exc:
            log.error("transcribe.job_failed", error=str(exc), exc_info=True)
            # Fall back to a simulated local result in dev/test
            if not self._settings.is_production:
                log.warning("transcribe.falling_back_to_local")
                return self._local_fallback(audio_bytes, language_code)
            raise

    async def _run_transcription_job(
        self,
        audio_bytes: bytes,
        job_name: str,
        language_code: str,
        sample_rate: int,
        specialty: str,
        medical_vocabulary_boost: bool,
    ) -> dict[str, Any]:
        """Execute a transcription job against the AWS API."""
        client = self._get_client()
        loop = asyncio.get_running_loop()

        # Upload audio to a temporary S3 location
        s3_key = f"transcribe-input/{job_name}.wav"
        s3_client = self._get_s3_client()

        await loop.run_in_executor(
            None,
            lambda: s3_client.put_object(
                Bucket=self._settings.s3_audio_bucket,
                Key=s3_key,
                Body=audio_bytes,
                ServerSideEncryption="aws:kms",
            ),
        )

        media_uri = f"s3://{self._settings.s3_audio_bucket}/{s3_key}"

        job_params: dict[str, Any] = {
            "MedicalTranscriptionJobName": job_name,
            "LanguageCode": language_code,
            "MediaSampleRateHertz": sample_rate,
            "MediaFormat": "wav",
            "Media": {"MediaFileUri": media_uri},
            "OutputBucketName": self._settings.s3_audio_bucket,
            "OutputKey": f"transcribe-output/{job_name}.json",
            "Specialty": specialty,
            "Type": self._settings.transcribe_type,
            "Settings": {
                "ShowAlternatives": False,
            },
        }

        if (
            medical_vocabulary_boost
            and self._settings.transcribe_custom_vocabulary_name
        ):
            job_params["Settings"]["VocabularyName"] = (
                self._settings.transcribe_custom_vocabulary_name
            )

        await loop.run_in_executor(
            None,
            lambda: client.start_medical_transcription_job(**job_params),
        )

        # Poll for completion
        transcript_result = await self._poll_job(client, job_name, loop)

        # Clean up temp S3 object
        try:
            await loop.run_in_executor(
                None,
                lambda: s3_client.delete_object(
                    Bucket=self._settings.s3_audio_bucket, Key=s3_key
                ),
            )
        except Exception:
            pass

        return transcript_result

    async def _poll_job(
        self, client: Any, job_name: str, loop: asyncio.AbstractEventLoop
    ) -> dict[str, Any]:
        """Poll a transcription job until it completes or fails."""
        max_wait = 120  # seconds
        poll_interval = 2
        elapsed = 0.0

        while elapsed < max_wait:
            response = await loop.run_in_executor(
                None,
                lambda: client.get_medical_transcription_job(
                    MedicalTranscriptionJobName=job_name
                ),
            )
            status = response["MedicalTranscriptionJob"]["TranscriptionJobStatus"]

            if status == "COMPLETED":
                return self._parse_job_result(response)
            elif status == "FAILED":
                reason = response["MedicalTranscriptionJob"].get(
                    "FailureReason", "Unknown"
                )
                raise RuntimeError(f"Transcription job failed: {reason}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(
            f"Transcription job {job_name} did not complete within {max_wait}s"
        )

    def _parse_job_result(self, response: dict) -> dict[str, Any]:
        """Parse the completed job response into our standard format."""
        job = response["MedicalTranscriptionJob"]
        transcript_uri = job.get("Transcript", {}).get("TranscriptFileUri", "")

        transcript_text = ""
        segments: list[dict] = []
        confidence = 0.0
        medical_terms: list[str] = []

        # Download the transcript JSON from S3 and extract the actual text
        if transcript_uri:
            transcript_text, segments, confidence, medical_terms = (
                self._download_transcript_from_s3(transcript_uri)
            )

        return {
            "transcript": transcript_text,
            "segments": segments,
            "confidence": confidence,
            "medical_terms": medical_terms,
            "job_name": job.get("MedicalTranscriptionJobName"),
            "transcript_uri": transcript_uri,
        }

    def _download_transcript_from_s3(
        self, transcript_uri: str
    ) -> tuple[str, list[dict], float, list[str]]:
        """Download and parse the transcript JSON from the S3 URI."""
        import re

        transcript_text = ""
        segments: list[dict] = []
        confidence = 0.0
        medical_terms: list[str] = []

        try:
            # Parse s3://bucket/key from the URI
            match = re.match(r"s3://([^/]+)/(.+)", transcript_uri)
            if not match:
                # If it's an HTTPS URL: https://s3.<region>.amazonaws.com/<bucket>/<key>
                match = re.match(
                    r"https://s3[.\w-]*\.amazonaws\.com/([^/]+)/(.+)", transcript_uri
                )
            if not match:
                logger.warning(
                    "transcribe.unparseable_uri", uri=transcript_uri
                )
                return transcript_text, segments, confidence, medical_terms

            bucket, key = match.group(1), match.group(2)
            s3_client = self._get_s3_client()
            obj = s3_client.get_object(Bucket=bucket, Key=key)
            body = obj["Body"]
            try:
                result_json = json.loads(body.read().decode("utf-8"))
            finally:
                body.close()

            # Extract transcript text from results
            transcripts = (
                result_json.get("results", {}).get("transcripts", [])
            )
            if transcripts:
                transcript_text = transcripts[0].get("transcript", "")

            # Extract segments from items
            items = result_json.get("results", {}).get("items", [])
            for item in items:
                if item.get("type") == "pronunciation":
                    alts = item.get("alternatives", [])
                    best = alts[0] if alts else {}
                    seg_confidence = float(best.get("confidence", 0.0))
                    segments.append(
                        {
                            "text": best.get("content", ""),
                            "start_time": float(
                                item.get("start_time", 0.0)
                            ),
                            "end_time": float(item.get("end_time", 0.0)),
                            "confidence": seg_confidence,
                            "is_partial": False,
                        }
                    )

            # Compute average confidence
            if segments:
                confidence = sum(s["confidence"] for s in segments) / len(
                    segments
                )

            # Detect known medical terms in the transcript
            lower_text = transcript_text.lower()
            medical_terms = [
                term
                for term in MEDICAL_VOCABULARY_BOOST
                if term.lower() in lower_text
            ]

        except Exception as exc:
            logger.error(
                "transcribe.s3_download_failed",
                uri=transcript_uri,
                error=str(exc),
                exc_info=True,
            )

        return transcript_text, segments, confidence, medical_terms

    def _local_fallback(
        self, audio_bytes: bytes, language_code: str
    ) -> dict[str, Any]:
        """Local fallback for development / testing without AWS credentials."""
        logger.warning("transcribe.using_local_fallback")
        audio_hash = hashlib.sha256(audio_bytes[:1024]).hexdigest()[:8]
        return {
            "transcript": (
                f"[DEV FALLBACK] Transcription placeholder for {language_code} "
                f"audio ({len(audio_bytes)} bytes, hash={audio_hash})"
            ),
            "segments": [
                {
                    "text": "[DEV FALLBACK] Transcription placeholder",
                    "start_time": 0.0,
                    "end_time": 1.0,
                    "confidence": 0.5,
                    "is_partial": False,
                }
            ],
            "confidence": 0.5,
            "medical_terms": [],
        }

    # ------------------------------------------------------------------
    # Streaming transcription
    # ------------------------------------------------------------------

    def _get_streaming_client(self) -> Any:
        """
        Create an Amazon Transcribe Streaming client using the SDK.

        Returns None if the SDK is not installed.
        """
        if not _HAS_STREAMING_SDK:
            return None

        try:
            kwargs: dict[str, Any] = {"region": self._settings.aws_region}
            # The SDK's TranscribeStreamingClient picks up credentials from
            # the standard AWS credential chain (env vars, IAM role, etc.).
            # We don't need to pass them explicitly.
            return TranscribeStreamingClient(**kwargs)
        except Exception as exc:
            logger.error(
                "transcribe.streaming_client_init_failed",
                error=str(exc),
                exc_info=True,
            )
            return None

    async def _start_streaming_connection(
        self, session: StreamSession
    ) -> bool:
        """
        Open a bidirectional HTTP/2 streaming connection to AWS Transcribe
        Medical Streaming using the SDK.

        Returns True if the connection was successfully established, False
        otherwise (caller should fall back to batch-per-chunk).
        """
        if not _HAS_STREAMING_SDK:
            return False

        try:
            client = self._get_streaming_client()
            if client is None:
                return False

            session.stream_client = client
            session._result_collector = _StreamingResultCollector()

            # Start the medical stream transcription.
            # The SDK manages the HTTP/2 event stream internally.
            stream_response = await client.start_medical_stream_transcription(
                language_code=session.language_code,
                media_sample_rate_hz=session.sample_rate,
                media_encoding="pcm",
                specialty="PRIMARYCARE",
                type=self._settings.transcribe_type,
            )

            session.stream_response = stream_response
            session._audio_stream = stream_response.input_stream
            session.uses_streaming_sdk = True

            # Start a background task that reads transcript events from the
            # output stream and feeds them into the result collector.
            session._stream_task = asyncio.create_task(
                self._read_stream_events(session)
            )

            logger.info(
                "transcribe.streaming_connection_opened",
                session_id=session.session_id,
            )
            return True

        except Exception as exc:
            logger.error(
                "transcribe.streaming_connection_failed",
                session_id=session.session_id,
                error=str(exc),
                exc_info=True,
            )
            # Reset any partial state
            session.stream_client = None
            session.stream_response = None
            session._audio_stream = None
            session._result_collector = None
            session.uses_streaming_sdk = False
            return False

    async def _read_stream_events(self, session: StreamSession) -> None:
        """
        Background task: read transcript events from the streaming response
        output and hand them to the session's result collector.
        """
        try:
            output_stream = session.stream_response.output_stream
            async for event in output_stream:
                if not session.is_active:
                    break
                # The SDK event objects expose a .to_response_dict() or can be
                # introspected.  We normalise to a dict for the collector.
                if hasattr(event, "transcript_event"):
                    # SDK model object
                    raw = event.to_response_dict()
                    session._result_collector.handle_transcript_event(raw)
                elif isinstance(event, dict):
                    session._result_collector.handle_transcript_event(event)
        except asyncio.CancelledError:
            logger.debug(
                "transcribe.stream_reader_cancelled",
                session_id=session.session_id,
            )
        except Exception as exc:
            logger.error(
                "transcribe.stream_reader_error",
                session_id=session.session_id,
                error=str(exc),
                exc_info=True,
            )

    async def start_stream(
        self,
        language_code: str = "en-IN",
        sample_rate: int = 16000,
    ) -> StreamSession:
        """
        Start a new streaming transcription session.

        In production with the Transcribe Streaming SDK available, this opens
        a bidirectional HTTP/2 event stream to AWS Transcribe Medical
        Streaming.  Otherwise it falls back to a buffer-based approach that
        batch-transcribes accumulated chunks.
        """
        session_id = uuid.uuid4().hex
        session = StreamSession(
            session_id=session_id,
            language_code=language_code,
            sample_rate=sample_rate,
        )

        # Attempt to open a real streaming connection in production
        if self._settings.is_production and _HAS_STREAMING_SDK:
            connected = await self._start_streaming_connection(session)
            if connected:
                logger.info(
                    "transcribe.stream_started",
                    session_id=session_id,
                    language=language_code,
                    mode="streaming_sdk",
                )
                return session
            else:
                logger.warning(
                    "transcribe.streaming_sdk_fallback",
                    session_id=session_id,
                    detail="Could not establish streaming connection; "
                           "falling back to batch-per-chunk mode",
                )

        logger.info(
            "transcribe.stream_started",
            session_id=session_id,
            language=language_code,
            mode="batch_fallback" if self._settings.is_production else "dev_fallback",
        )
        return session

    async def feed_audio_chunk(
        self, session: StreamSession, chunk: bytes
    ) -> list[dict[str, Any]]:
        """
        Feed an audio chunk into the streaming session.

        Returns any new partial or final results.
        """
        if not session.is_active:
            return []

        # Prevent unbounded buffer growth (max 10 seconds of audio)
        max_buffer_size = session.sample_rate * 2 * 10  # 10s of 16-bit mono
        if len(session.audio_buffer) + len(chunk) > max_buffer_size:
            logger.warning(
                "transcribe.buffer_overflow",
                session_id=session.session_id,
                buffer_size=len(session.audio_buffer),
                chunk_size=len(chunk),
            )
            # Drop oldest data to make room
            overflow = len(session.audio_buffer) + len(chunk) - max_buffer_size
            session.audio_buffer = session.audio_buffer[overflow:]

        session.audio_buffer.extend(chunk)
        results: list[dict[str, Any]] = []

        # Process when buffer reaches a threshold (e.g. ~0.5s of 16kHz 16-bit mono)
        chunk_threshold = session.sample_rate  # 1 second of audio
        if len(session.audio_buffer) >= chunk_threshold * 2:
            try:
                result = await self._process_stream_chunk(session)
                if result:
                    results.append(result)
            except Exception:
                logger.error(
                    "transcribe.stream_chunk_error",
                    session_id=session.session_id,
                    exc_info=True,
                )

        return results

    async def _process_stream_chunk(
        self, session: StreamSession
    ) -> Optional[dict[str, Any]]:
        """
        Process accumulated audio in the stream buffer.

        Behaviour depends on mode:
        1. **Dev fallback** (non-production): returns a placeholder partial.
        2. **Streaming SDK** (production + SDK installed + connection open):
           sends the raw PCM audio chunk through the active event stream and
           drains any partial/final results the background reader has
           collected.
        3. **Batch fallback** (production but SDK unavailable or connection
           failed): batch-transcribes the accumulated chunk via the standard
           Transcribe Medical job API.
        """
        buffer_size = len(session.audio_buffer)
        duration_estimate = buffer_size / (session.sample_rate * 2)

        if not self._settings.is_production:
            # Development fallback: return partial results
            partial_text = (
                f"[STREAMING] Partial transcript "
                f"({duration_estimate:.1f}s buffered)"
            )
            session.partial_transcript = partial_text
            # Clear processed audio from buffer
            session.audio_buffer.clear()
            return {
                "transcript": partial_text,
                "is_partial": True,
                "confidence": 0.5,
                "medical_terms": [],
            }

        # -----------------------------------------------------------------
        # Production path: prefer the Streaming SDK if connected
        # -----------------------------------------------------------------
        if session.uses_streaming_sdk and session._audio_stream is not None:
            try:
                audio_chunk = bytes(session.audio_buffer)
                session.audio_buffer.clear()

                # Send the audio chunk through the event stream
                await session._audio_stream.send_audio_event(
                    audio_chunk=audio_chunk
                )

                # Give the background reader a brief moment to process any
                # results that arrive from the service.
                await asyncio.sleep(0.05)

                # Drain any results the collector has gathered
                if session._result_collector is not None:
                    collected = session._result_collector.drain_results()
                    if collected:
                        # Return the most recent result (partial or final)
                        latest = collected[-1]
                        session.partial_transcript = latest.get(
                            "transcript", ""
                        )
                        # Accumulate final segments into the session
                        for r in collected:
                            if not r.get("is_partial", True):
                                session.final_segments.extend(
                                    session._result_collector.final_segments
                                )
                        return latest

                # No results yet -- return a partial indicator
                return {
                    "transcript": session.partial_transcript or "",
                    "is_partial": True,
                    "confidence": 0.0,
                    "medical_terms": [],
                }

            except Exception as exc:
                logger.error(
                    "transcribe.streaming_send_error",
                    session_id=session.session_id,
                    error=str(exc),
                    exc_info=True,
                )
                # Mark the streaming connection as broken so subsequent
                # chunks use the batch fallback.
                session.uses_streaming_sdk = False
                session._audio_stream = None
                logger.warning(
                    "transcribe.streaming_degraded_to_batch",
                    session_id=session.session_id,
                )
                # Fall through to batch path below

        # -----------------------------------------------------------------
        # Batch-per-chunk fallback (production, no streaming SDK or broken)
        # -----------------------------------------------------------------
        audio_chunk = bytes(session.audio_buffer)
        session.audio_buffer.clear()

        try:
            result = await self.transcribe_audio(
                audio_bytes=audio_chunk,
                sample_rate=session.sample_rate,
                language_code=session.language_code,
            )
            return {
                "transcript": result["transcript"],
                "is_partial": False,
                "confidence": result.get("confidence", 0.0),
                "medical_terms": result.get("medical_terms", []),
            }
        except Exception:
            logger.error("transcribe.stream_process_error", exc_info=True)
            return None

    async def end_stream(
        self, session: StreamSession
    ) -> Optional[dict[str, Any]]:
        """
        End a streaming session and return any remaining transcript.

        If the session was using the Transcribe Streaming SDK, this:
        1. Sends any remaining buffered audio through the event stream.
        2. Signals end-of-stream to the service.
        3. Waits for final transcript results from the background reader.
        4. Closes the streaming connection and cancels the reader task.
        """
        session.is_active = False
        elapsed = round(time.monotonic() - session.created_at, 3)

        # -----------------------------------------------------------------
        # Streaming SDK path: close the event stream gracefully
        # -----------------------------------------------------------------
        if session.uses_streaming_sdk and session._audio_stream is not None:
            try:
                # Send any remaining buffered audio
                if session.audio_buffer:
                    remaining_audio = bytes(session.audio_buffer)
                    session.audio_buffer.clear()
                    await session._audio_stream.send_audio_event(
                        audio_chunk=remaining_audio
                    )

                # Signal end of the audio stream
                await session._audio_stream.end_stream()

                # Wait briefly for the background reader to finish processing
                # final events from the service.
                if session._stream_task is not None:
                    try:
                        await asyncio.wait_for(session._stream_task, timeout=5.0)
                    except asyncio.TimeoutError:
                        logger.warning(
                            "transcribe.stream_reader_timeout",
                            session_id=session.session_id,
                        )
                        session._stream_task.cancel()

                # Collect final results
                final_result: Optional[dict[str, Any]] = None
                if session._result_collector is not None:
                    collected = session._result_collector.drain_results()
                    # Prefer the last final (non-partial) result
                    for r in reversed(collected):
                        if not r.get("is_partial", True):
                            final_result = r
                            break
                    # If no final result was pending, synthesise one from
                    # the full accumulated transcript.
                    if final_result is None:
                        full_transcript = (
                            session._result_collector.final_transcript.strip()
                        )
                        if full_transcript:
                            avg_conf = (
                                session._result_collector.confidence_sum
                                / session._result_collector.confidence_count
                                if session._result_collector.confidence_count
                                else 0.0
                            )
                            lower_text = full_transcript.lower()
                            medical_terms = [
                                term
                                for term in MEDICAL_VOCABULARY_BOOST
                                if term.lower() in lower_text
                            ]
                            final_result = {
                                "transcript": full_transcript,
                                "is_partial": False,
                                "confidence": avg_conf,
                                "medical_terms": medical_terms,
                            }

                logger.info(
                    "transcribe.stream_ended",
                    session_id=session.session_id,
                    elapsed=elapsed,
                    mode="streaming_sdk",
                )

                # Clean up references
                session.stream_client = None
                session.stream_response = None
                session._audio_stream = None
                session._result_collector = None
                session._stream_task = None

                return final_result

            except Exception as exc:
                logger.error(
                    "transcribe.stream_end_error",
                    session_id=session.session_id,
                    error=str(exc),
                    exc_info=True,
                )
                # Clean up even on error
                if session._stream_task is not None:
                    session._stream_task.cancel()
                session.stream_client = None
                session.stream_response = None
                session._audio_stream = None
                session._result_collector = None
                session._stream_task = None
                # Fall through to batch fallback below

        # -----------------------------------------------------------------
        # Non-streaming paths (dev fallback / batch fallback)
        # -----------------------------------------------------------------
        logger.info(
            "transcribe.stream_ended",
            session_id=session.session_id,
            elapsed=elapsed,
            mode="batch_fallback" if self._settings.is_production else "dev_fallback",
        )

        # Process any remaining audio in the buffer
        if session.audio_buffer:
            try:
                remaining_audio = bytes(session.audio_buffer)
                session.audio_buffer.clear()

                if not self._settings.is_production:
                    return {
                        "transcript": f"[STREAMING FINAL] Session {session.session_id} ended",
                        "is_partial": False,
                        "confidence": 0.5,
                        "medical_terms": [],
                    }

                result = await self.transcribe_audio(
                    audio_bytes=remaining_audio,
                    sample_rate=session.sample_rate,
                    language_code=session.language_code,
                )
                return {
                    "transcript": result["transcript"],
                    "is_partial": False,
                    "confidence": result.get("confidence", 0.0),
                    "medical_terms": result.get("medical_terms", []),
                }
            except Exception:
                logger.error("transcribe.stream_end_error", exc_info=True)

        return None
