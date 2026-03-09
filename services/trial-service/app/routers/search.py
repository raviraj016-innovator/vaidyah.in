"""Search router -- clinical trial discovery and lookup endpoints."""

from __future__ import annotations

import asyncio
import json
import re
from typing import Optional

import boto3
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
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

# --------------------------------------------------------------------------- #
#  Hindi / Indian-language medical term → English fast-lookup dictionary
# --------------------------------------------------------------------------- #

HINDI_MEDICAL_TERMS: dict[str, str] = {
    # Conditions
    "मधुमेह": "diabetes",
    "शुगर": "diabetes",
    "उच्च रक्तचाप": "hypertension",
    "हाई ब्लड प्रेशर": "hypertension",
    "बुखार": "fever",
    "खांसी": "cough",
    "सिरदर्द": "headache",
    "दमा": "asthma",
    "अस्थमा": "asthma",
    "कैंसर": "cancer",
    "हृदय रोग": "heart disease",
    "दिल की बीमारी": "heart disease",
    "गुर्दे की बीमारी": "kidney disease",
    "किडनी": "kidney",
    "लिवर": "liver",
    "जिगर की बीमारी": "liver disease",
    "टीबी": "tuberculosis",
    "तपेदिक": "tuberculosis",
    "मलेरिया": "malaria",
    "डेंगू": "dengue",
    "चिकनगुनिया": "chikungunya",
    "थायराइड": "thyroid",
    "गठिया": "arthritis",
    "जोड़ों का दर्द": "joint pain",
    "पेट दर्द": "abdominal pain",
    "दस्त": "diarrhea",
    "कब्ज": "constipation",
    "एनीमिया": "anemia",
    "खून की कमी": "anemia",
    "मोटापा": "obesity",
    "अवसाद": "depression",
    "चिंता": "anxiety",
    "मिर्गी": "epilepsy",
    "पक्षाघात": "paralysis",
    "लकवा": "stroke",
    "निमोनिया": "pneumonia",
    "पीलिया": "jaundice",
    "एड्स": "AIDS",
    "एचआईवी": "HIV",
    "कोलेस्ट्रॉल": "cholesterol",
    "ब्रेस्ट कैंसर": "breast cancer",
    "स्तन कैंसर": "breast cancer",
    "फेफड़ों का कैंसर": "lung cancer",
    "रक्त कैंसर": "leukemia",
    "ल्यूकेमिया": "leukemia",
    # Anatomy / general
    "आंख": "eye",
    "त्वचा": "skin",
    "हड्डी": "bone",
    "रक्त": "blood",
    "गर्भावस्था": "pregnancy",
    "प्रसव": "delivery",
    "टीकाकरण": "vaccination",
    "टीका": "vaccine",
}

# Pre-compile a regex that matches any Hindi term (longest-first to handle
# multi-word entries like "उच्च रक्तचाप" before single-word sub-matches).
_HINDI_TERM_PATTERN: re.Pattern[str] = re.compile(
    "|".join(re.escape(term) for term in sorted(HINDI_MEDICAL_TERMS, key=len, reverse=True))
)


def _has_non_ascii(text: str) -> bool:
    """Return True if *text* contains any non-ASCII character (Devanagari, etc.)."""
    return any(ord(ch) > 127 for ch in text)


def _fast_translate(query: str) -> str:
    """Replace known Hindi medical terms with their English equivalents.

    Returns the (possibly partially) translated query string.
    """

    def _replace(match: re.Match[str]) -> str:
        return HINDI_MEDICAL_TERMS[match.group(0)]

    return _HINDI_TERM_PATTERN.sub(_replace, query)


async def _translate_query_to_english(query: str) -> str:
    """Translate a Hindi / regional-language search query to English medical terminology.

    Strategy:
      1. If the query is pure ASCII, return it unchanged.
      2. Try the fast dictionary lookup first — it is instant and free.
      3. If any non-ASCII characters remain after the dictionary pass, call
         AWS Bedrock (Claude) for a full translation.
      4. On any Bedrock failure, fall back to whatever the dictionary produced.
    """
    if not _has_non_ascii(query):
        return query

    # --- Stage 1: fast dictionary replacement ---
    translated = _fast_translate(query)

    # If the dictionary resolved everything, we are done.
    if not _has_non_ascii(translated):
        logger.info(
            "query_translated_dict",
            original=query,
            translated=translated,
        )
        return translated.strip()

    # --- Stage 2: Bedrock translation for remaining non-ASCII text ---
    try:
        settings = get_settings()
        bedrock = boto3.client(
            "bedrock-runtime",
            region_name=settings.bedrock_region,
        )

        prompt = (
            "You are a medical translation assistant. "
            "Translate the following clinical-trial search query from Hindi (or any Indian language) "
            "into precise English medical terminology suitable for searching a clinical-trials database. "
            "Return ONLY the translated English query text — no explanations, no quotes.\n\n"
            f"Query: {query}"
        )

        body = json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 256,
                "temperature": 0.0,
                "messages": [{"role": "user", "content": prompt}],
            }
        )

        response = await asyncio.to_thread(
            bedrock.invoke_model,
            modelId=settings.bedrock_model_id,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        result = json.loads(response["body"].read())
        english_query = result["content"][0]["text"].strip()

        logger.info(
            "query_translated_bedrock",
            original=query,
            translated=english_query,
        )
        return english_query

    except Exception:
        logger.warning(
            "query_translation_failed",
            original=query,
            fallback=translated,
            exc_info=True,
        )
        # Fall back to whatever the dictionary pass produced.
        return translated.strip()

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
    # --- Multilingual query translation ---
    translated_query = query
    if query is not None:
        translated_query = await _translate_query_to_english(query)

    demographics: Optional[DemographicFilter] = None
    if min_age is not None or max_age is not None or gender is not None:
        demographics = DemographicFilter(
            min_age=min_age,
            max_age=max_age,
            gender=gender,
        )

    request = TrialSearchRequest(
        query=translated_query,
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
        translated_query=translated_query if translated_query != query else None,
        conditions=conditions,
        phases=phases,
        page=page,
        page_size=page_size,
    )

    response = await os_client.search_trials(request)
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
    conditions = await os_client.get_distinct_conditions(prefix=prefix, size=limit)

    logger.info("list_conditions", prefix=prefix, count=len(conditions))
    return conditions


# --------------------------------------------------------------------------- #
#  GET /search/{trial_id}/similar  -- similar trials
# --------------------------------------------------------------------------- #


@router.get(
    "/{trial_id}/similar",
    response_model=list[ClinicalTrial],
    summary="Find similar trials",
    description=(
        "Return trials that are similar to the given trial based on title, "
        "summary, conditions, and keywords using OpenSearch more_like_this."
    ),
)
async def find_similar_trials(
    trial_id: str,
    limit: int = Query(5, ge=1, le=10, description="Maximum number of similar trials to return"),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> list[ClinicalTrial]:
    os_client = get_opensearch_client()

    try:
        similar_docs = await os_client.find_similar_trials(trial_id, max_results=limit)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"Trial '{trial_id}' not found.",
        )

    logger.info("find_similar_trials", trial_id=trial_id, count=len(similar_docs))
    return [ClinicalTrial(**doc) for doc in similar_docs]


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
    doc = await os_client.get_trial(trial_id)

    if doc is None:
        logger.warning("trial_not_found", trial_id=trial_id)
        raise HTTPException(
            status_code=404,
            detail=f"Trial '{trial_id}' not found.",
        )

    logger.info("get_trial_detail", trial_id=trial_id)
    return ClinicalTrial(**doc)
