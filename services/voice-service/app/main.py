"""
Vaidyah Voice Processing Service - FastAPI Application Entry Point.

Provides REST and WebSocket endpoints for:
- Speech-to-text transcription (AWS Transcribe Medical)
- Text-to-speech synthesis (Amazon Polly)
- Prosody / emotional analysis
- Language detection for Indian languages
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __service_name__, __version__
from app.config import get_settings
from app.middleware.auth import JWTAuthMiddleware
from app.models import ErrorResponse, HealthResponse
from app.routers import language, prosody, storage, transcribe, tts

# ---------------------------------------------------------------------------
# Structured Logging Setup
# ---------------------------------------------------------------------------

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        structlog.get_config().get("min_level", 0)
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__service_name__)

# ---------------------------------------------------------------------------
# Shared state for service clients (populated during lifespan)
# ---------------------------------------------------------------------------

_shared_state: dict = {}


def get_shared_state() -> dict:
    """Accessor used by routers to obtain shared AWS clients."""
    return _shared_state


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup / shutdown lifecycle hook."""
    settings = get_settings()
    logger.info(
        "voice_service.starting",
        environment=settings.environment,
        version=settings.service_version,
    )

    # -- Startup: warm-up AWS clients ---
    try:
        import boto3

        boto_kwargs: dict = {"region_name": settings.aws_region}
        if settings.aws_access_key_id:
            boto_kwargs["aws_access_key_id"] = settings.aws_access_key_id
            boto_kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        if settings.aws_session_token:
            boto_kwargs["aws_session_token"] = settings.aws_session_token

        _shared_state["boto_session"] = boto3.Session(**boto_kwargs)
        _shared_state["polly_client"] = _shared_state["boto_session"].client("polly")
        _shared_state["transcribe_client"] = _shared_state["boto_session"].client(
            "transcribe"
        )
        _shared_state["s3_client"] = _shared_state["boto_session"].client("s3")

        if settings.sagemaker_prosody_endpoint:
            _shared_state["sagemaker_client"] = _shared_state["boto_session"].client(
                "sagemaker-runtime"
            )
        logger.info("voice_service.aws_clients_initialized")
    except Exception:
        logger.warning(
            "voice_service.aws_clients_init_failed",
            exc_info=True,
        )

    logger.info("voice_service.started")
    yield

    # -- Shutdown: clean-up ---
    logger.info("voice_service.shutting_down")
    _shared_state.clear()
    logger.info("voice_service.stopped")


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

settings = get_settings()
_is_prod = settings.is_production

app = FastAPI(
    title="Vaidyah Voice Processing Service",
    description=(
        "Provides speech-to-text, text-to-speech, prosody analysis, "
        "and language detection for the Vaidyah healthcare platform."
    ),
    version=__version__,
    lifespan=lifespan,
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
)

# -- CORS ---
_filtered_origins = [o for o in settings.cors_origins if "*" not in o]
if not _filtered_origins:
    _filtered_origins = ["http://localhost:3000", "http://localhost:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_filtered_origins,
    allow_origin_regex=r"https://(app|admin|api|nurse)\.vaidyah\.health",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

# -- JWT Auth Middleware ---
app.add_middleware(JWTAuthMiddleware)

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

app.include_router(
    transcribe.router,
    prefix="/api/v1/voice",
    tags=["Transcription"],
)
app.include_router(
    tts.router,
    prefix="/api/v1/voice",
    tags=["Text-to-Speech"],
)
app.include_router(
    prosody.router,
    prefix="/api/v1/voice",
    tags=["Prosody Analysis"],
)
app.include_router(
    language.router,
    prefix="/api/v1/voice",
    tags=["Language Detection"],
)
app.include_router(
    storage.router,
    prefix="/api/v1/voice",
    tags=["Recording Storage"],
)

# ---------------------------------------------------------------------------
# Health & Root
# ---------------------------------------------------------------------------


@app.get("/", include_in_schema=False)
async def root() -> dict:
    result: dict = {
        "service": __service_name__,
        "status": "running",
    }
    if not _is_prod:
        result["version"] = __version__
        result["docs"] = "/docs"
    return result


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """Comprehensive health check including downstream dependencies."""
    checks: dict = {}

    # AWS connectivity
    try:
        if "polly_client" in _shared_state:
            await asyncio.to_thread(
                _shared_state["polly_client"].describe_voices, MaxResults=1,
            )
            checks["aws_polly"] = "healthy"
        else:
            checks["aws_polly"] = "not_configured"
    except Exception as exc:
        logger.error("health_check.polly_failed", error=str(exc))
        checks["aws_polly"] = "unhealthy"

    try:
        if "s3_client" in _shared_state:
            await asyncio.to_thread(
                _shared_state["s3_client"].head_bucket,
                Bucket=settings.s3_audio_bucket,
            )
            checks["aws_s3"] = "healthy"
        else:
            checks["aws_s3"] = "not_configured"
    except Exception as exc:
        logger.error("health_check.s3_failed", error=str(exc))
        checks["aws_s3"] = "unhealthy"

    overall = "healthy" if all(
        v in ("healthy", "not_configured") for v in checks.values()
    ) else "degraded"

    return HealthResponse(
        status=overall,
        version=__version__,
        checks=checks,
    )


# ---------------------------------------------------------------------------
# Global Exception Handler
# ---------------------------------------------------------------------------


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="internal_server_error",
            detail="An unexpected error occurred. Please try again later.",
        ).model_dump(mode="json"),
    )
