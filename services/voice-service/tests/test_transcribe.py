"""Tests for the transcription router (POST /api/v1/voice/transcribe)."""

from __future__ import annotations

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import generate_wav_bytes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_transcribe_result(text: str = "Patient reports chest pain"):
    """Return a mock transcription result dict."""
    return {
        "transcript": text,
        "segments": [
            {
                "text": text,
                "start_time": 0.0,
                "end_time": 1.0,
                "confidence": 0.95,
                "is_partial": False,
            }
        ],
        "confidence": 0.95,
        "medical_terms": ["chest pain"],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTranscribeAudio:
    """POST /api/v1/voice/transcribe"""

    @patch("app.routers.transcribe._get_transcribe_service")
    @patch("app.routers.transcribe._get_language_detector")
    @patch("app.utils.audio.AudioUtils.normalize_audio")
    def test_transcribe_audio_success(
        self,
        mock_normalize,
        mock_lang_detector_factory,
        mock_transcribe_factory,
        test_client,
    ):
        """Successful transcription returns structured JSON with transcript and segments."""
        wav_bytes = generate_wav_bytes(duration_seconds=1.0)

        # Mock the audio normalizer to return valid PCM bytes
        mock_normalize.return_value = (wav_bytes, 16000, 1.0, 1)

        # Mock the language detector
        mock_lang_detector = MagicMock()
        mock_lang_detector.detect_from_audio = AsyncMock(return_value=None)
        mock_lang_detector_factory.return_value = mock_lang_detector

        # Mock the transcribe service
        mock_transcribe_svc = MagicMock()
        mock_transcribe_svc.transcribe_audio = AsyncMock(
            return_value=_make_transcribe_result()
        )
        mock_transcribe_factory.return_value = mock_transcribe_svc

        response = test_client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("test.wav", io.BytesIO(wav_bytes), "audio/wav")},
            data={"language": "en-IN", "auto_detect_language": "false"},
        )

        assert response.status_code == 200
        body = response.json()
        assert "transcript" in body
        assert body["transcript"] == "Patient reports chest pain"
        assert body["status"] == "completed"
        assert "segments" in body
        assert len(body["segments"]) >= 1
        assert body["segments"][0]["confidence"] == 0.95

    @patch("app.routers.transcribe._get_transcribe_service")
    @patch("app.routers.transcribe._get_language_detector")
    def test_transcribe_audio_empty_file(
        self,
        mock_lang_detector_factory,
        mock_transcribe_factory,
        test_client,
    ):
        """Uploading an empty file returns 400."""
        mock_lang_detector_factory.return_value = MagicMock()
        mock_transcribe_factory.return_value = MagicMock()

        response = test_client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("empty.wav", io.BytesIO(b""), "audio/wav")},
        )

        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()

    @patch("app.routers.transcribe._get_transcribe_service")
    @patch("app.routers.transcribe._get_language_detector")
    def test_transcribe_audio_oversized_file(
        self,
        mock_lang_detector_factory,
        mock_transcribe_factory,
        test_client,
        mock_settings,
    ):
        """Uploading a file exceeding max size returns 413."""
        mock_lang_detector_factory.return_value = MagicMock()
        mock_transcribe_factory.return_value = MagicMock()

        # Settings has max 50 MB; create a slightly-over-limit payload
        # We simulate by patching the max to a tiny value
        mock_settings.max_audio_file_size_mb = 0  # 0 bytes max

        oversized_data = b"\x00" * 1024  # 1 KB, but max is 0 bytes

        response = test_client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("big.wav", io.BytesIO(oversized_data), "audio/wav")},
        )

        assert response.status_code == 413
        assert "exceeds" in response.json()["detail"].lower()

    @patch("app.routers.transcribe._get_transcribe_service")
    @patch("app.routers.transcribe._get_language_detector")
    def test_transcribe_audio_unsupported_format(
        self,
        mock_lang_detector_factory,
        mock_transcribe_factory,
        test_client,
    ):
        """Uploading an unsupported audio format returns 400."""
        mock_lang_detector_factory.return_value = MagicMock()
        mock_transcribe_factory.return_value = MagicMock()

        # Use a .txt extension which is not in supported_audio_formats
        response = test_client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("test.txt", io.BytesIO(b"not audio"), "text/plain")},
        )

        assert response.status_code == 400
        assert "unsupported" in response.json()["detail"].lower()

    @patch("app.routers.transcribe._get_transcribe_service")
    @patch("app.routers.transcribe._get_language_detector")
    @patch("app.utils.audio.AudioUtils.normalize_audio")
    def test_transcribe_audio_medical_terms_detected(
        self,
        mock_normalize,
        mock_lang_detector_factory,
        mock_transcribe_factory,
        test_client,
    ):
        """Medical terms in the transcript are returned in the response."""
        wav_bytes = generate_wav_bytes(duration_seconds=1.0)
        mock_normalize.return_value = (wav_bytes, 16000, 1.0, 1)

        mock_lang_detector = MagicMock()
        mock_lang_detector.detect_from_audio = AsyncMock(return_value=None)
        mock_lang_detector_factory.return_value = mock_lang_detector

        result = _make_transcribe_result("Patient has diabetes and hypertension")
        result["medical_terms"] = ["diabetes", "hypertension"]

        mock_transcribe_svc = MagicMock()
        mock_transcribe_svc.transcribe_audio = AsyncMock(return_value=result)
        mock_transcribe_factory.return_value = mock_transcribe_svc

        response = test_client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("test.wav", io.BytesIO(wav_bytes), "audio/wav")},
            data={"language": "en-IN", "auto_detect_language": "false"},
        )

        assert response.status_code == 200
        body = response.json()
        assert "diabetes" in body["medical_terms_detected"]
        assert "hypertension" in body["medical_terms_detected"]

    @patch("app.routers.transcribe._get_transcribe_service")
    @patch("app.routers.transcribe._get_language_detector")
    @patch("app.utils.audio.AudioUtils.normalize_audio")
    def test_transcribe_audio_includes_session_id(
        self,
        mock_normalize,
        mock_lang_detector_factory,
        mock_transcribe_factory,
        test_client,
    ):
        """When a session_id is provided, it appears in the response."""
        wav_bytes = generate_wav_bytes(duration_seconds=1.0)
        mock_normalize.return_value = (wav_bytes, 16000, 1.0, 1)

        mock_lang_detector = MagicMock()
        mock_lang_detector.detect_from_audio = AsyncMock(return_value=None)
        mock_lang_detector_factory.return_value = mock_lang_detector

        mock_transcribe_svc = MagicMock()
        mock_transcribe_svc.transcribe_audio = AsyncMock(
            return_value=_make_transcribe_result()
        )
        mock_transcribe_factory.return_value = mock_transcribe_svc

        response = test_client.post(
            "/api/v1/voice/transcribe",
            files={"file": ("test.wav", io.BytesIO(wav_bytes), "audio/wav")},
            data={
                "language": "en-IN",
                "auto_detect_language": "false",
                "session_id": "sess-abc-123",
            },
        )

        assert response.status_code == 200
        assert response.json()["session_id"] == "sess-abc-123"
