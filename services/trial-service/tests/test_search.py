"""Tests for the trial search router."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.models import TrialPhase, TrialSearchResponse, TrialStatus, TrialSummary
from tests.conftest import _make_search_response, _make_trial_summary


class TestSearchTrials:
    """GET /api/v1/search"""

    def test_search_trials_by_condition(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """Searching by condition returns matching trials."""
        diabetes_trial = _make_trial_summary(
            nct_id="NCT12345678",
            title="Metformin Efficacy Study",
            conditions=["Type 2 Diabetes Mellitus"],
        )
        mock_opensearch_client.search_trials.return_value = _make_search_response(
            trials=[diabetes_trial], total=1
        )

        response = test_client.get(
            "/api/v1/search",
            params={"conditions": ["diabetes"]},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["trials"][0]["nct_id"] == "NCT12345678"
        assert "Diabetes" in body["trials"][0]["conditions"][0]

    def test_search_trials_with_filters(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """Searching with age, gender, and location filters works correctly."""
        filtered_trial = _make_trial_summary(
            nct_id="NCT99999999",
            title="Cardiac Study for Adults",
            conditions=["heart disease"],
            phase=TrialPhase.PHASE_2,
        )
        mock_opensearch_client.search_trials.return_value = _make_search_response(
            trials=[filtered_trial], total=1
        )

        response = test_client.get(
            "/api/v1/search",
            params={
                "query": "heart disease",
                "min_age": 18,
                "max_age": 65,
                "gender": "All",
                "location_country": "India",
            },
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        # Verify the OpenSearch client was called with a request object
        mock_opensearch_client.search_trials.assert_called_once()
        call_request = mock_opensearch_client.search_trials.call_args[0][0]
        assert call_request.location_country == "India"
        assert call_request.demographics is not None
        assert call_request.demographics.min_age == 18

    def test_search_trials_empty_query(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """Searching with no query returns default results (match_all)."""
        default_trials = [
            _make_trial_summary(nct_id=f"NCT{i:08d}", title=f"Trial {i}")
            for i in range(5)
        ]
        mock_opensearch_client.search_trials.return_value = _make_search_response(
            trials=default_trials, total=5
        )

        response = test_client.get(
            "/api/v1/search",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 5
        assert len(body["trials"]) == 5

    def test_search_trials_pagination(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """Pagination parameters are passed through to OpenSearch."""
        mock_opensearch_client.search_trials.return_value = _make_search_response(
            trials=[], total=100
        )

        response = test_client.get(
            "/api/v1/search",
            params={"page": 3, "page_size": 10},
            headers=auth_headers,
        )

        assert response.status_code == 200
        call_request = mock_opensearch_client.search_trials.call_args[0][0]
        assert call_request.page == 3
        assert call_request.page_size == 10

    def test_search_trials_missing_auth(self, test_client):
        """Missing auth returns 401."""
        response = test_client.get("/api/v1/search")
        assert response.status_code == 401


class TestGetTrialDetail:
    """GET /api/v1/search/{trial_id}"""

    def test_get_trial_detail_success(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """Fetching a known trial ID returns the full trial document."""
        mock_opensearch_client.get_trial.return_value = {
            "nct_id": "NCT12345678",
            "title": "Metformin Study",
            "conditions": ["diabetes"],
            "phase": "Phase 3",
            "overall_status": "Recruiting",
            "eligibility": {"gender": "All"},
        }

        response = test_client.get(
            "/api/v1/search/NCT12345678",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["nct_id"] == "NCT12345678"
        assert body["title"] == "Metformin Study"

    def test_get_trial_detail_not_found(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """Fetching a non-existent trial ID returns 404."""
        mock_opensearch_client.get_trial.return_value = None

        response = test_client.get(
            "/api/v1/search/NCT_NONEXISTENT",
            headers=auth_headers,
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestListConditions:
    """GET /api/v1/search/conditions"""

    def test_list_conditions(
        self, test_client, auth_headers, mock_opensearch_client
    ):
        """List conditions returns distinct condition values."""
        response = test_client.get(
            "/api/v1/search/conditions",
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert isinstance(body, list)
        assert "diabetes" in body
