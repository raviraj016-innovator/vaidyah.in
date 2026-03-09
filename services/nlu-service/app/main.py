"""Vaidyah NLU Service -- FastAPI entry point."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.routers.nlu import router as nlu_router
from app.services.bedrock_client import BedrockClient, BedrockClientError
from app.services.comprehend_medical import ComprehendMedicalClient
from app.services.symptom_extractor import SymptomExtractor
from app.middleware.auth import AuthenticatedUser, get_current_user

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
# Generic /api/v1/generate endpoint (used by clinical-service)
# ---------------------------------------------------------------------------

_GENERATE_SYSTEM_PROMPTS: dict[str, str] = {
    "generate_soap_note": (
        "You are a clinical documentation assistant. Generate a structured SOAP note "
        "from the provided consultation data.\n\n"
        "Return ONLY a JSON object with keys: subjective, objective, assessment, plan.\n"
        "Each value should be a detailed object with relevant clinical sub-fields."
    ),
    "differential_diagnosis": (
        "You are a clinical decision support assistant. Generate differential diagnoses "
        "based on the provided symptoms, vitals, and patient demographics.\n\n"
        "Return ONLY a JSON object with keys:\n"
        '- "diagnoses": array of {condition_name, icd10_code, confidence, severity, supporting_evidence, recommended_tests}\n'
        '- "clinical_summary": string\n'
        '- "data_quality_notes": array of strings'
    ),
    "symptom_check": (
        "You are a clinical symptom assessment assistant. Analyze the provided symptoms "
        "and patient information to suggest possible conditions and red flags.\n\n"
        "Return ONLY a JSON object with keys:\n"
        '- "possible_conditions": array of {name, likelihood, description}\n'
        '- "red_flags_detected": array of strings\n'
        '- "recommendations": array of strings'
    ),
    "symptom_followup_questions": (
        "You are a clinical interview assistant. Generate follow-up questions for each "
        "symptom to help narrow down the diagnosis.\n\n"
        "Return ONLY a JSON object with key:\n"
        '- "followup_questions": array of {symptom: string, questions: array of strings}'
    ),
}


class GenerateRequest(BaseModel):
    prompt: str
    context: dict[str, Any] = Field(default_factory=dict)
    max_tokens: int = 4096
    temperature: float = 0.3


@app.post("/api/v1/generate", tags=["generate"])
async def generate(body: GenerateRequest, request: Request, _user: "AuthenticatedUser" = Depends(get_current_user)) -> Any:
    """Generic generation endpoint called by clinical-service."""
    bedrock: BedrockClient | None = request.app.state.bedrock_client
    if bedrock is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bedrock client is not available.",
        )

    system_prompt = _GENERATE_SYSTEM_PROMPTS.get(body.prompt)
    if not system_prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown prompt type: {body.prompt}",
        )

    import json as _json
    user_message = _json.dumps(body.context, default=str)

    try:
        result = await asyncio.to_thread(
            bedrock.invoke_and_parse_json,
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=body.max_tokens,
            temperature=body.temperature,
        )
        return result["data"]
    except (BedrockClientError, ValueError) as exc:
        logger.exception("generate_failed", prompt=body.prompt)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Generation failed for prompt '{body.prompt}': {exc}",
        ) from exc


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
        content={"error": "internal_server_error", "detail": "An unexpected error occurred."},
    )


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
