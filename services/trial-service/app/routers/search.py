"""Search router -- clinical trial discovery and lookup endpoints."""

from __future__ import annotations

from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from app.middleware.auth import AuthenticatedUser, get_current_user

from app.models import (
    ClinicalTrial,
    DemographicFilter,
    Gender,
    TrialPhase,
    TrialSearchRequest,
    TrialSearchResponse,
    TrialStatus,
)
from app.services.opensearch_client import get_opensearch_client

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/search")


# --------------------------------------------------------------------------- #
#  GET /search  -- full-text trial search with filters
# --------------------------------------------------------------------------- #


@router.get(
    "",
    response_model=TrialSearchResponse,
    summary="Search clinical trials",
    description=(
        "Full-text search over indexed clinical trials with support for "
        "condition, phase, status, location, demographic, and sponsor filters. "
        "Results are paginated and include faceted counts."
    ),
)
async def search_trials(
    _user: AuthenticatedUser = Depends(get_current_user),
    query: Optional[str] = Query(None, description="Free-text search query"),
    conditions: Optional[list[str]] = Query(None, description="Filter by condition(s)"),
    phases: Optional[list[TrialPhase]] = Query(None, description="Filter by trial phase(s)"),
    statuses: Optional[list[TrialStatus]] = Query(None, description="Filter by recruitment status(es)"),
    location_country: Optional[str] = Query(None, description="Filter by country"),
    location_state: Optional[str] = Query(None, description="Filter by state/province"),
    location_city: Optional[str] = Query(None, description="Filter by city"),
    latitude: Optional[float] = Query(None, ge=-90, le=90, description="Latitude for geo-distance filter"),
    longitude: Optional[float] = Query(None, ge=-180, le=180, description="Longitude for geo-distance filter"),
    radius_km: Optional[float] = Query(None, gt=0, le=500, description="Search radius in kilometres"),
    sponsor: Optional[str] = Query(None, description="Filter by sponsor name"),
    intervention_type: Optional[str] = Query(None, description="Filter by intervention type"),
    healthy_volunteers: Optional[bool] = Query(None, description="Accepts healthy volunteers"),
    min_age: Optional[int] = Query(None, ge=0, le=120, description="Minimum participant age"),
    max_age: Optional[int] = Query(None, ge=0, le=120, description="Maximum participant age"),
    gender: Optional[Gender] = Query(None, description="Participant gender filter"),
    sort_by: str = Query("relevance", description="Sort: relevance | date | enrollment"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
) -> TrialSearchResponse:
    demographics: Optional[DemographicFilter] = None
    if min_age is not None or max_age is not None or gender is not None:
        demographics = DemographicFilter(
            min_age=min_age,
            max_age=max_age,
            gender=gender,
        )

    request = TrialSearchRequest(
        query=query,
        conditions=conditions or [],
        phases=phases or [],
        statuses=statuses or [],
        location_country=location_country,
        location_state=location_state,
        location_city=location_city,
        latitude=latitude,
        longitude=longitude,
        radius_km=radius_km,
        demographics=demographics,
        sponsor=sponsor,
        intervention_type=intervention_type,
        healthy_volunteers=healthy_volunteers,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )

    os_client = get_opensearch_client()

    logger.info(
        "search_trials",
        query=query,
        conditions=conditions,
        phases=phases,
        page=page,
        page_size=page_size,
    )

    response = os_client.search_trials(request)
    return response


# --------------------------------------------------------------------------- #
#  GET /search/conditions  -- distinct conditions for autocomplete
# --------------------------------------------------------------------------- #


@router.get(
    "/conditions",
    response_model=list[str],
    summary="List available conditions",
    description=(
        "Return distinct condition values from the trial index. "
        "Useful for autocomplete and filter UIs. Optionally filter by prefix."
    ),
)
async def list_conditions(
    prefix: Optional[str] = Query(None, description="Prefix filter for condition names"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of conditions to return"),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> list[str]:
    os_client = get_opensearch_client()
    conditions = os_client.get_distinct_conditions(prefix=prefix, size=limit)

    logger.info("list_conditions", prefix=prefix, count=len(conditions))
    return conditions


# --------------------------------------------------------------------------- #
#  GET /search/{trial_id}  -- single trial detail
# --------------------------------------------------------------------------- #


@router.get(
    "/{trial_id}",
    response_model=ClinicalTrial,
    summary="Get trial details by NCT ID",
    description="Retrieve the full clinical trial record for a given NCT identifier.",
)
async def get_trial_detail(trial_id: str, _user: AuthenticatedUser = Depends(get_current_user)) -> ClinicalTrial:
    os_client = get_opensearch_client()
    doc = os_client.get_trial(trial_id)

    if doc is None:
        logger.warning("trial_not_found", trial_id=trial_id)
        raise HTTPException(
            status_code=404,
            detail=f"Trial '{trial_id}' not found.",
        )

    logger.info("get_trial_detail", trial_id=trial_id)
    return ClinicalTrial(**doc)
