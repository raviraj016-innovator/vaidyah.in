"""FastAPI application entry point for the Trial Intelligence Service."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import csv_ingest, ingest, match, notifications, search, summaries
from app.services.db import close_db_pool, ensure_schema, init_db_pool
from app.services.notification_engine import scheduler, start_scheduler
from app.services.opensearch_client import get_opensearch_client

logger = structlog.get_logger(__name__)
settings = get_settings()

# Paths to check for CSV seed file (mounted or local)
_CSV_SEED_PATHS = [
    "/data/clinical-trials.csv",      # Docker volume mount
    "/app/clinical-trials.csv",       # Copied into container
    "clinical-trials.csv",            # Local working directory
    "../clinical-trials.csv",         # Monorepo root (when running from services/)
]


# --------------------------------------------------------------------------- #
#  Lifespan
# --------------------------------------------------------------------------- #

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown resources."""
    logger.info(
        "starting_trial_service",
        environment=settings.environment,
        debug=settings.debug,
    )

    # Initialise database pool
    await init_db_pool()
    logger.info("database_pool_initialised")

    # Create tables / indexes if they don't exist yet
    await ensure_schema()
    logger.info("database_schema_ensured")

    # Ensure search vectors are populated for full-text search
    os_client = get_opensearch_client()
    await os_client.ensure_index()
    logger.info("pg_search_index_ready")

    # Start the APScheduler for periodic matching / notifications
    start_scheduler()
    logger.info("scheduler_started")

    # Auto-seed from CSV if the index is empty and the file exists
    await _auto_seed_csv(os_client)

    yield

    # Shutdown
    logger.info("shutting_down_trial_service")
    try:
        if scheduler.running:
            scheduler.shutdown(wait=False)
    except Exception as exc:
        logger.warning("scheduler_shutdown_failed", error=str(exc))
    await close_db_pool()
    logger.info("shutdown_complete")


async def _auto_seed_csv(os_client) -> None:
    """Auto-seed the trial index from a CSV file if the index is empty."""
    import csv
    import os

    try:
        doc_count = await os_client.count()
        if doc_count > 0:
            logger.info("auto_seed_skipped", reason="index_not_empty", count=doc_count)
            return
    except Exception:
        logger.warning("auto_seed_count_failed", exc_info=True)
        return

    csv_path = None
    for candidate in _CSV_SEED_PATHS:
        if os.path.isfile(candidate):
            csv_path = candidate
            break

    if csv_path is None:
        logger.info("auto_seed_skipped", reason="no_csv_found", searched=_CSV_SEED_PATHS)
        return

    logger.info("auto_seed_starting", csv_path=csv_path)

    try:
        with open(csv_path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        if not rows:
            logger.info("auto_seed_skipped", reason="csv_empty")
            return

        logger.info("auto_seed_rows_loaded", count=len(rows))

        from app.routers.csv_ingest import _process_csv_rows

        await _process_csv_rows(rows)
        logger.info("auto_seed_completed", rows=len(rows))
    except Exception:
        logger.exception("auto_seed_failed")


# --------------------------------------------------------------------------- #
#  App factory
# --------------------------------------------------------------------------- #

_is_prod = settings.environment.lower() == "production"

app = FastAPI(
    title="Vaidyah Trial Intelligence Service",
    description=(
        "Clinical trial search, patient-trial matching, and notification "
        "management for the Vaidyah healthcare platform (Phase 2)."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
)

# ---------- CORS ----------
# Validate CORS origins: reject wildcard in production
if _is_prod and "*" in settings.cors_origins:
    raise ValueError(
        "CORS wildcard origin ('*') is not permitted in production. "
        "Set explicit origins in the CORS_ORIGINS environment variable."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

# -- Security Headers ---
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ---------- Request timing middleware ----------
@app.middleware("http")
async def add_timing_header(request: Request, call_next) -> Response:
    start = time.perf_counter()
    response: Response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.2f}"
    return response


# ---------- Routers ----------
app.include_router(search.router, prefix=settings.api_prefix, tags=["Search"])
app.include_router(match.router, prefix=settings.api_prefix, tags=["Matching"])
app.include_router(
    notifications.router, prefix=settings.api_prefix, tags=["Notifications"]
)
app.include_router(ingest.router, prefix=settings.api_prefix, tags=["Ingest / ETL"])
app.include_router(csv_ingest.router, prefix=settings.api_prefix, tags=["CSV Import"])
app.include_router(summaries.router, prefix=settings.api_prefix, tags=["Summaries"])


# ---------- Health check ----------
@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Liveness / readiness probe."""
    result: dict = {
        "status": "healthy",
        "service": settings.service_name,
    }
    if not _is_prod:
        result["environment"] = settings.environment
        result["version"] = "1.0.0"
    return result
