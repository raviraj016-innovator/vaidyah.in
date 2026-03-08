"""Shared fixtures for the trial-service test suite."""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import jwt as pyjwt
from fastapi.testclient import TestClient

from app.config import Settings
from app.models import (
    FacetBucket,
    SearchFacets,
    TrialPhase,
    TrialSearchResponse,
    TrialStatus,
    TrialSummary,
)


@pytest.fixture()
def mock_settings() -> Settings:
    """Return a Settings instance with safe test defaults."""
    return Settings(
        environment="development",
        debug=True,
        opensearch_endpoint="https://localhost:9200",
        opensearch_username="admin",
        opensearch_password="admin",
        opensearch_index="test_clinical_trials",
        opensearch_verify_certs=False,
        database_url="postgresql+asyncpg://localhost:5432/vaidyah_test",
        jwt_secret="test-jwt-secret",
        jwt_algorithm="HS256",
        jwt_issuer="vaidyah-auth",
        jwt_audience="vaidyah",
        sagemaker_matching_endpoint=None,
        sns_topic_arn=None,
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
    return pyjwt.encode(payload, mock_settings.jwt_secret, algorithm=mock_settings.jwt_algorithm)


@pytest.fixture()
def admin_token(mock_settings: Settings) -> str:
    """Generate a valid JWT token with admin role."""
    now = int(time.time())
    payload = {
        "sub": "admin-user-001",
        "roles": ["admin"],
        "iss": mock_settings.jwt_issuer,
        "aud": mock_settings.jwt_audience,
        "iat": now,
        "exp": now + 3600,
    }
    return pyjwt.encode(payload, mock_settings.jwt_secret, algorithm=mock_settings.jwt_algorithm)


@pytest.fixture()
def auth_headers(auth_token: str) -> dict[str, str]:
    """Return Authorization headers with a valid Bearer token."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture()
def admin_headers(admin_token: str) -> dict[str, str]:
    """Return Authorization headers with admin privileges."""
    return {"Authorization": f"Bearer {admin_token}"}


def _make_trial_summary(
    nct_id: str = "NCT00000001",
    title: str = "Test Trial",
    conditions: list[str] | None = None,
    phase: TrialPhase | None = TrialPhase.PHASE_3,
    status: TrialStatus = TrialStatus.RECRUITING,
) -> TrialSummary:
    """Factory to create a TrialSummary for testing."""
    return TrialSummary(
        nct_id=nct_id,
        title=title,
        brief_title=title,
        overall_status=status,
        phase=phase,
        conditions=conditions or ["diabetes"],
        sponsor="Test Sponsor",
        enrollment_count=100,
        locations_count=3,
        score=0.85,
    )


def _make_search_response(
    trials: list[TrialSummary] | None = None,
    total: int | None = None,
) -> TrialSearchResponse:
    """Factory to create a TrialSearchResponse for testing."""
    if trials is None:
        trials = [_make_trial_summary()]
    return TrialSearchResponse(
        total=total if total is not None else len(trials),
        page=1,
        page_size=20,
        trials=trials,
        facets=SearchFacets(),
        query_time_ms=15.0,
    )


@pytest.fixture()
def mock_opensearch_client() -> MagicMock:
    """Return a mocked TrialOpenSearchClient."""
    client = MagicMock()
    client.search_trials.return_value = _make_search_response()
    client.get_trial.return_value = {
        "nct_id": "NCT00000001",
        "title": "Test Diabetes Trial",
        "conditions": ["diabetes"],
        "phase": TrialPhase.PHASE_3.value,
        "overall_status": TrialStatus.RECRUITING.value,
        "eligibility": {
            "gender": "All",
            "minimum_age_years": 18,
            "maximum_age_years": 65,
        },
        "locations": [],
        "mesh_terms": ["diabetes mellitus"],
    }
    client.get_distinct_conditions.return_value = ["diabetes", "hypertension", "asthma"]
    client.ensure_index.return_value = None
    client.count.return_value = 100
    return client


@pytest.fixture()
def mock_db() -> MagicMock:
    """Return mock database functions."""
    db = MagicMock()
    db.fetch_all = AsyncMock(return_value=[])
    db.fetch_one = AsyncMock(return_value=None)
    db.execute = AsyncMock(return_value="INSERT 0 1")
    db.execute_many = AsyncMock(return_value=None)
    return db


@pytest.fixture()
def test_client(
    mock_settings: Settings,
    mock_opensearch_client: MagicMock,
    mock_db: MagicMock,
) -> TestClient:
    """Build a TestClient with mocked dependencies."""
    with (
        patch("app.config.get_settings", return_value=mock_settings),
        patch("app.services.opensearch_client.get_opensearch_client", return_value=mock_opensearch_client),
        patch("app.services.db.get_pool", return_value=MagicMock()),
        patch("app.services.db.init_db_pool", new_callable=AsyncMock),
        patch("app.services.db.ensure_schema", new_callable=AsyncMock),
        patch("app.services.db.close_db_pool", new_callable=AsyncMock),
        patch("app.services.db.fetch_all", mock_db.fetch_all),
        patch("app.services.db.fetch_one", mock_db.fetch_one),
        patch("app.services.db.execute", mock_db.execute),
        patch("app.services.db.execute_many", mock_db.execute_many),
        patch("app.services.notification_engine.start_scheduler"),
        patch("app.main._auto_seed_csv", new_callable=AsyncMock),
    ):
        from app.main import app

        return TestClient(app, raise_server_exceptions=False)
