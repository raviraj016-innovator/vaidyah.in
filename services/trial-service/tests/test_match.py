"""Tests for the trial matching algorithm and router."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Gender, PatientProfile, TrialPhase, TrialStatus
from app.services.trial_matcher import (
    check_basic_eligibility,
    compute_composite_score,
    compute_condition_score,
    compute_location_score,
    compute_phase_score,
)


# ---------------------------------------------------------------------------
# Unit tests for scoring functions
# ---------------------------------------------------------------------------


class TestCheckBasicEligibility:
    """Tests for the eligibility hard-filter."""

    def test_eligible_patient(self):
        """A patient within age and gender criteria is eligible."""
        profile = PatientProfile(
            patient_id="p1", age=35, gender=Gender.MALE, conditions=["diabetes"]
        )
        trial = {
            "eligibility": {
                "gender": "All",
                "minimum_age_years": 18,
                "maximum_age_years": 65,
            }
        }

        eligible, score, reasons = check_basic_eligibility(profile, trial)

        assert eligible is True
        assert score > 0.8
        assert "Age eligible" in reasons

    def test_ineligible_gender(self):
        """A male patient is ineligible for a female-only trial."""
        profile = PatientProfile(
            patient_id="p2", age=40, gender=Gender.MALE, conditions=["breast cancer"]
        )
        trial = {
            "eligibility": {
                "gender": "Female",
                "minimum_age_years": 18,
                "maximum_age_years": 75,
            }
        }

        eligible, score, reasons = check_basic_eligibility(profile, trial)

        assert eligible is False
        assert score == 0.0
        assert any("gender" in r.lower() for r in reasons)

    def test_ineligible_too_young(self):
        """A patient below minimum age is excluded."""
        profile = PatientProfile(
            patient_id="p3", age=15, gender=Gender.MALE, conditions=["asthma"]
        )
        trial = {
            "eligibility": {
                "gender": "All",
                "minimum_age_years": 18,
                "maximum_age_years": 65,
            }
        }

        eligible, score, reasons = check_basic_eligibility(profile, trial)

        assert eligible is False
        assert "below minimum" in reasons[0].lower()

    def test_ineligible_too_old(self):
        """A patient above maximum age is excluded."""
        profile = PatientProfile(
            patient_id="p4", age=70, gender=Gender.FEMALE, conditions=["hypertension"]
        )
        trial = {
            "eligibility": {
                "gender": "All",
                "minimum_age_years": 18,
                "maximum_age_years": 65,
            }
        }

        eligible, score, reasons = check_basic_eligibility(profile, trial)

        assert eligible is False
        assert "above maximum" in reasons[0].lower()

    def test_no_age_provided(self):
        """When no age is provided, patient is assumed eligible with a slight penalty."""
        profile = PatientProfile(
            patient_id="p5", age=None, gender=None, conditions=["diabetes"]
        )
        trial = {
            "eligibility": {
                "gender": "All",
                "minimum_age_years": 18,
                "maximum_age_years": 65,
            }
        }

        eligible, score, reasons = check_basic_eligibility(profile, trial)

        assert eligible is True
        assert score == 0.9  # slight penalty for unknown age


class TestComputeConditionScore:
    """Tests for condition matching scoring."""

    def test_exact_match(self):
        """Exact condition match yields a high score."""
        score, reasons = compute_condition_score(
            patient_conditions=["diabetes"],
            trial_conditions=["diabetes", "hypertension"],
        )

        assert score >= 0.8
        assert any("exact" in r.lower() for r in reasons)

    def test_partial_match(self):
        """Token-level partial matching yields a moderate score."""
        score, reasons = compute_condition_score(
            patient_conditions=["type 2 diabetes"],
            trial_conditions=["diabetes mellitus type 2"],
        )

        assert score > 0.0
        # At minimum, tokens "diabetes" and "type" overlap

    def test_no_match(self):
        """Completely unrelated conditions yield zero score."""
        score, reasons = compute_condition_score(
            patient_conditions=["asthma"],
            trial_conditions=["breast cancer"],
        )

        assert score == 0.0
        assert any("no matching" in r.lower() for r in reasons)

    def test_empty_conditions(self):
        """Empty patient or trial conditions return zero."""
        score, reasons = compute_condition_score(
            patient_conditions=[],
            trial_conditions=["diabetes"],
        )

        assert score == 0.0


class TestComputeLocationScore:
    """Tests for location proximity scoring."""

    def test_no_patient_location(self):
        """Without patient coordinates, a neutral 0.5 score is returned."""
        profile = PatientProfile(
            patient_id="p1",
            conditions=["diabetes"],
            latitude=None,
            longitude=None,
        )
        trial = {"locations": []}

        score, dist, reasons = compute_location_score(profile, trial)

        assert score == 0.5
        assert dist is None

    def test_no_trial_locations(self):
        """A trial with no location data gets a low score."""
        profile = PatientProfile(
            patient_id="p1",
            conditions=["diabetes"],
            latitude=19.076,
            longitude=72.8777,
        )
        trial = {"locations": []}

        score, dist, reasons = compute_location_score(profile, trial)

        assert score == 0.3


class TestComputePhaseScore:
    """Tests for trial phase scoring."""

    def test_preferred_phase(self):
        """A trial in the patient's preferred phase scores 1.0."""
        score, reasons = compute_phase_score(
            trial_phase=TrialPhase.PHASE_3.value,
            preferred_phases=[TrialPhase.PHASE_3],
        )

        assert score == 1.0
        assert any("preferred" in r.lower() for r in reasons)

    def test_non_preferred_phase(self):
        """A trial not in preferred phases scores 0.3."""
        score, reasons = compute_phase_score(
            trial_phase=TrialPhase.PHASE_1.value,
            preferred_phases=[TrialPhase.PHASE_3],
        )

        assert score == 0.3

    def test_no_phase_specified(self):
        """A trial with no phase gets a neutral 0.5."""
        score, reasons = compute_phase_score(trial_phase=None)

        assert score == 0.5

    def test_default_desirability_phase_3(self):
        """Phase 3 has the highest default desirability (1.0)."""
        score, _ = compute_phase_score(trial_phase=TrialPhase.PHASE_3.value)

        assert score == 1.0


