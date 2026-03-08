"""Vaidyah NLU Service -- FastAPI entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers.nlu import router as nlu_router
from app.services.bedrock_client import BedrockClient
from app.services.comprehend_medical import ComprehendMedicalClient
from app.services.symptom_extractor import SymptomExtractor

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(structlog, 'get_level_from_name', lambda n: {"debug": 10, "info": 20, "warning": 30, "error": 40, "critical": 50}.get(n.lower(), 20))(get_settings().log_level)
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Lifespan -- initialise / tear-down shared resources
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info(
        "nlu_service_starting",
        service=settings.service_name,
        version=settings.service_version,
        environment=settings.environment,
    )

    bedrock_client: BedrockClient | None = None
    comprehend_client: ComprehendMedicalClient | None = None

    try:
        bedrock_client = BedrockClient()
        logger.info("bedrock_client_ready")
    except Exception:
        logger.exception("bedrock_client_init_failed")

    try:
        comprehend_client = ComprehendMedicalClient()
        logger.info("comprehend_medical_client_ready")
    except Exception:
        logger.exception("comprehend_medical_client_init_failed")

    symptom_extractor: SymptomExtractor | None = None
    if bedrock_client and comprehend_client:
        symptom_extractor = SymptomExtractor(
            bedrock_client=bedrock_client,
            comprehend_client=comprehend_client,
        )
        logger.info("symptom_extractor_ready")

    app.state.bedrock_client = bedrock_client
    app.state.comprehend_client = comprehend_client
    app.state.symptom_extractor = symptom_extractor

    logger.info("nlu_service_started")
    yield

    logger.info("nlu_service_shutting_down")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

_nlu_settings = get_settings()
_is_prod = _nlu_settings.environment.lower() == "production"

app = FastAPI(
    title="Vaidyah NLU Service",
    description="Natural Language Understanding service for medical consultations -- "
    "symptom extraction, entity recognition, follow-up generation, translation, "
    "SOAP notes, and clinical summarization.",
    version=_nlu_settings.service_version,
    lifespan=lifespan,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# Validate CORS origins: reject wildcard in production
if _is_prod and "*" in get_settings().cors_origins:
    raise ValueError(
        "CORS wildcard origin ('*') is not permitted in production. "
        "Set explicit origins in the CORS_ORIGINS environment variable."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
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

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(nlu_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Health check with AWS connectivity status",
    tags=["health"],
)
async def health_check() -> JSONResponse:
    bedrock_ok = app.state.bedrock_client is not None
    comprehend_ok = app.state.comprehend_client is not None

    healthy = bedrock_ok and comprehend_ok

    _settings = get_settings()
    payload: dict = {
        "status": "healthy" if healthy else "degraded",
        "service": _settings.service_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dependencies": {
            "bedrock": "connected" if bedrock_ok else "unavailable",
            "comprehend_medical": "connected" if comprehend_ok else "unavailable",
        },
    }
    if not _is_prod:
        payload["version"] = _settings.service_version
        payload["environment"] = _settings.environment

    status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(content=payload, status_code=status_code)
