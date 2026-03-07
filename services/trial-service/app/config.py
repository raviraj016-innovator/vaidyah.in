"""Application configuration via Pydantic Settings."""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------- Service identity ----------
    service_name: str = "trial-intelligence-service"
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"

    # ---------- FastAPI ----------
    host: str = "0.0.0.0"
    port: int = 8003
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default=["http://localhost:3000", "http://localhost:3001"])

    # ---------- OpenSearch ----------
    opensearch_endpoint: str = "https://localhost:9200"
    opensearch_username: str = Field(default="admin", alias="OPENSEARCH_USERNAME")
    opensearch_password: str = Field(default="admin", alias="OPENSEARCH_PASSWORD")
    opensearch_index: str = "clinical_trials"
    opensearch_use_ssl: bool = True
    opensearch_verify_certs: bool = True

    # ---------- PostgreSQL ----------
    database_url: str = "postgresql+asyncpg://localhost:5432/vaidyah_trials"
    database_pool_min: int = 2
    database_pool_max: int = 10

    # ---------- AWS SageMaker ----------
    sagemaker_matching_endpoint: Optional[str] = None
    sagemaker_region: str = "ap-south-1"

    # ---------- AWS Bedrock ----------
    bedrock_region: str = "ap-south-1"
    bedrock_model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"
    bedrock_max_tokens: int = 2048
    bedrock_temperature: float = 0.3

    # ---------- AWS S3 ----------
    s3_bucket: str = "vaidyah-trial-data"
    s3_region: str = "ap-south-1"

    # ---------- AWS SNS ----------
    sns_topic_arn: Optional[str] = None
    sns_region: str = "ap-south-1"

    # ---------- ClinicalTrials.gov ----------
    ctgov_api_base: str = "https://clinicaltrials.gov/api/v2"
    ctgov_rate_limit_per_second: float = 3.0
    ctgov_page_size: int = 100
    ctgov_max_pages: int = 50

    # ---------- JWT / Auth ----------
    jwt_secret: str = Field(
        default="dev-secret-do-not-use-in-production", alias="JWT_SECRET"
    )
    jwt_algorithm: str = "HS256"
    jwt_audience: str = "vaidyah"
    jwt_issuer: str = "vaidyah-auth"

    # ---------- Scheduler ----------
    match_check_interval_minutes: int = 60
    etl_sync_interval_hours: int = 24

    @model_validator(mode="after")
    def _check_production_secrets(self) -> "Settings":
        if self.environment == "production":
            import os
            if not os.environ.get("JWT_SECRET"):
                raise ValueError(
                    "JWT_SECRET environment variable must be set explicitly "
                    "in production to ensure consistency across processes."
                )
            if self.database_url == "postgresql+asyncpg://localhost:5432/vaidyah_trials":
                raise ValueError(
                    "database_url must not use the default value in production. "
                    "Set the DATABASE_URL environment variable."
                )
            if self.opensearch_username == "admin" or self.opensearch_password == "admin":
                raise ValueError(
                    "OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD must be set "
                    "explicitly in production."
                )
            if not self.opensearch_verify_certs:
                raise ValueError(
                    "opensearch_verify_certs must be True in production. "
                    "Disabling certificate verification exposes medical data to MitM attacks."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton of application settings."""
    return Settings()
