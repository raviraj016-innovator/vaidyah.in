"""CSV ingest router -- bulk import clinical trial data from scraped CSV files."""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile

from app.config import get_settings
from app.middleware.auth import AuthenticatedUser, require_admin
from app.services.db import execute_many

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter(prefix="/ingest/csv")

# Status tracking for CSV imports
_csv_import_status: dict = {
    "state": "idle",
    "total_rows": 0,
    "processed": 0,
    "indexed": 0,
    "failed": 0,
    "errors": [],
}


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

_PHASE_MAP: dict[str, Optional[str]] = {
    "PHASE1": "Phase 1",
    "PHASE2": "Phase 2",
    "PHASE3": "Phase 3",
    "PHASE4": "Phase 4",
    "EARLY_PHASE1": "Early Phase 1",
    "NA": None,
    "N/A": None,
}

_STATUS_MAP: dict[str, str] = {
    "RECRUITING": "recruiting",
    "COMPLETED": "completed",
    "ACTIVE_NOT_RECRUITING": "active_not_recruiting",
    "NOT_YET_RECRUITING": "not_yet_recruiting",
    "SUSPENDED": "suspended",
    "TERMINATED": "terminated",
    "WITHDRAWN": "withdrawn",
    "ENROLLING_BY_INVITATION": "recruiting",  # closest enum value
}

# Display-friendly status for OpenSearch
_STATUS_DISPLAY: dict[str, str] = {
    "recruiting": "Recruiting",
    "completed": "Completed",
    "active_not_recruiting": "Active, not recruiting",
    "not_yet_recruiting": "Not yet recruiting",
    "suspended": "Suspended",
    "terminated": "Terminated",
    "withdrawn": "Withdrawn",
}


def _parse_age_years(age_str: Optional[str]) -> Optional[int]:
    """Parse '18 Years' or 'N/A' into integer or None."""
    if not age_str or age_str.strip().upper() in ("N/A", "NA", ""):
        return None
    match = re.search(r"(\d+)", age_str.strip())
    if not match:
        return None
    value = int(match.group(1))
    lower = age_str.lower()
    if "month" in lower:
        return max(int(value / 12), 0)
    return value


def _parse_date(date_str: Optional[str]) -> Optional[str]:
    """Parse date string to ISO format, return None on failure."""
    if not date_str or date_str.strip().upper() in ("N/A", "NA", ""):
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y", "%B %d, %Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _split_conditions(cond_str: Optional[str]) -> list[str]:
    """Split comma-separated conditions, stripping whitespace."""
    if not cond_str:
        return []
    return [c.strip() for c in cond_str.split(",") if c.strip()]


def _split_categories(cat_str: Optional[str]) -> list[str]:
    """Split comma-separated categories."""
    if not cat_str:
        return []
    return [c.strip() for c in cat_str.split(",") if c.strip()]


def _normalize_phase(phase_str: Optional[str]) -> Optional[str]:
    """Normalize phase values from CSV to standard format."""
    if not phase_str:
        return None
    cleaned = phase_str.strip().upper().replace(" ", "")
    return _PHASE_MAP.get(cleaned, phase_str.strip())


def _normalize_status(status_str: Optional[str]) -> Optional[str]:
    """Normalize status values from CSV to DB enum. Returns None for unknown statuses."""
    if not status_str:
        return None
    cleaned = status_str.strip().upper().replace(" ", "_")
    return _STATUS_MAP.get(cleaned)


def _csv_row_to_trial_data(row: dict) -> dict:
    """Convert a CSV row dict into the trial data structure for DB + OpenSearch."""
    nct_id = row.get("nct_id", "").strip()
    if not nct_id:
        raise ValueError("Missing nct_id")

    conditions = _split_conditions(row.get("condition"))
    categories = _split_categories(row.get("categories"))
    min_age = _parse_age_years(row.get("min_age"))
    max_age = _parse_age_years(row.get("max_age"))
    gender = row.get("gender", "All").strip() or "All"
    phase = _normalize_phase(row.get("phase"))
    status = _normalize_status(row.get("status"))
    if not status:
        raise ValueError(f"Unknown status: {row.get('status')}")
    start_date = _parse_date(row.get("start_date"))

    eligibility = {
        "age_min": min_age,
        "age_max": max_age,
        "gender": gender.lower(),
        "criteria_text": "",
        "inclusion": [],
        "exclusion": [],
    }

    # Age group and race/ethnicity as extra metadata
    age_group = row.get("age_group", "").strip()
    race_ethnicity = row.get("race_ethnicity", "").strip()

    return {
        "nct_id": nct_id,
        "title": row.get("title", "").strip(),
        "brief_summary": row.get("brief_summary", "").strip(),
        "plain_summary": row.get("plain_english_summary", "").strip(),
        "conditions": conditions,
        "categories": categories,
        "phase": phase,
        "overall_status": status,
        "status": status,
        "sponsor": row.get("sponsor", "").strip() or None,
        "start_date": start_date,
        "url": row.get("url", "").strip() or None,
        "locations_raw": row.get("locations", "").strip() or None,
        "eligibility": eligibility,
        "age_group": age_group or None,
        "race_ethnicity": race_ethnicity or None,
        "min_age_years": min_age,
        "max_age_years": max_age,
        "gender": gender,
    }


# --------------------------------------------------------------------------- #
#  POST /ingest/csv/upload -- bulk import from CSV file
# --------------------------------------------------------------------------- #

