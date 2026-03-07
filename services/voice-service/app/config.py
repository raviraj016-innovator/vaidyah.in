"""
Configuration management for the Voice Processing service.

Loads settings from environment variables with sensible defaults.
Uses pydantic-settings for validation and type coercion.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Service ---
    service_name: str = "vaidyah-voice-service"
    service_version: str = "1.0.0"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = False
    log_level: str = "INFO"

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8001
    workers: int = 2

    # --- AWS General ---
    aws_region: str = Field(default="ap-south-1", alias="AWS_REGION")
    aws_access_key_id: Optional[str] = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: Optional[str] = Field(
        default=None, alias="AWS_SECRET_ACCESS_KEY"
    )
    aws_session_token: Optional[str] = Field(
        default=None, alias="AWS_SESSION_TOKEN"
    )

    # --- AWS Transcribe ---
    transcribe_medical_enabled: bool = True
    transcribe_language_code: str = "en-IN"
    transcribe_sample_rate: int = 16000
    transcribe_media_encoding: str = "pcm"
    transcribe_specialty: str = "PRIMARYCARE"
    transcribe_type: str = "DICTATION"
    transcribe_custom_vocabulary_name: Optional[str] = Field(
        default="vaidyah-medical-vocab",
        alias="TRANSCRIBE_CUSTOM_VOCABULARY",
    )

    # --- AWS Polly ---
    polly_engine: str = "neural"
    polly_output_format: str = "mp3"
    polly_sample_rate: str = "24000"
    polly_cache_enabled: bool = True
    polly_cache_max_size: int = 500

    # --- AWS S3 ---
    s3_audio_bucket: str = Field(
        default="vaidyah-audio-recordings",
        alias="S3_AUDIO_BUCKET",
    )
    s3_tts_cache_bucket: str = Field(
        default="vaidyah-tts-cache",
        alias="S3_TTS_CACHE_BUCKET",
    )
    s3_encryption: str = "aws:kms"
    s3_kms_key_id: Optional[str] = Field(default=None, alias="S3_KMS_KEY_ID")
    s3_presigned_url_expiry: int = 3600  # seconds
    s3_audio_retention_days: int = 90

    # --- AWS SageMaker (Prosody Model) ---
    sagemaker_prosody_endpoint: Optional[str] = Field(
        default=None,
        alias="SAGEMAKER_PROSODY_ENDPOINT",
    )
    sagemaker_prosody_timeout: int = 10  # seconds
    prosody_fallback_to_rules: bool = True

    # --- Auth / JWT ---
    jwt_secret_key: str = Field(
        default="dev-secret-do-not-use-in-production",
        alias="JWT_SECRET_KEY",
    )
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "vaidyah-auth-service"
    auth_enabled: bool = Field(default=True, alias="AUTH_ENABLED")

    # --- CORS ---
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    # --- Audio Processing ---
    max_audio_file_size_mb: int = 50
    supported_audio_formats: list[str] = [
        "wav", "mp3", "ogg", "webm", "flac", "m4a",
    ]
    default_sample_rate: int = 16000
    streaming_chunk_size: int = 4096  # bytes

    # --- Language Support ---
    supported_languages: list[str] = [
        "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN",
    ]
    default_language: str = "en-IN"

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"log_level must be one of {allowed}")
        return upper

    @property
    def max_audio_file_size_bytes(self) -> int:
        return self.max_audio_file_size_mb * 1024 * 1024

    @model_validator(mode="after")
    def _check_production_secrets(self) -> "Settings":
        if self.environment == "production":
            import os
            if not os.environ.get("JWT_SECRET_KEY"):
                raise ValueError(
                    "JWT_SECRET_KEY environment variable must be set explicitly "
                    "in production to ensure consistency across processes."
                )
            if not self.auth_enabled:
                raise ValueError(
                    "AUTH_ENABLED must be True in production. "
                    "Disabling authentication in production is not allowed."
                )
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
