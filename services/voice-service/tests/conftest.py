"""Shared fixtures for the voice-service test suite."""

from __future__ import annotations

import io
import struct
import wave
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

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
        s3_audio_bucket="test-audio-bucket",
        s3_tts_cache_bucket="test-tts-cache-bucket",
        jwt_secret_key="test-jwt-secret",
        auth_enabled=False,
        max_audio_file_size_mb=50,
        sagemaker_prosody_endpoint=None,
    )


@pytest.fixture()
def mock_s3_client() -> MagicMock:
    """Return a mocked boto3 S3 client."""
    client = MagicMock()
    client.put_object.return_value = {"ETag": '"test-etag-123"', "VersionId": "v1"}
    client.generate_presigned_url.return_value = "https://s3.example.com/presigned-url"
    client.list_objects_v2.return_value = {"Contents": []}
    client.delete_object.return_value = {}
    return client


@pytest.fixture()
def mock_shared_state(mock_s3_client: MagicMock) -> dict:
    """Return a mock shared state dict used by the voice-service app."""
    return {
        "s3_client": mock_s3_client,
        "polly_client": MagicMock(),
        "transcribe_client": MagicMock(),
        "boto_session": MagicMock(),
    }


@pytest.fixture()
def test_client(mock_settings: Settings, mock_shared_state: dict) -> TestClient:
    """Build a TestClient that bypasses auth and uses mocked AWS clients."""
    with (
        patch("app.config.get_settings", return_value=mock_settings),
        patch("app.main.get_settings", return_value=mock_settings),
        patch("app.main._shared_state", mock_shared_state),
    ):
        # Import after patching to pick up the mocked settings
        from app.main import app

        # Disable the JWT auth middleware for testing
        # We override the middleware stack by removing JWTAuthMiddleware
        return TestClient(app, raise_server_exceptions=False)


def generate_wav_bytes(
    duration_seconds: float = 1.0,
    sample_rate: int = 16000,
    frequency: float = 440.0,
) -> bytes:
    """Generate valid WAV file bytes with a sine wave for testing."""
    import math

    num_samples = int(sample_rate * duration_seconds)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        value = int(32767 * 0.5 * math.sin(2 * math.pi * frequency * t))
        samples.append(struct.pack("<h", value))

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"".join(samples))

    buf.seek(0)
    return buf.read()
