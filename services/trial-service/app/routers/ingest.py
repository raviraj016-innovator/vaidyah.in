"""Ingest router -- ETL endpoints for clinical trial data from CTRI/ClinicalTrials.gov."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app.config import get_settings
from app.middleware.auth import AuthenticatedUser, get_current_user, require_admin
from app.models import (
    ClinicalTrial,
    ETLState,
    ETLStatus,
    ETLSyncRequest,
)
from app.services.db import execute, fetch_all, fetch_one, fetch_val

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/ingest")


# --------------------------------------------------------------------------- #
#  In-memory ETL state (for quick status checks without DB)
# --------------------------------------------------------------------------- #

_current_etl_state: ETLState = ETLState.IDLE
_etl_lock = asyncio.Lock()


# --------------------------------------------------------------------------- #
#  POST /ingest/sync  -- trigger a manual ETL sync
# --------------------------------------------------------------------------- #


@router.post(
    "/sync",
    response_model=ETLStatus,
    summary="Trigger trial data sync",
    description=(
        "Manually trigger an ETL sync from ClinicalTrials.gov / CTRI. "
        "The sync runs as a background task; this endpoint returns "
        "immediately with the current ETL state."
    ),
)
async def trigger_sync(
    body: ETLSyncRequest,
    background_tasks: BackgroundTasks,
    _user: AuthenticatedUser = Depends(require_admin),
) -> ETLStatus:
    global _current_etl_state

    async with _etl_lock:
        if _current_etl_state == ETLState.RUNNING:
            raise HTTPException(
                status_code=409,
                detail="An ETL sync is already in progress.",
            )
        _current_etl_state = ETLState.RUNNING

    run_id = f"etl_{uuid.uuid4().hex[:16]}"

    logger.info(
        "etl_sync_triggered",
        run_id=run_id,
        conditions=body.conditions,
        full_refresh=body.full_refresh,
        max_records=body.max_records,
    )

    # Persist run record
    try:
        await execute(
            """
            INSERT INTO etl_runs (run_id, state, started_at)
            VALUES ($1, $2, NOW())
            """,
            run_id,
            ETLState.RUNNING.value,
        )
    except Exception:
        logger.exception("etl_run_insert_failed", run_id=run_id)
        async with _etl_lock:
            _current_etl_state = ETLState.FAILED
        raise HTTPException(
            status_code=503,
            detail="Failed to initialize ETL run. Database may be unavailable.",
        )

    # Schedule background sync
    background_tasks.add_task(
        _run_etl_sync,
        run_id=run_id,
        conditions=body.conditions,
        full_refresh=body.full_refresh,
        max_records=body.max_records,
    )

    return ETLStatus(
        state=ETLState.RUNNING,
        last_sync_started=datetime.now(timezone.utc),
    )


# --------------------------------------------------------------------------- #
#  GET /ingest/status  -- current ETL pipeline status
# --------------------------------------------------------------------------- #


@router.get(
    "/status",
    response_model=ETLStatus,
    summary="Get ETL pipeline status",
    description="Returns the current state of the trial data ingestion pipeline.",
)
async def get_etl_status(
    _user: AuthenticatedUser = Depends(get_current_user),
) -> ETLStatus:
    # Try to fetch the most recent ETL run from the database
    row = await fetch_one(
        """
        SELECT run_id, state, started_at, completed_at, error,
               trials_fetched, trials_indexed, trials_failed
        FROM etl_runs
        ORDER BY started_at DESC NULLS LAST
        LIMIT 1
        """
    )

    if row is None:
        return ETLStatus(state=ETLState.IDLE)

    return ETLStatus(
        state=ETLState(row["state"]) if row["state"] else ETLState.IDLE,
        last_sync_started=row["started_at"],
        last_sync_completed=row["completed_at"],
        last_sync_error=row["error"],
        trials_fetched=row["trials_fetched"] or 0,
        trials_indexed=row["trials_indexed"] or 0,
        trials_failed=row["trials_failed"] or 0,
    )


# --------------------------------------------------------------------------- #
#  POST /ingest/trials  -- manually upsert a single trial
# --------------------------------------------------------------------------- #


@router.post(
    "/trials",
    response_model=dict,
    summary="Upsert a clinical trial record",
    description=(
        "Insert or update a single clinical trial record in the database "
        "and search index. Useful for manual corrections and testing."
    ),
)
async def upsert_trial(trial: ClinicalTrial, _user: AuthenticatedUser = Depends(require_admin)) -> dict:
    import json

    logger.info("upsert_trial", nct_id=trial.nct_id)

    trial_data = trial.model_dump(mode="json")

    try:
        await execute(
            """
            INSERT INTO trials (nct_id, data, indexed_at, updated_at)
            VALUES ($1, $2::jsonb, NOW(), NOW())
            ON CONFLICT (nct_id) DO UPDATE
            SET data = $2::jsonb, updated_at = NOW()
            """,
            trial.nct_id,
            json.dumps(trial_data),
        )
    except Exception:
        logger.exception("trial_upsert_failed", nct_id=trial.nct_id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upsert trial {trial.nct_id}.",
        )

    # Index into PostgreSQL full-text search
    try:
        from app.services.opensearch_client import get_opensearch_client

        os_client = get_opensearch_client()
        index_doc = trial.model_dump(mode="json", exclude_none=True)
        await os_client.index_trial(trial.nct_id, index_doc)
        logger.info("trial_indexed", nct_id=trial.nct_id)
    except Exception:
        logger.warning("trial_index_failed", nct_id=trial.nct_id, exc_info=True)

    return {
        "nct_id": trial.nct_id,
        "status": "upserted",
        "message": f"Trial {trial.nct_id} successfully upserted.",
    }


# --------------------------------------------------------------------------- #
#  GET /ingest/trials  -- list ingested trials (paginated)
# --------------------------------------------------------------------------- #


@router.get(
    "/trials",
    response_model=list[dict],
    summary="List ingested trials",
    description="Retrieve a paginated list of trials stored in the database.",
)
async def list_ingested_trials(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> list[dict]:
    offset = (page - 1) * page_size

    rows = await fetch_all(
        """
        SELECT nct_id, data->>'title' AS title,
               data->>'overall_status' AS status,
               indexed_at, updated_at
        FROM trials
        ORDER BY updated_at DESC
        LIMIT $1 OFFSET $2
        """,
        page_size,
        offset,
    )

    return [
        {
            "nct_id": row["nct_id"],
            "title": row["title"],
            "status": row["status"],
            "indexed_at": row["indexed_at"].isoformat() if row["indexed_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in rows
    ]


# --------------------------------------------------------------------------- #
#  DELETE /ingest/trials/{nct_id}  -- remove a trial
# --------------------------------------------------------------------------- #


@router.delete(
    "/trials/{nct_id}",
    response_model=dict,
    summary="Delete a trial record",
    description="Remove a clinical trial from the database and search index.",
)
async def delete_trial(nct_id: str, _user: AuthenticatedUser = Depends(require_admin)) -> dict:
    logger.info("delete_trial", nct_id=nct_id)

    row = await fetch_one(
        "SELECT nct_id FROM trials WHERE nct_id = $1",
        nct_id,
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Trial '{nct_id}' not found.",
        )

    await execute("DELETE FROM trials WHERE nct_id = $1", nct_id)

    # Remove from search index
    try:
        from app.services.opensearch_client import get_opensearch_client

        os_client = get_opensearch_client()
        await os_client.delete_trial(nct_id)
    except Exception:
        logger.warning("trial_index_delete_failed", nct_id=nct_id, exc_info=True)

    return {
        "nct_id": nct_id,
        "status": "deleted",
        "message": f"Trial {nct_id} successfully deleted.",
    }


# --------------------------------------------------------------------------- #
#  Background ETL task
# --------------------------------------------------------------------------- #


async def _run_etl_sync(
    run_id: str,
    conditions: list[str],
    full_refresh: bool,
    max_records: Optional[int],
) -> None:
    """Background task that fetches trials from ClinicalTrials.gov and indexes them.

    This is the core ETL pipeline.  It:
    1. Queries the ClinicalTrials.gov API v2 for trials matching the criteria.
    2. Parses the JSON/XML responses into ClinicalTrial models.
    3. Upserts each trial into PostgreSQL.
    4. Indexes each trial into OpenSearch.
    5. Updates the ETL run record with final stats.
    """
    global _current_etl_state
    import json

    import httpx

    logger.info("etl_sync_started", run_id=run_id)

    trials_fetched = 0
    trials_indexed = 0
    trials_failed = 0
    error_message: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Build query parameters
            params: dict = {
                "format": "json",
                "pageSize": min(settings.ctgov_page_size, max_records or 9999),
            }

            if conditions:
                params["query.cond"] = ",".join(conditions)

            # Fetch from ClinicalTrials.gov API v2
            url = f"{settings.ctgov_api_base}/studies"
            pages_fetched = 0

            while pages_fetched < settings.ctgov_max_pages:
                try:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    data = response.json()
                except Exception as exc:
                    logger.error(
                        "etl_api_request_failed",
                        url=url,
                        error=str(exc),
                    )
                    error_message = f"API request failed: {exc}"
                    break

                studies = data.get("studies", [])
                if not studies:
                    break

                for study in studies:
                    if max_records and trials_fetched >= max_records:
                        break

                    try:
                        # Extract trial data from the API response
                        protocol = study.get("protocolSection", {})
                        id_module = protocol.get("identificationModule", {})
                        status_module = protocol.get("statusModule", {})
                        desc_module = protocol.get("descriptionModule", {})
                        conditions_module = protocol.get("conditionsModule", {})
                        design_module = protocol.get("designModule", {})

                        nct_id = id_module.get("nctId", f"UNKNOWN_{uuid.uuid4().hex[:8]}")
                        title = id_module.get("officialTitle", id_module.get("briefTitle", "Untitled"))

                        trial_data = {
                            "nct_id": nct_id,
                            "title": title,
                            "brief_title": id_module.get("briefTitle"),
                            "official_title": id_module.get("officialTitle"),
                            "brief_summary": desc_module.get("briefSummary"),
                            "overall_status": status_module.get("overallStatus", "Unknown status"),
                            "conditions": conditions_module.get("conditions", []),
                            "phase": (design_module.get("phases", [None]) or [None])[0],
                        }

                        # Upsert into database
                        await execute(
                            """
                            INSERT INTO trials (nct_id, data, indexed_at, updated_at)
                            VALUES ($1, $2::jsonb, NOW(), NOW())
                            ON CONFLICT (nct_id) DO UPDATE
                            SET data = $2::jsonb, updated_at = NOW()
                            """,
                            nct_id,
                            json.dumps(trial_data),
                        )

                        # Index into PostgreSQL full-text search
                        try:
                            from app.services.opensearch_client import get_opensearch_client

                            os_client = get_opensearch_client()
                            await os_client.index_trial(nct_id, trial_data)
                            trials_indexed += 1
                        except Exception:
                            logger.warning(
                                "etl_index_failed",
                                nct_id=nct_id,
                                exc_info=True,
                            )
                            trials_failed += 1

                    except Exception:
                        trials_failed += 1
                        logger.warning(
                            "etl_trial_process_failed",
                            exc_info=True,
                        )

                    trials_fetched += 1

                # Check for next page
                next_page_token = data.get("nextPageToken")
                if not next_page_token or (max_records and trials_fetched >= max_records):
                    break

                params["pageToken"] = next_page_token
                pages_fetched += 1

                # Enforce rate limit between API calls
                if settings.ctgov_rate_limit_per_second > 0:
                    await asyncio.sleep(1.0 / settings.ctgov_rate_limit_per_second)

        final_state = ETLState.COMPLETED

    except Exception as exc:
        logger.exception("etl_sync_failed", run_id=run_id)
        error_message = str(exc)
        final_state = ETLState.FAILED

    # Update the ETL run record and always reset state
    try:
        await execute(
            """
            UPDATE etl_runs
            SET state = $2, completed_at = NOW(), error = $3,
                trials_fetched = $4, trials_indexed = $5, trials_failed = $6
            WHERE run_id = $1
            """,
            run_id,
            final_state.value,
            error_message,
            trials_fetched,
            trials_indexed,
            trials_failed,
        )
    except Exception:
        logger.exception("etl_run_update_failed", run_id=run_id)
    finally:
        # Always reset state to prevent permanent RUNNING lock
        async with _etl_lock:
            _current_etl_state = final_state

    logger.info(
        "etl_sync_completed",
        run_id=run_id,
        state=final_state.value,
        fetched=trials_fetched,
        indexed=trials_indexed,
        failed=trials_failed,
    )
