"""
Pydantic models for the Voice Processing service.

Defines request/response schemas for all voice endpoints including
transcription, text-to-speech, prosody analysis, and language detection.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SupportedLanguage(str, Enum):
    """Languages supported by the voice service.

    Covers all 22 Scheduled Languages of India plus English,
    as required by the Vaidyah specification for India's linguistic diversity.
    """

    # Primary languages (full Transcribe + Polly support)
    ENGLISH_IN = "en-IN"
    HINDI = "hi-IN"
    BENGALI = "bn-IN"
    TAMIL = "ta-IN"
    TELUGU = "te-IN"
    MARATHI = "mr-IN"
    GUJARATI = "gu-IN"
    KANNADA = "kn-IN"
    MALAYALAM = "ml-IN"
    # Extended Indian languages (Transcribe auto-detect + Bedrock translation)
    PUNJABI = "pa-IN"
    ODIA = "or-IN"
    ASSAMESE = "as-IN"
    URDU = "ur-IN"
    MAITHILI = "mai-IN"
    SANTALI = "sat-IN"
    KASHMIRI = "ks-IN"
    NEPALI = "ne-IN"
    SINDHI = "sd-IN"
    KONKANI = "kok-IN"
    DOGRI = "doi-IN"
    MANIPURI = "mni-IN"
    BODO = "brx-IN"
    SANSKRIT = "sa-IN"


class AudioFormat(str, Enum):
    """Supported audio file formats."""

    WAV = "wav"
    MP3 = "mp3"
    OGG = "ogg"
    WEBM = "webm"
    FLAC = "flac"
    M4A = "m4a"


class TranscriptionStatus(str, Enum):
    """Status of a transcription job."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


# ---------------------------------------------------------------------------
# Audio Metadata
# ---------------------------------------------------------------------------

class AudioMetadata(BaseModel):
    """Metadata about an audio file."""

    file_name: str
    file_size_bytes: int
    format: AudioFormat
    sample_rate: int
    channels: int = 1
    duration_seconds: float
    bit_depth: Optional[int] = None
    codec: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("duration_seconds")
    @classmethod
    def validate_duration(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("duration_seconds must be positive")
        return round(v, 3)


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

class TranscriptionRequest(BaseModel):
    """Request body for the transcription endpoint (metadata alongside file upload)."""

    language: Optional[SupportedLanguage] = None
    auto_detect_language: bool = True
    medical_vocabulary_boost: bool = True
    specialty: str = "PRIMARYCARE"
    enable_punctuation: bool = True
    enable_partial_results: bool = False
    session_id: Optional[str] = None
    patient_id: Optional[str] = None
    encounter_id: Optional[str] = None

    @field_validator("specialty")
    @classmethod
    def validate_specialty(cls, v: str) -> str:
        allowed = {"PRIMARYCARE", "CARDIOLOGY", "NEUROLOGY", "ONCOLOGY", "RADIOLOGY", "UROLOGY"}
        if v.upper() not in allowed:
            raise ValueError(f"specialty must be one of {allowed}")
        return v.upper()


class TranscriptionSegment(BaseModel):
    """A single transcribed segment with timing information."""

    text: str
    start_time: float
    end_time: float
    confidence: float = Field(ge=0.0, le=1.0)
    speaker: Optional[str] = None
    is_partial: bool = False


class TranscriptionResponse(BaseModel):
    """Response from the transcription endpoint."""

    request_id: UUID = Field(default_factory=uuid4)
    status: TranscriptionStatus = TranscriptionStatus.COMPLETED
    transcript: str
    segments: list[TranscriptionSegment] = []
    language_detected: Optional[SupportedLanguage] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    duration_seconds: float = 0.0
    medical_terms_detected: list[str] = []
    audio_metadata: Optional[AudioMetadata] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StreamingTranscriptionMessage(BaseModel):
    """WebSocket message for real-time streaming transcription."""

    type: str  # "audio_chunk", "config", "end_stream"
    data: Optional[str] = None  # base64-encoded audio chunk
    language: Optional[str] = None
    sample_rate: Optional[int] = None
    session_id: Optional[str] = None


class StreamingTranscriptionResult(BaseModel):
    """WebSocket response for streaming transcription."""

    type: str  # "partial", "final", "error", "metadata"
    transcript: str = ""
    confidence: float = 0.0
    is_partial: bool = False
    medical_terms: list[str] = []
    language_detected: Optional[str] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Text-to-Speech
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    """Request body for text-to-speech synthesis."""

    text: str = Field(min_length=1, max_length=3000)
    language: SupportedLanguage = SupportedLanguage.ENGLISH_IN
    use_ssml: bool = False
    output_format: str = "mp3"
    sample_rate: str = "24000"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=1.0, ge=0.5, le=2.0)
    volume: float = Field(default=1.0, ge=0.1, le=3.0)
    cache_enabled: bool = True
    session_id: Optional[str] = None

    @field_validator("output_format")
    @classmethod
    def validate_output_format(cls, v: str) -> str:
        allowed = {"mp3", "ogg_vorbis", "pcm", "json"}
        if v not in allowed:
            raise ValueError(f"output_format must be one of {allowed}")
        return v