class TestComputeCompositeScore:
    """Tests for the weighted composite scoring."""

    def test_perfect_scores(self):
        """All perfect sub-scores yield a composite of 1.0."""
        composite = compute_composite_score(
            eligibility_score=1.0,
            condition_score=1.0,
            location_score=1.0,
            phase_score=1.0,
        )

        assert composite == 1.0

    def test_zero_scores(self):
        """All zero sub-scores yield a composite of 0.0."""
        composite = compute_composite_score(
            eligibility_score=0.0,
            condition_score=0.0,
            location_score=0.0,
            phase_score=0.0,
        )

        assert composite == 0.0

    def test_with_ml_score(self):
        """ML score blends into the composite at 20% weight."""
        without_ml = compute_composite_score(1.0, 1.0, 1.0, 1.0, ml_score=None)
        with_ml = compute_composite_score(1.0, 1.0, 1.0, 1.0, ml_score=1.0)

        assert without_ml == with_ml == 1.0

        # ML score of 0 should drag down the composite
        with_zero_ml = compute_composite_score(1.0, 1.0, 1.0, 1.0, ml_score=0.0)
        assert with_zero_ml < 1.0
        assert with_zero_ml == pytest.approx(0.8, abs=0.01)

    def test_composite_clamped_to_unit_range(self):
        """Composite score is always in [0.0, 1.0]."""
        composite = compute_composite_score(1.0, 1.0, 1.0, 1.0, ml_score=1.0)
        assert 0.0 <= composite <= 1.0

        composite = compute_composite_score(0.0, 0.0, 0.0, 0.0, ml_score=0.0)
        assert 0.0 <= composite <= 1.0


class TestMatchWithDemographicFilters:
    """Integration-level tests for the match endpoint with demographic filtering."""

    def test_match_patient_to_trials(
        self, test_client, admin_headers, mock_opensearch_client, mock_db
    ):
        """POST /api/v1/match returns scored matches for a patient profile."""
        mock_opensearch_client.search_trials.return_value = _make_search_response_with_diabetes()

        response = test_client.post(
            "/api/v1/match",
            json={
                "profile": {
                    "patient_id": "admin-user-001",
                    "age": 45,
                    "gender": "Male",
                    "conditions": ["diabetes"],
                    "medications": ["metformin"],
                    "latitude": 19.076,
                    "longitude": 72.8777,
                },
                "max_results": 5,
            },
            headers=admin_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["patient_id"] == "admin-user-001"
        assert "matches" in body

    def test_match_ineligible_patient(
        self, test_client, admin_headers, mock_opensearch_client, mock_db
    ):
        """A patient with no conditions returns zero matches."""
        from app.models import TrialSearchResponse, SearchFacets

        mock_opensearch_client.search_trials.return_value = TrialSearchResponse(
            total=0, page=1, page_size=20, trials=[], facets=SearchFacets()
        )

        response = test_client.post(
            "/api/v1/match",
            json={
                "profile": {
                    "patient_id": "admin-user-001",
                    "age": 45,
                    "gender": "Male",
                    "conditions": [],
                },
                "max_results": 5,
            },
            headers=admin_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["total_matched"] == 0
        assert body["matches"] == []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_search_response_with_diabetes():
    """Create a search response with a diabetes trial."""
    from tests.conftest import _make_search_response, _make_trial_summary

    trial = _make_trial_summary(
        nct_id="NCT11111111",
        title="Metformin Extended Release Study",
        conditions=["diabetes"],
        phase=TrialPhase.PHASE_3,
        status=TrialStatus.RECRUITING,
    )
    return _make_search_response(trials=[trial], total=1)
