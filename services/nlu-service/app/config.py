"""Configuration for the NLU service using Pydantic Settings."""

from __future__ import annotations

from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- Service ----------
    service_name: str = "vaidyah-nlu-service"
    service_version: str = "1.0.0"
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = False
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8003

    # ---------- CORS ----------
    cors_origins: list[str] = Field(default=["*"])

    # ---------- AWS General ----------
    aws_region: str = Field(default="ap-south-1", alias="AWS_REGION")
    aws_access_key_id: Optional[str] = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: Optional[str] = Field(
        default=None, alias="AWS_SECRET_ACCESS_KEY"
    )

    # ---------- AWS Bedrock ----------
    bedrock_model_id: str = Field(
        default="anthropic.claude-3-sonnet-20240229-v1:0",
        alias="BEDROCK_MODEL_ID",
    )
    bedrock_max_tokens: int = Field(default=4096, alias="BEDROCK_MAX_TOKENS")
    bedrock_temperature: float = Field(default=0.1, alias="BEDROCK_TEMPERATURE")
    bedrock_top_p: float = Field(default=0.95, alias="BEDROCK_TOP_P")
    bedrock_retry_max_attempts: int = Field(default=3, alias="BEDROCK_RETRY_MAX_ATTEMPTS")
    bedrock_retry_base_delay: float = Field(
        default=1.0, alias="BEDROCK_RETRY_BASE_DELAY"
    )

    # ---------- Amazon Comprehend Medical ----------
    comprehend_medical_enabled: bool = Field(
        default=True, alias="COMPREHEND_MEDICAL_ENABLED"
    )
    comprehend_medical_confidence_threshold: float = Field(
        default=0.7, alias="COMPREHEND_MEDICAL_CONFIDENCE_THRESHOLD"
    )

    # ---------- SageMaker Endpoints ----------
    sagemaker_symptom_endpoint: Optional[str] = Field(
        default=None, alias="SAGEMAKER_SYMPTOM_ENDPOINT"
    )
    sagemaker_severity_endpoint: Optional[str] = Field(
        default=None, alias="SAGEMAKER_SEVERITY_ENDPOINT"
    )
    sagemaker_translation_endpoint: Optional[str] = Field(
        default=None, alias="SAGEMAKER_TRANSLATION_ENDPOINT"
    )

    # ---------- Authentication ----------
    jwt_secret_key: str = Field(
        default="change-me-in-production", alias="JWT_SECRET_KEY"
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_issuer: str = Field(default="vaidyah-auth", alias="JWT_ISSUER")
    auth_enabled: bool = Field(default=False, alias="AUTH_ENABLED")

    # ---------- Rate Limiting ----------
    rate_limit_requests: int = Field(default=100, alias="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(
        default=60, alias="RATE_LIMIT_WINDOW_SECONDS"
    )

    # ---------- Downstream Services ----------
    clinical_service_url: str = Field(
        default="http://clinical-service:8004", alias="CLINICAL_SERVICE_URL"
    )
    voice_service_url: str = Field(
        default="http://voice-service:8002", alias="VOICE_SERVICE_URL"
    )


settings = Settings()
