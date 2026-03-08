"""Tests for the voice recording storage router."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from tests.conftest import generate_wav_bytes


class TestUploadRecording:
    """POST /api/v1/voice/recordings/upload"""

    def test_upload_recording_success_with_s3(self, test_client, mock_shared_state):
        """Uploading a valid file to S3 returns success with key and etag."""
        wav_bytes = generate_wav_bytes(duration_seconds=0.5)

        response = test_client.post(
            "/api/v1/voice/recordings/upload",
            files={"file": ("session.wav", io.BytesIO(wav_bytes), "audio/wav")},
            data={"consultation_id": "consult-001", "speaker": "doctor"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "consult-001" in body["data"]["key"]
        assert "doctor" in body["data"]["key"]
        assert body["data"]["size_bytes"] == len(wav_bytes)

    def test_upload_recording_dev_fallback_no_s3(self, test_client, mock_shared_state):
        """When S3 client is None, the dev fallback is returned."""
        mock_shared_state["s3_client"] = None

        with patch("app.routers.storage._get_s3_client", return_value=None):
            wav_bytes = generate_wav_bytes(duration_seconds=0.5)
            response = test_client.post(
                "/api/v1/voice/recordings/upload",
                files={"file": ("rec.wav", io.BytesIO(wav_bytes), "audio/wav")},
                data={"consultation_id": "consult-002"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"].get("mode") == "dev_fallback"

    def test_upload_recording_missing_consultation_id(self, test_client):
        """Omitting the required consultation_id returns 422 Unprocessable Entity."""
        wav_bytes = generate_wav_bytes(duration_seconds=0.5)

        response = test_client.post(
            "/api/v1/voice/recordings/upload",
            files={"file": ("rec.wav", io.BytesIO(wav_bytes), "audio/wav")},
            # Intentionally omitting consultation_id
        )

        assert response.status_code == 422

    def test_upload_recording_empty_file(self, test_client):
        """Uploading an empty file returns 400."""
        response = test_client.post(
            "/api/v1/voice/recordings/upload",
            files={"file": ("empty.wav", io.BytesIO(b""), "audio/wav")},
            data={"consultation_id": "consult-003"},
        )

        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()


class TestGetRecordingUrl:
    """GET /api/v1/voice/recordings/{consultation_id}"""

    def test_get_recording_url_not_found(self, test_client, mock_shared_state):
        """When S3 returns no objects, a 404 is returned."""
        s3 = mock_shared_state["s3_client"]
        s3.list_objects_v2.return_value = {"Contents": []}

        response = test_client.get("/api/v1/voice/recordings/consult-nonexistent")

        assert response.status_code == 404
        assert "no recordings" in response.json()["detail"].lower()

    def test_get_recording_url_success(self, test_client, mock_shared_state):
        """When S3 has recordings, a presigned URL is returned."""
        s3 = mock_shared_state["s3_client"]
        s3.list_objects_v2.return_value = {
            "Contents": [
                {
                    "Key": "consultations/consult-001/mixed_12345.wav",
                    "Size": 32000,
                    "LastModified": datetime(2025, 1, 1, tzinfo=timezone.utc),
                }
            ]
        }
        s3.generate_presigned_url.return_value = "https://s3.example.com/signed"

        response = test_client.get("/api/v1/voice/recordings/consult-001")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "signed" in body["data"]["url"]

    def test_get_recording_url_dev_fallback(self, test_client):
        """When no S3 client, dev fallback URL is returned."""
        with patch("app.routers.storage._get_s3_client", return_value=None):
            response = test_client.get("/api/v1/voice/recordings/consult-dev")

        assert response.status_code == 200
        body = response.json()
        assert body["data"].get("mode") == "dev_fallback"
        assert "consult-dev" in body["data"]["url"]


class TestListRecordings:
    """GET /api/v1/voice/recordings/{consultation_id}/list"""

    def test_list_recordings_empty(self, test_client, mock_shared_state):
        """When S3 has no objects for the consultation, an empty list is returned."""
        s3 = mock_shared_state["s3_client"]
        s3.list_objects_v2.return_value = {"Contents": []}

        response = test_client.get("/api/v1/voice/recordings/consult-empty/list")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["data"]["total"] == 0
        assert body["data"]["recordings"] == []

    def test_list_recordings_dev_fallback(self, test_client):
        """When S3 is unavailable, dev fallback returns empty list."""
        with patch("app.routers.storage._get_s3_client", return_value=None):
            response = test_client.get("/api/v1/voice/recordings/consult-dev/list")

        assert response.status_code == 200
        body = response.json()
        assert body["data"]["mode"] == "dev_fallback"
        assert body["data"]["total"] == 0


class TestDeleteRecording:
    """DELETE /api/v1/voice/recordings/{consultation_id}/{filename}"""

    def test_delete_recording_dev_fallback(self, test_client):
        """Without an S3 client, delete returns success (dev fallback)."""
        with patch("app.routers.storage._get_s3_client", return_value=None):
            response = test_client.delete(
                "/api/v1/voice/recordings/consult-001/recording_12345.wav"
            )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert "dev fallback" in body["message"].lower()

    def test_delete_recording_success_with_s3(self, test_client, mock_shared_state):
        """Deleting via S3 returns success and calls delete_object."""
        s3 = mock_shared_state["s3_client"]

        response = test_client.delete(
            "/api/v1/voice/recordings/consult-001/recording_12345.wav"
        )

        assert response.status_code == 200
        s3.delete_object.assert_called_once()
        call_args = s3.delete_object.call_args
        assert "consult-001" in call_args.kwargs["Key"]
