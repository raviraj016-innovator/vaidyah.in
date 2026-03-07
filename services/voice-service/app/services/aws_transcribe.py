"""
AWS Transcribe Medical integration.

Provides both batch (file-upload) and real-time streaming transcription
with medical vocabulary boosting and custom vocabulary support.
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

    async def start_stream(
        self,
        language_code: str = "en-IN",
        sample_rate: int = 16000,
    ) -> StreamSession:
        """
        Start a new streaming transcription session.

        In production this would open a bidirectional HTTP/2 stream to
        AWS Transcribe Streaming. Here we maintain a buffer-based session.
        """
        session_id = uuid.uuid4().hex
        session = StreamSession(
            session_id=session_id,
            language_code=language_code,
            sample_rate=sample_rate,
        )
        logger.info(
            "transcribe.stream_started",
            session_id=session_id,
            language=language_code,
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

        In production, this sends chunks to the AWS Transcribe Streaming API.
        For development, returns a partial placeholder.
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

        # Production: send to AWS Transcribe Streaming
        # This would use the amazon-transcribe-streaming-sdk
        client = self._get_client()
        loop = asyncio.get_running_loop()

        audio_chunk = bytes(session.audio_buffer)
        session.audio_buffer.clear()

        # NOTE: Full production streaming implementation would use
        # amazon-transcribe-streaming-sdk with event streams.
        # This is a simplified version using batch processing of chunks.
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
        """End a streaming session and return any remaining transcript."""
        session.is_active = False
        logger.info(
            "transcribe.stream_ended",
            session_id=session.session_id,
            elapsed=round(time.monotonic() - session.created_at, 3),
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
