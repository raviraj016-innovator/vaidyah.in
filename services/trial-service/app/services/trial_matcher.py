"""Trial matching algorithm: find the best clinical trials for a patient."""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

import structlog

from app.config import get_settings
from app.models import (
    ClinicalTrial,
    Gender,
    MatchStatus,
    PatientProfile,
    TrialMatchResponse,
    TrialMatchScore,
    TrialPhase,
    TrialSearchRequest,
    TrialStatus,
)
from app.services.opensearch_client import get_opensearch_client
from app.utils.geo import closest_location_distance

logger = structlog.get_logger(__name__)

# Phase desirability weights (higher is better for patients seeking treatment)
_PHASE_WEIGHTS: dict[str, float] = {
    TrialPhase.PHASE_3.value: 1.0,
    TrialPhase.PHASE_2_3.value: 0.9,
    TrialPhase.PHASE_2.value: 0.75,
    TrialPhase.PHASE_4.value: 0.7,
    TrialPhase.PHASE_1_2.value: 0.6,
    TrialPhase.PHASE_1.value: 0.4,
    TrialPhase.EARLY_PHASE_1.value: 0.3,
    TrialPhase.NOT_APPLICABLE.value: 0.5,
}

# Composite score weights
_W_ELIGIBILITY = 0.30
_W_CONDITION = 0.35
_W_LOCATION = 0.20
_W_PHASE = 0.15


def _parse_age_string(age_str: Optional[str]) -> Optional[float]:
    """Parse ClinicalTrials.gov age strings like '18 Years' to integer."""
    if not age_str:
        return None
    match = re.search(r"(\d+)", age_str)
    if not match:
        return None
    value = int(match.group(1))
    lower = age_str.lower()
    if "month" in lower:
        return max(value / 12.0, 0)
    if "week" in lower:
        return max(value / 52.0, 0)
    if "day" in lower:
        return max(value / 365.25, 0)
    return value


# --------------------------------------------------------------------------- #
#  Step 1 - Eligibility check (hard filter)
# --------------------------------------------------------------------------- #

def check_basic_eligibility(
    profile: PatientProfile,
    trial: dict[str, Any],
) -> tuple[bool, float, list[str]]:
    """Return (eligible, score, reasons) based on age & gender."""
    elig = trial.get("eligibility", {})
    reasons: list[str] = []
    score = 1.0

    # -- Gender --
    trial_gender = elig.get("gender", "All")
    if trial_gender != "All" and profile.gender:
        if profile.gender.value != trial_gender:
            return False, 0.0, [f"Gender mismatch: trial requires {trial_gender}"]

    # -- Age range --
    min_age = elig.get("minimum_age_years") if elig.get("minimum_age_years") is not None else _parse_age_string(elig.get("minimum_age"))
    max_age = elig.get("maximum_age_years") if elig.get("maximum_age_years") is not None else _parse_age_string(elig.get("maximum_age"))

    if profile.age is not None:
        if min_age is not None and profile.age < min_age:
            return False, 0.0, [f"Patient age {profile.age} below minimum {min_age}"]
        if max_age is not None and profile.age > max_age:
            return False, 0.0, [f"Patient age {profile.age} above maximum {max_age}"]
        # Slight bonus for being in the middle of the age range
        if min_age and max_age and max_age > min_age:
            mid = (min_age + max_age) / 2.0
            deviation = abs(profile.age - mid) / ((max_age - min_age) / 2.0)
            score = max(1.0 - 0.1 * deviation, 0.8)
        reasons.append("Age eligible")
    else:
        score = 0.9  # Unknown age -> slight penalty
        reasons.append("Age not provided (assumed eligible)")

    if profile.gender:
        reasons.append("Gender eligible")

    return True, round(score, 3), reasons


# --------------------------------------------------------------------------- #
#  Step 2 - Condition matching
# --------------------------------------------------------------------------- #

