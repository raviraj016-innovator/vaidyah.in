"""FastAPI application entry point for the Trial Intelligence Service."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ingest, match, notifications, search
from app.services.db import close_db_pool, init_db_pool
from app.services.notification_engine import scheduler, start_scheduler
from app.services.opensearch_client import get_opensearch_client

logger = structlog.get_logger(__name__)
settings = get_settings()


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

    # Ensure OpenSearch index exists with proper mapping
    os_client = get_opensearch_client()
    os_client.ensure_index()
    logger.info("opensearch_index_ready", index=settings.opensearch_index)

    # Start the APScheduler for periodic matching / notifications
    start_scheduler()
    logger.info("scheduler_started")

    yield

    # Shutdown
    logger.info("shutting_down_trial_service")
    if scheduler.running:
        scheduler.shutdown(wait=False)
    await close_db_pool()
    logger.info("shutdown_complete")


# --------------------------------------------------------------------------- #
#  App factory
# --------------------------------------------------------------------------- #

app = FastAPI(
    title="Vaidyah Trial Intelligence Service",
    description=(
        "Clinical trial search, patient-trial matching, and notification "
        "management for the Vaidyah healthcare platform (Phase 2)."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ---------- Health check ----------
@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Liveness / readiness probe."""
    return {
        "status": "healthy",
        "service": settings.service_name,
        "environment": settings.environment,
        "version": "1.0.0",
    }
