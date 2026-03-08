"""Summaries router -- plain-language trial summary generation and caching."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user
from app.services.db import execute, fetch_one
from app.services.summary_generator import (
    generate_plain_summary,
    generate_plain_summaries_batch,
)

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/summaries")


# --------------------------------------------------------------------------- #
#  Request / response models
# --------------------------------------------------------------------------- #


class TrialSummaryInput(BaseModel):
    """Input data for generating a plain-language summary."""

    nct_id: str = Field(..., description="ClinicalTrials.gov NCT identifier")
    title: str = Field(..., description="Official trial title")
    brief_summary: Optional[str] = Field(None, description="Brief summary from ClinicalTrials.gov")
    conditions: list[str] = Field(default_factory=list, description="Target conditions")
    interventions: list[dict] = Field(default_factory=list, description="Intervention details")
    eligibility: Optional[dict] = Field(None, description="Eligibility criteria")


class PlainLanguageSummary(BaseModel):
    """Generated plain-language summary of a clinical trial."""

    nct_id: str
    plain_summary: str = Field(..., description="Jargon-free English summary")
    plain_summary_hi: str = Field(..., description="Hindi translation (Devanagari)")
    key_points: list[str] = Field(default_factory=list, description="3-5 bullet points")
    risk_benefit: str = Field(..., description="Simple risk/benefit explanation")
    source: str = Field(..., description="Generation source: 'bedrock' or 'fallback'")
    generated_at: Optional[datetime] = None


class BatchSummaryRequest(BaseModel):
    """Request body for batch summary generation."""

    trials: list[TrialSummaryInput] = Field(
        ..., min_length=1, max_length=50, description="Trials to summarise (max 50)"
    )


class BatchSummaryResponse(BaseModel):
    """Response from batch summary generation."""

    total: int
    succeeded: int
    failed: int
    summaries: list[PlainLanguageSummary]


# --------------------------------------------------------------------------- #
#  POST /summaries/generate -- generate summary for a single trial
# --------------------------------------------------------------------------- #


@router.post(
    "/generate",
    response_model=PlainLanguageSummary,
    summary="Generate plain-language summary",
    description=(
        "Generate a patient-friendly summary for a single clinical trial using "
        "AWS Bedrock Claude.  The result is cached in PostgreSQL for subsequent "
        "retrieval via GET /summaries/{trial_id}."
    ),
)
async def generate_summary(
    body: TrialSummaryInput,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> PlainLanguageSummary:
    logger.info("generate_summary.request", nct_id=body.nct_id)

    trial_data = body.model_dump()
    result = await generate_plain_summary(trial_data)

    now = datetime.now(timezone.utc)

    # Persist to cache
    await _cache_summary(
        nct_id=body.nct_id,
        summary_data=result,
        generated_at=now,
    )

    return PlainLanguageSummary(
        nct_id=body.nct_id,
        plain_summary=result["plain_summary"],
        plain_summary_hi=result["plain_summary_hi"],
        key_points=result["key_points"],
        risk_benefit=result["risk_benefit"],
        source=result["source"],
        generated_at=now,
    )


# --------------------------------------------------------------------------- #
#  POST /summaries/batch -- generate summaries for multiple trials
# --------------------------------------------------------------------------- #


@router.post(
    "/batch",
    response_model=BatchSummaryResponse,
    summary="Batch-generate plain-language summaries",
    description=(
        "Generate plain-language summaries for up to 50 trials in a single "
        "request.  Bedrock calls are made concurrently with throttling.  "
        "Results are cached for subsequent retrieval."
    ),
)
async def generate_batch_summaries(
    body: BatchSummaryRequest,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> BatchSummaryResponse:
    logger.info("batch_summary.request", count=len(body.trials))

    trial_dicts = [t.model_dump() for t in body.trials]
    results = await generate_plain_summaries_batch(trial_dicts)

    now = datetime.now(timezone.utc)
    summaries: list[PlainLanguageSummary] = []
    failed_count = 0

    for trial_input, result in zip(body.trials, results):
        has_error = "error" in result
        if has_error:
            failed_count += 1

        # Cache even fallback results so they are retrievable
        await _cache_summary(
            nct_id=trial_input.nct_id,
            summary_data=result,
            generated_at=now,
        )

        summaries.append(
            PlainLanguageSummary(
                nct_id=trial_input.nct_id,
                plain_summary=result["plain_summary"],
                plain_summary_hi=result["plain_summary_hi"],
                key_points=result["key_points"],
                risk_benefit=result["risk_benefit"],
                source=result["source"],
                generated_at=now,
            )
        )

    logger.info(
        "batch_summary.completed",
        total=len(body.trials),
        succeeded=len(body.trials) - failed_count,
        failed=failed_count,
    )

    return BatchSummaryResponse(
        total=len(body.trials),
        succeeded=len(body.trials) - failed_count,
        failed=failed_count,
        summaries=summaries,
    )


# --------------------------------------------------------------------------- #
#  GET /summaries/{trial_id} -- get cached summary
# --------------------------------------------------------------------------- #


@router.get(
    "/{trial_id}",
    response_model=PlainLanguageSummary,
    summary="Get cached plain-language summary",
    description=(
        "Retrieve a previously generated plain-language summary for a trial.  "
        "Returns 404 if no summary has been generated yet."
    ),
)
async def get_cached_summary(
    trial_id: str,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> PlainLanguageSummary:
    logger.info("get_cached_summary.request", trial_id=trial_id)

    row = await fetch_one(
        """
        SELECT nct_id, plain_summary, plain_summary_hi, key_points,
               risk_benefit, source, generated_at
        FROM trial_summaries
        WHERE nct_id = $1
        """,
        trial_id,
    )

    if row is None:
        logger.warning("cached_summary_not_found", trial_id=trial_id)
        raise HTTPException(
            status_code=404,
            detail=f"No plain-language summary found for trial '{trial_id}'. "
            "Use POST /summaries/generate to create one.",
        )

    key_points = row["key_points"]
    if isinstance(key_points, str):
        key_points = json.loads(key_points)

    return PlainLanguageSummary(
        nct_id=row["nct_id"],
        plain_summary=row["plain_summary"],
        plain_summary_hi=row["plain_summary_hi"],
        key_points=key_points,
        risk_benefit=row["risk_benefit"],
        source=row["source"],
        generated_at=row["generated_at"],
    )


# --------------------------------------------------------------------------- #
#  Internal helpers
# --------------------------------------------------------------------------- #


async def _cache_summary(
    nct_id: str,
    summary_data: dict,
    generated_at: datetime,
) -> None:
    """Upsert a generated summary into the trial_summaries cache table."""
    try:
        await execute(
            """
            INSERT INTO trial_summaries
                (nct_id, plain_summary, plain_summary_hi, key_points,
                 risk_benefit, source, generated_at)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
            ON CONFLICT (nct_id) DO UPDATE SET
                plain_summary = EXCLUDED.plain_summary,
                plain_summary_hi = EXCLUDED.plain_summary_hi,
                key_points = EXCLUDED.key_points,
                risk_benefit = EXCLUDED.risk_benefit,
                source = EXCLUDED.source,
                generated_at = EXCLUDED.generated_at
            """,
            nct_id,
            summary_data["plain_summary"],
            summary_data["plain_summary_hi"],
            json.dumps(summary_data["key_points"]),
            summary_data["risk_benefit"],
            summary_data["source"],
            generated_at,
        )
        logger.debug("summary_cached", nct_id=nct_id)
    except Exception:
        logger.warning("summary_cache_failed", nct_id=nct_id, exc_info=True)