@router.post(
    "/upload",
    summary="Upload and ingest clinical trial CSV",
    description=(
        "Upload a CSV file with scraped clinical trial data. "
        "Rows are parsed, validated, upserted into PostgreSQL, "
        "and indexed into OpenSearch for search."
    ),
)
async def upload_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    _user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    global _csv_import_status

    if _csv_import_status["state"] == "running":
        raise HTTPException(status_code=409, detail="A CSV import is already in progress.")

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv file.")

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    # Quick row count
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no data rows.")

    _csv_import_status = {
        "state": "running",
        "total_rows": len(rows),
        "processed": 0,
        "indexed": 0,
        "failed": 0,
        "errors": [],
    }

    logger.info("csv_upload_started", filename=file.filename, rows=len(rows))
    background_tasks.add_task(_process_csv_rows, rows)

    return {
        "status": "accepted",
        "message": f"CSV import started: {len(rows)} rows queued for processing.",
        "total_rows": len(rows),
    }


# --------------------------------------------------------------------------- #
#  GET /ingest/csv/status -- check import progress
# --------------------------------------------------------------------------- #

@router.get(
    "/status",
    summary="Get CSV import status",
    description="Returns current progress of the CSV import job.",
)
async def get_csv_status(
    _user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return _csv_import_status


# --------------------------------------------------------------------------- #
#  Background processing
# --------------------------------------------------------------------------- #

BATCH_SIZE = 100


async def _process_csv_rows(rows: list[dict]) -> None:
    """Process CSV rows: index into PostgreSQL full-text search (trials table)."""
    global _csv_import_status

    batch_os: list[dict] = []
    ingested_trials: list[dict] = []

    for i, row in enumerate(rows):
        try:
            trial_data = _csv_row_to_trial_data(row)
        except Exception as exc:
            _csv_import_status["failed"] += 1
            if len(_csv_import_status["errors"]) < 50:
                _csv_import_status["errors"].append(
                    f"Row {i + 2}: {str(exc)[:200]}"
                )
            _csv_import_status["processed"] += 1
            continue

        nct_id = trial_data["nct_id"]

        # Build document for the trials JSONB table + tsvector search index
        os_doc = {
            "nct_id": nct_id,
            "title": trial_data["title"],
            "brief_title": trial_data["title"],
            "brief_summary": trial_data["brief_summary"],
            "plain_language_summary": trial_data["plain_summary"],
            "overall_status": _STATUS_DISPLAY.get(trial_data["status"], trial_data["status"]),
            "phase": trial_data["phase"],
            "conditions": trial_data["conditions"],
            "sponsor": trial_data["sponsor"],
            "start_date": trial_data["start_date"],
            "url": trial_data["url"],
            "eligibility": {
                "gender": trial_data["gender"],
                "minimum_age_years": trial_data["min_age_years"],
                "maximum_age_years": trial_data["max_age_years"],
                "healthy_volunteers": False,
            },
            "locations": (
                [{"facility_name": trial_data["locations_raw"]}]
                if trial_data.get("locations_raw")
                else []
            ),
            "categories": trial_data["categories"],
            "age_group": trial_data["age_group"],
            "race_ethnicity": trial_data["race_ethnicity"],
        }
        batch_os.append(os_doc)
        ingested_trials.append({
            "nct_id": nct_id,
            "title": trial_data["title"],
            "brief_summary": trial_data["brief_summary"],
            "conditions": trial_data["conditions"],
        })
        _csv_import_status["processed"] += 1

        # Flush batch
        if len(batch_os) >= BATCH_SIZE:
            await _flush_batch(batch_os)
            batch_os = []

    # Flush remaining
    if batch_os:
        await _flush_batch(batch_os)

    _csv_import_status["state"] = "completed"
    logger.info(
        "csv_import_completed",
        total=_csv_import_status["total_rows"],
        indexed=_csv_import_status["indexed"],
        failed=_csv_import_status["failed"],
    )

    # Kick off background summary generation for ingested trials
    await _generate_summaries_for_ingested(ingested_trials)


async def _flush_batch(batch_os: list[dict]) -> None:
    """Flush a batch of rows to PostgreSQL full-text search index (trials table).

    The trial-service uses its own ``trials`` table (nct_id, data JSONB,
    search_vector) rather than the ``clinical_trials`` relational table from
    init.sql.  We index directly via the search client which handles both
    the data upsert and the tsvector computation.
    """
    global _csv_import_status

    # Index into PostgreSQL full-text search (trials table with JSONB)
    try:
        from app.services.opensearch_client import get_opensearch_client

        os_client = get_opensearch_client()
        for doc in batch_os:
            try:
                await os_client.index_trial(doc["nct_id"], doc)
                _csv_import_status["indexed"] += 1
            except Exception:
                _csv_import_status["failed"] += 1
                logger.warning("csv_pg_index_failed", nct_id=doc.get("nct_id"), exc_info=True)
    except Exception:
        logger.exception("csv_pg_batch_index_failed")
        _csv_import_status["failed"] += len(batch_os)


async def _generate_summaries_for_ingested(trials: list[dict]) -> None:
    """Kick off plain-language summary generation for newly ingested trials.

    Calls the summary generator in batches to avoid overwhelming Bedrock.
    Failures are logged but do not affect the overall import status.
    """
    if not trials:
        return

    try:
        from app.services.summary_generator import generate_plain_summaries_batch

        logger.info("csv_summary_generation_starting", count=len(trials))
        await generate_plain_summaries_batch(trials, concurrency=5)
        logger.info("csv_summaries_generated", total=len(trials))
    except ImportError:
        logger.info("csv_summary_skipped", reason="summary_generator_not_available")
    except Exception:
        logger.warning("csv_summary_generation_batch_failed", exc_info=True)