def compute_condition_score(
    patient_conditions: list[str],
    trial_conditions: list[str],
    trial_mesh_terms: list[str] | None = None,
) -> tuple[float, list[str]]:
    """Score how well patient conditions overlap with trial conditions.

    Uses normalised string matching.  A production system would replace this
    with semantic embeddings from SageMaker / Bedrock.
    """
    if not patient_conditions or not trial_conditions:
        return 0.0, ["No condition data available"]

    patient_norm = {c.strip().lower() for c in patient_conditions}
    trial_norm = {c.strip().lower() for c in trial_conditions}
    mesh_norm = {m.strip().lower() for m in (trial_mesh_terms or [])}
    combined_trial = trial_norm | mesh_norm

    # Exact matches
    exact = patient_norm & combined_trial
    if exact:
        score = min(len(exact) / len(patient_norm), 1.0)
        return round(score, 3), [f"Exact condition match: {', '.join(sorted(exact))}"]

    # Token-level partial matching
    best_partial = 0.0
    matched_pairs: list[str] = []
    for pc in patient_norm:
        pc_tokens = set(pc.split())
        for tc in combined_trial:
            tc_tokens = set(tc.split())
            if pc_tokens & tc_tokens:
                overlap = len(pc_tokens & tc_tokens) / max(len(pc_tokens | tc_tokens), 1)
                if overlap > best_partial:
                    best_partial = overlap
                    matched_pairs = [f"'{pc}' ~ '{tc}'"]

    if best_partial > 0.3:
        return round(best_partial * 0.8, 3), [f"Partial condition match: {', '.join(matched_pairs)}"]

    return 0.0, ["No matching conditions found"]


# --------------------------------------------------------------------------- #
#  Step 3 - Location proximity
# --------------------------------------------------------------------------- #

def compute_location_score(
    profile: PatientProfile,
    trial: dict[str, Any],
) -> tuple[float, Optional[float], list[str]]:
    """Return (score, distance_km, reasons).

    Score decays with distance using a sigmoid-like curve centred at the
    patient's preferred radius.
    """
    if profile.latitude is None or profile.longitude is None:
        return 0.5, None, ["Patient location not provided"]

    locations = trial.get("locations", [])
    if not locations:
        return 0.3, None, ["Trial has no location data"]

    dist = closest_location_distance(profile.latitude, profile.longitude, locations)
    if dist is None:
        return 0.3, None, ["Trial locations lack coordinates"]

    radius = max(profile.preferred_radius_km or 100.0, 0.1)  # Ensure non-zero radius

    if dist <= radius * 0.5:
        score = 1.0
    elif dist <= radius:
        score = 1.0 - 0.3 * ((dist - radius * 0.5) / (radius * 0.5))
    elif dist <= radius * 2:
        score = 0.7 - 0.4 * ((dist - radius) / radius)
    else:
        score = max(0.1, 0.3 - 0.002 * (dist - radius * 2))

    reasons = [f"Nearest site ~{dist:.0f} km away"]
    return round(max(score, 0.0), 3), round(dist, 1), reasons


# --------------------------------------------------------------------------- #
#  Step 4 - Phase preference
# --------------------------------------------------------------------------- #

def compute_phase_score(
    trial_phase: Optional[str],
    preferred_phases: list[TrialPhase] | None = None,
) -> tuple[float, list[str]]:
    """Score trial phase from the patient's perspective."""
    if not trial_phase:
        return 0.5, ["Phase not specified"]

    # If patient has explicit preferences, match against those
    if preferred_phases:
        pref_values = {p.value for p in preferred_phases}
        if trial_phase in pref_values:
            return 1.0, [f"Preferred phase: {trial_phase}"]
        else:
            return 0.3, [f"Phase {trial_phase} not in patient preferences"]

    # Default phase desirability
    weight = _PHASE_WEIGHTS.get(trial_phase, 0.5)
    return weight, [f"Phase {trial_phase} (desirability {weight:.1f})"]


# --------------------------------------------------------------------------- #
#  Step 5 - Composite score
# --------------------------------------------------------------------------- #

def compute_composite_score(
    eligibility_score: float,
    condition_score: float,
    location_score: float,
    phase_score: float,
    ml_score: Optional[float] = None,
) -> float:
    """Weighted combination of all sub-scores.

    If an ML score is available, it is blended in at 20% weight (others are
    scaled down proportionally).
    """
    if ml_score is not None:
        ml_score = min(max(ml_score, 0.0), 1.0)
        ml_weight = 0.20
        scale = 1.0 - ml_weight
        composite = (
            _W_ELIGIBILITY * scale * eligibility_score
            + _W_CONDITION * scale * condition_score
            + _W_LOCATION * scale * location_score
            + _W_PHASE * scale * phase_score
            + ml_weight * ml_score
        )
    else:
        composite = (
            _W_ELIGIBILITY * eligibility_score
            + _W_CONDITION * condition_score
            + _W_LOCATION * location_score
            + _W_PHASE * phase_score
        )

    return round(min(max(composite, 0.0), 1.0), 4)


# --------------------------------------------------------------------------- #
#  SageMaker ML matching (optional)
# --------------------------------------------------------------------------- #

