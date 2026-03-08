"""Shared fixtures for the nlu-service test suite."""

from __future__ import annotations

import json
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import jwt as pyjwt
from app.config import Settings


@pytest.fixture()
def mock_settings() -> Settings:
    """Return a Settings instance with safe test defaults."""
    return Settings(
        environment="development",
        debug=True,
        aws_region="ap-south-1",
        aws_access_key_id="test-key-id",
        aws_secret_access_key="test-secret-key",
        bedrock_model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        bedrock_max_tokens=4096,
        bedrock_temperature=0.1,
        comprehend_medical_enabled=True,
        comprehend_medical_confidence_threshold=0.7,
        jwt_secret_key="test-jwt-secret",
        jwt_algorithm="HS256",
        jwt_issuer="vaidyah-auth",
        jwt_audience="vaidyah",
        auth_enabled=True,
    )


@pytest.fixture()
def auth_token(mock_settings: Settings) -> str:
    """Generate a valid JWT token for test requests."""
    now = int(time.time())
    payload = {
        "sub": "test-patient-001",
        "roles": ["patient"],
        "iss": mock_settings.jwt_issuer,
        "aud": mock_settings.jwt_audience,
        "iat": now,
        "exp": now + 3600,
    }
    return pyjwt.encode(payload, mock_settings.jwt_secret_key, algorithm=mock_settings.jwt_algorithm)


@pytest.fixture()
def auth_headers(auth_token: str) -> dict[str, str]:
    """Return Authorization headers with a valid Bearer token."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture()
def mock_bedrock_client() -> MagicMock:
    """Return a mocked BedrockClient that returns structured JSON."""
    client = MagicMock()

    def _mock_invoke_and_parse_json(*, system_prompt, user_message, **kwargs) -> dict:
        """Default: return a plausible symptom extraction result."""
        return {
            "data": [
                {
                    "name": "headache",
                    "original_text": "sir dard",
                    "severity": "moderate",
                    "duration": "2 days",
                    "onset": None,
                    "body_system": "neurological",
                    "icd10_code": "R51.9",
                    "confidence": 0.92,
                    "negated": False,
                    "qualifiers": [],
                }
            ],
            "usage": {"input_tokens": 200, "output_tokens": 150},
            "elapsed_ms": 450.0,
        }

    client.invoke_and_parse_json = MagicMock(side_effect=_mock_invoke_and_parse_json)
    client.invoke = MagicMock(return_value={
        "content": '[]',
        "usage": {"input_tokens": 100, "output_tokens": 50},
        "stop_reason": "end_turn",
        "elapsed_ms": 200.0,
    })
    return client


@pytest.fixture()
def mock_comprehend_medical() -> MagicMock:
    """Return a mocked ComprehendMedicalClient."""
    client = MagicMock()
    client.detect_entities.return_value = [
        MagicMock(
            text="headache",
            entity_type=MagicMock(value="symptom"),
            category="MEDICAL_CONDITION",
            icd10_codes=["R51.9"],
            snomed_codes=[],
            confidence=0.95,
            attributes={},
            begin_offset=10,
            end_offset=18,
        )
    ]
    client.detect_icd10_codes.return_value = [
        {"code": "R51.9", "description": "Headache, unspecified", "confidence": 0.92}
    ]
    return client


@pytest.fixture()
def test_client(
    mock_settings: Settings,
    mock_bedrock_client: MagicMock,
    mock_comprehend_medical: MagicMock,
) -> TestClient:
    """Build a TestClient with mocked AWS clients injected into app state."""
    with patch("app.config.get_settings", return_value=mock_settings):
        from app.main import app

        # Override lifespan-injected state
        app.state.bedrock_client = mock_bedrock_client
        app.state.comprehend_client = mock_comprehend_medical
        app.state.symptom_extractor = MagicMock()

        return TestClient(app, raise_server_exceptions=False)