class TTSResponse(BaseModel):
    """Response from the text-to-speech endpoint."""

    request_id: UUID = Field(default_factory=uuid4)
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None
    content_type: str = "audio/mpeg"
    duration_seconds: Optional[float] = None
    language: SupportedLanguage
    voice_id: str
    characters_synthesized: int
    cached: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Prosody Analysis
# ---------------------------------------------------------------------------

class ProsodyFeatures(BaseModel):
    """Raw prosody features extracted from audio."""

    pitch_mean_hz: float = 0.0
    pitch_std_hz: float = 0.0
    pitch_min_hz: float = 0.0
    pitch_max_hz: float = 0.0
    speaking_rate_syllables_per_sec: float = 0.0
    energy_mean_db: float = 0.0
    energy_std_db: float = 0.0
    pause_count: int = 0
    pause_total_duration_sec: float = 0.0
    pause_mean_duration_sec: float = 0.0
    hesitation_count: int = 0
    voice_quality_jitter: float = 0.0
    voice_quality_shimmer: float = 0.0


class EmotionalScores(BaseModel):
    """Emotional state scores derived from prosody analysis."""

    distress: float = Field(ge=0.0, le=1.0, default=0.0)
    pain: float = Field(ge=0.0, le=1.0, default=0.0)
    anxiety: float = Field(ge=0.0, le=1.0, default=0.0)
    fatigue: float = Field(ge=0.0, le=1.0, default=0.0)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)


class ProsodyAnalysisResult(BaseModel):
    """Response from the prosody analysis endpoint."""

    request_id: UUID = Field(default_factory=uuid4)
    features: ProsodyFeatures
    emotional_scores: EmotionalScores
    analysis_method: str = "rule_based"  # "rule_based" or "ml_model"
    model_version: Optional[str] = None
    duration_seconds: float = 0.0
    audio_metadata: Optional[AudioMetadata] = None
    clinical_notes: list[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Language Detection
# ---------------------------------------------------------------------------

class LanguageScore(BaseModel):
    """Confidence score for a detected language."""

    language: SupportedLanguage
    confidence: float = Field(ge=0.0, le=1.0)


class LanguageDetectionResult(BaseModel):
    """Response from the language detection endpoint."""

    request_id: UUID = Field(default_factory=uuid4)
    primary_language: SupportedLanguage
    confidence: float = Field(ge=0.0, le=1.0)
    all_scores: list[LanguageScore] = []
    detection_source: str = "audio"  # "audio", "text", "combined"
    script_detected: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Dialect Detection
# ---------------------------------------------------------------------------

class DialectDetectionRequest(BaseModel):
    """Request body for the dialect detection endpoint."""

    text: str = Field(min_length=1, max_length=5000, description="Text to analyse for dialect markers")
    base_language: Optional[str] = Field(
        default=None,
        description=(
            "BCP-47 language code of the parent language (e.g. 'hi-IN'). "
            "If omitted, the service will auto-detect the base language first."
        ),
    )
    audio_features: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "Optional audio/prosody features to supplement lexical analysis. "
            "Expected keys: pitch_mean_hz, pitch_std_hz, speaking_rate, etc."
        ),
    )


class DialectDetectionResponse(BaseModel):
    """Response from the dialect detection endpoint."""

    request_id: UUID = Field(default_factory=uuid4)
    base_language: str = Field(description="Detected or provided base language code")
    dialect_name: str = Field(description="Identified dialect name, or 'standard'")
    region: str = Field(description="Geographic region associated with the dialect")
    confidence: float = Field(ge=0.0, le=1.0, description="Classification confidence")
    linguistic_features: dict[str, Any] = Field(
        default_factory=dict,
        description="Detected linguistic signals supporting the classification",
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Health / Generic
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    service: str = "voice-service"
    version: str = "1.0.0"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checks: dict[str, Any] = {}


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    detail: Optional[str] = None
    request_id: Optional[UUID] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