async def _invoke_sagemaker_matching(
    profile: PatientProfile,
    trial_doc: dict[str, Any],
) -> Optional[float]:
    """Call SageMaker endpoint for ML-based match score.

    Returns None if the endpoint is not configured or the call fails.
    """
    settings = get_settings()
    if not settings.sagemaker_matching_endpoint:
        return None

    try:
        import boto3

        runtime = boto3.client(
            "sagemaker-runtime",
            region_name=settings.sagemaker_region,
        )
        payload = {
            "patient": {
                "age": profile.age,
                "gender": profile.gender.value if profile.gender else None,
                "conditions": profile.conditions,
                "medications": profile.medications,
            },
            "trial": {
                "nct_id": trial_doc.get("nct_id"),
                "conditions": trial_doc.get("conditions", []),
                "eligibility": trial_doc.get("eligibility", {}),
                "phase": trial_doc.get("phase"),
            },
        }
        response = await asyncio.to_thread(
            runtime.invoke_endpoint,
            EndpointName=settings.sagemaker_matching_endpoint,
            ContentType="application/json",
            Body=json.dumps(payload),
        )
        result = json.loads(response["Body"].read().decode())
        return float(result.get("score", 0.0))
    except Exception:
        logger.warning("sagemaker_invoke_failed", exc_info=True)
        return None


# --------------------------------------------------------------------------- #
#  Public entry point
# --------------------------------------------------------------------------- #

async def match_trials_for_patient(
    profile: PatientProfile,
    max_results: int = 20,
) -> TrialMatchResponse:
    """Run the full matching pipeline and return ranked results.

    1. Retrieve candidate trials from OpenSearch (filtered by patient conditions).
    2. Apply eligibility, condition, location, phase scoring.
    3. Optionally invoke SageMaker for ML scoring.
    4. Combine into composite score, rank, and return top-N.
    """
    os_client = get_opensearch_client()

    # Guard: empty patient profile cannot produce meaningful matches
    if not profile.conditions:
        return TrialMatchResponse(
            patient_id=profile.patient_id,
            matched_at=datetime.now(timezone.utc),
            total_evaluated=0,
            total_matched=0,
            matches=[],
        )

    # Fetch a broad set of candidates using the patient's conditions
    search_req = TrialSearchRequest(
        conditions=profile.conditions,
        statuses=[TrialStatus.RECRUITING, TrialStatus.ENROLLING_BY_INVITATION],
        page_size=100,
    )
    search_resp = os_client.search_trials(search_req)

    candidate_nct_ids = [t.nct_id for t in search_resp.trials]
    scored_matches: list[TrialMatchScore] = []

    for nct_id in candidate_nct_ids:
        trial_doc = os_client.get_trial(nct_id)
        if trial_doc is None:
            continue

        # Step 1 - eligibility
        eligible, elig_score, elig_reasons = check_basic_eligibility(profile, trial_doc)
        if not eligible:
            continue

        # Step 2 - condition
        cond_score, cond_reasons = compute_condition_score(
            profile.conditions,
            trial_doc.get("conditions", []),
            trial_doc.get("mesh_terms"),
        )

        # Step 3 - location
        loc_score, dist_km, loc_reasons = compute_location_score(profile, trial_doc)

        # Step 4 - phase
        phase_score, phase_reasons = compute_phase_score(
            trial_doc.get("phase"),
            profile.preferred_phases or None,
        )

        # Step 5 (optional) - ML score
        ml_score = await _invoke_sagemaker_matching(profile, trial_doc)

        # Composite
        composite = compute_composite_score(
            elig_score, cond_score, loc_score, phase_score, ml_score,
        )

        all_reasons = elig_reasons + cond_reasons + loc_reasons + phase_reasons

        scored_matches.append(TrialMatchScore(
            nct_id=nct_id,
            title=trial_doc.get("title", ""),
            brief_title=trial_doc.get("brief_title"),
            overall_status=trial_doc.get("overall_status"),
            phase=trial_doc.get("phase"),
            conditions=trial_doc.get("conditions", []),
            composite_score=composite,
            eligibility_score=elig_score,
            condition_score=cond_score,
            location_score=loc_score,
            phase_score=phase_score,
            ml_score=ml_score,
            distance_km=dist_km,
            match_reasons=all_reasons,
            match_status=MatchStatus.PENDING,
        ))

    # Rank by composite score descending
    scored_matches.sort(key=lambda m: m.composite_score, reverse=True)
    top_matches = scored_matches[:max_results]

    return TrialMatchResponse(
        patient_id=profile.patient_id,
        matched_at=datetime.now(timezone.utc),
        total_evaluated=len(candidate_nct_ids),
        total_matched=len(scored_matches),
        matches=top_matches,
    )
