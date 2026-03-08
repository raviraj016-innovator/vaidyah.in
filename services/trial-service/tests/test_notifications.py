"""Tests for the notifications router and notification engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import NotificationType
from app.services.notification_engine import (
    _build_email_body,
    _is_quiet_hours,
)


class TestGetPatientNotifications:
    """GET /api/v1/notifications/{patient_id}"""

    def test_get_patient_notifications_empty(
        self, test_client, auth_headers, mock_db
    ):
        """A patient with no notifications gets an empty list."""
        mock_db.fetch_all.return_value = []

        response = test_client.get(
            "/api/v1/notifications/test-patient-001",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body == []

    def test_get_patient_notifications_with_data(
        self, test_client, auth_headers, mock_db
    ):
        """A patient with notifications gets them in the response."""
        mock_db.fetch_all.return_value = [
            {
                "notification_id": "notif_abc123",
                "patient_id": "test-patient-001",
                "nct_id": "NCT12345678",
                "notification_type": "new_match",
                "title": "New trial match",
                "message": "A new trial matching your criteria was found.",
                "metadata": json.dumps({"trial_title": "Diabetes Study"}),
                "is_read": False,
                "created_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
                "acknowledged_at": None,
            }
        ]

        response = test_client.get(
            "/api/v1/notifications/test-patient-001",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        notif = body[0]
        assert notif["notification_id"] == "notif_abc123"
        assert notif["nct_id"] == "NCT12345678"
        assert notif["is_read"] is False
        assert notif["notification_type"] == "new_match"

    def test_get_notifications_unauthorized(self, test_client, auth_headers, mock_db):
        """A patient cannot access another patient's notifications (403)."""
        response = test_client.get(
            "/api/v1/notifications/other-patient-999",
            headers=auth_headers,
        )

        assert response.status_code == 403

    def test_get_notifications_missing_auth(self, test_client):
        """Missing auth token returns 401."""
        response = test_client.get("/api/v1/notifications/test-patient-001")
        assert response.status_code == 401


class TestSubscribe:
    """POST /api/v1/notifications/subscribe"""

    def test_create_subscription(self, test_client, auth_headers, mock_db):
        """Creating a subscription returns a subscription_id."""
        response = test_client.post(
            "/api/v1/notifications/subscribe",
            json={
                "patient_id": "test-patient-001",
                "conditions": ["diabetes", "hypertension"],
                "phases": ["Phase 3"],
                "statuses": ["Recruiting"],
                "location_country": "India",
                "notify_via_push": True,
                "notify_via_email": False,
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "subscription_id" in body
        assert body["subscription_id"].startswith("sub_")
        assert "successfully" in body["message"].lower()

    def test_subscribe_unauthorized(self, test_client, auth_headers, mock_db):
        """A patient cannot subscribe another patient (403)."""
        response = test_client.post(
            "/api/v1/notifications/subscribe",
            json={
                "patient_id": "other-patient-999",
                "conditions": ["diabetes"],
            },
            headers=auth_headers,
        )

        assert response.status_code == 403


class TestUnsubscribe:
    """DELETE /api/v1/notifications/unsubscribe/{subscription_id}"""

    def test_unsubscribe_success(self, test_client, auth_headers, mock_db):
        """Unsubscribing an active subscription returns success."""
        mock_db.fetch_one.return_value = {
            "subscription_id": "sub_abc123",
            "patient_id": "test-patient-001",
            "is_active": True,
        }

        response = test_client.delete(
            "/api/v1/notifications/unsubscribe/sub_abc123",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "successfully" in body["message"].lower()

    def test_unsubscribe_not_found(self, test_client, auth_headers, mock_db):
        """Unsubscribing a non-existent subscription returns 404."""
        mock_db.fetch_one.return_value = None

        response = test_client.delete(
            "/api/v1/notifications/unsubscribe/sub_nonexistent",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestMarkNotificationRead:
    """POST /api/v1/notifications/preferences"""

    def test_update_preferences(self, test_client, auth_headers, mock_db):
        """Updating notification preferences returns updated values."""
        response = test_client.post(
            "/api/v1/notifications/preferences",
            json={
                "patient_id": "test-patient-001",
                "notify_via_push": True,
                "notify_via_email": True,
                "quiet_hours_start": "22:00",
                "quiet_hours_end": "07:00",
                "frequency": "daily_digest",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["patient_id"] == "test-patient-001"
        assert body["notify_via_push"] is True
        assert body["notify_via_email"] is True
        assert body["frequency"] == "daily_digest"
        assert body["quiet_hours_start"] == "22:00"

    def test_invalid_quiet_hours_format(self, test_client, auth_headers):
        """Invalid quiet hours format returns 422."""
        response = test_client.post(
            "/api/v1/notifications/preferences",
            json={
                "patient_id": "test-patient-001",
                "quiet_hours_start": "25:99",  # invalid
            },
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestNotificationEngine:
    """Unit tests for notification engine helper functions."""

    def test_build_email_body_single_trial(self):
        """Email body for 1 trial uses singular 'trial'."""
        html, text = _build_email_body(count=1, patient_id="patient-001")

        assert "1" in html
        assert "trial" in html
        assert "trials" not in html.split("1")[1].split(".")[0]  # singular
        assert "Vaidyah" in html
        assert "Unsubscribe" in html

    def test_build_email_body_multiple_trials(self):
        """Email body for 3 trials uses plural 'trials'."""
        html, text = _build_email_body(count=3, patient_id="patient-001")

        assert "3" in html
        assert "trials" in html
        assert "View My Matches" in html

    def test_build_email_body_text_version(self):
        """Plain text email version contains essential content."""
        _, text = _build_email_body(count=2, patient_id="patient-001")

        assert "Vaidyah" in text
        assert "2" in text
        assert "Unsubscribe" in text

    @patch("app.services.notification_engine.datetime")
    def test_is_quiet_hours_during_quiet(self, mock_datetime):
        """During quiet hours (23:00 IST), _is_quiet_hours returns True."""
        from datetime import timezone, timedelta

        ist = timezone(timedelta(hours=5, minutes=30))
        mock_datetime.now.return_value = datetime(2025, 6, 1, 23, 0, 0, tzinfo=ist)

        assert _is_quiet_hours() is True

    @patch("app.services.notification_engine.datetime")
    def test_is_quiet_hours_outside_quiet(self, mock_datetime):
        """During working hours (14:00 IST), _is_quiet_hours returns False."""
        from datetime import timezone, timedelta

        ist = timezone(timedelta(hours=5, minutes=30))
        mock_datetime.now.return_value = datetime(2025, 6, 1, 14, 0, 0, tzinfo=ist)

        assert _is_quiet_hours() is False
