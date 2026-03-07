"""Match router -- patient-to-trial matching endpoints."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from app.middleware.auth import AuthenticatedUser, get_current_user
from app.models import (
    MatchStatus,
    PatientProfile,
    TrialMatchRequest,
    TrialMatchResponse,
    TrialMatchScore,
)
from app.services.db import execute, execute_many, fetch_all, fetch_one
from app.services.trial_matcher import match_trials_for_patient

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/match")


# --------------------------------------------------------------------------- #
#  POST /match  -- match a patient profile to clinical trials
# --------------------------------------------------------------------------- #


@router.post(
    "",
    response_model=TrialMatchResponse,
    summary="Match patient to clinical trials",
    description=(
        "Submit a patient profile (demographics, conditions, medications, "
        "location) and receive a ranked list of matching clinical trials "
        "with multi-factor scoring breakdown."
    ),
)
async def match_patient_to_trials(body: TrialMatchRequest, _user: AuthenticatedUser = Depends(get_current_user)) -> TrialMatchResponse:
    profile = body.profile

    # Ownership check: patients can only match themselves
    if _user.sub != profile.patient_id and not (_user.has_role("admin") or _user.has_role("doctor")):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to submit matches for this patient.",
        )

    logger.info(
        "match_request",
        patient_id=profile.patient_id,
        conditions=profile.conditions,
        max_results=body.max_results,
    )

    # Run the matching pipeline
    match_response = await match_trials_for_patient(
        profile=profile,
        max_results=body.max_results,
    )

    # Persist matches to the database for later retrieval
    if match_response.matches:
        rows: list[tuple] = []
        for m in match_response.matches:
            match_id = f"match_{uuid.uuid4().hex[:16]}"
            scores_json = json.dumps({
                "title": m.title,
                "composite": m.composite_score,
                "eligibility": m.eligibility_score,
                "condition": m.condition_score,
                "location": m.location_score,
                "phase": m.phase_score,
                "ml": m.ml_score,
                "distance_km": m.distance_km,
                "reasons": m.match_reasons,
            })
            rows.append((
                match_id,
                profile.patient_id,
                m.nct_id,
                m.composite_score,
                scores_json,
                MatchStatus.PENDING.value,
            ))

        try:
            await execute_many(
                """
                INSERT INTO trial_matches
                    (match_id, patient_id, nct_id, composite_score, scores, status, created_at)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
                ON CONFLICT (patient_id, nct_id) DO UPDATE
                    SET composite_score = EXCLUDED.composite_score,
                        scores = EXCLUDED.scores,
                        status = EXCLUDED.status,
                        updated_at = NOW()
                """,
                rows,
            )
            logger.info(
                "matches_persisted",
                patient_id=profile.patient_id,
                count=len(rows),
            )
        except Exception:
            # Non-fatal: log and continue -- the response is still valid
            logger.exception("match_persist_failed", patient_id=profile.patient_id)

    return match_response


# --------------------------------------------------------------------------- #
#  GET /match/{patient_id}  -- retrieve previous matches
# --------------------------------------------------------------------------- #


@router.get(
    "/{patient_id}",
    response_model=list[TrialMatchScore],
    summary="Get previous matches for a patient",
    description=(
        "Retrieve the most recent set of trial matches that were computed "
        "for the given patient, including all scoring details."
    ),
)
async def get_patient_matches(
    patient_id: str,
    status: Optional[MatchStatus] = Query(None, description="Filter by match status"),
    min_score: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum composite score"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    offset: int = Query(0, ge=0, le=10000, description="Pagination offset"),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> list[TrialMatchScore]:
    # Ownership check: patients can only access their own matches
    if _user.sub != patient_id and not (_user.has_role("admin") or _user.has_role("doctor")):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access matches for this patient.",
        )

    logger.info("get_patient_matches", patient_id=patient_id, status=status)

    # Build query dynamically
    conditions: list[str] = ["patient_id = $1"]
    params: list = [patient_id]
    idx = 2

    if status is not None:
        conditions.append(f"status = ${idx}")
        params.append(status.value)
        idx += 1

    if min_score is not None:
        conditions.append(f"composite_score >= ${idx}")
        params.append(min_score)
        idx += 1

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT match_id, patient_id, nct_id, composite_score, scores, status,
               created_at, updated_at
        FROM trial_matches
        WHERE {where_clause}
        ORDER BY composite_score DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([limit, offset])

    rows = await fetch_all(query, *params)

    if not rows:
        logger.info("no_matches_found", patient_id=patient_id)
        return []

    results: list[TrialMatchScore] = []
    for row in rows:
        try:
            scores = row["scores"] if isinstance(row["scores"], dict) else json.loads(row["scores"] or "{}")
        except (json.JSONDecodeError, TypeError):
            logger.warning("invalid_scores_json", match_id=row.get("match_id"))
            scores = {}
        results.append(TrialMatchScore(
            nct_id=row["nct_id"],
            title=scores.get("title", ""),
            composite_score=row["composite_score"],
            eligibility_score=scores.get("eligibility", 0.0),
            condition_score=scores.get("condition", 0.0),
            location_score=scores.get("location", 0.0),
            phase_score=scores.get("phase", 0.0),
            ml_score=scores.get("ml"),
            distance_km=scores.get("distance_km"),
            match_reasons=scores.get("reasons", []),
            match_status=MatchStatus(row["status"]),
        ))

    return results
