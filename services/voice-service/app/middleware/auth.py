"""
JWT Authentication Middleware for the Voice Processing service.

Validates Bearer tokens from the Vaidyah auth service (AWS Cognito-backed).
Skips authentication for health-check and documentation endpoints.
"""

from __future__ import annotations

import time
from typing import Optional

import structlog
import jwt
from jwt.exceptions import ExpiredSignatureError, PyJWTError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings

logger = structlog.get_logger("voice-service.auth")

# Paths that do not require authentication
_PUBLIC_PATHS: frozenset[str] = frozenset(
    {
        "/",
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
    }
)


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that validates JWT Bearer tokens.

    On success the decoded claims are attached to ``request.state.user``.
    On failure a 401 JSON response is returned immediately.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        settings = get_settings()

        # Skip auth when globally disabled (dev / test)
        if not settings.auth_enabled:
            request.state.user = _anonymous_user()
            return await call_next(request)

        # Skip auth for public / health-check paths
        if request.url.path in _PUBLIC_PATHS:
            return await call_next(request)

        # --- Extract token ---
        auth_header: Optional[str] = request.headers.get("authorization")
        if not auth_header:
            return _error_response(401, "Authorization header is required")

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return _error_response(
                401, "Authorization header must use Bearer scheme"
            )

        token = parts[1]

        # --- Verify token ---
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
                issuer=settings.jwt_issuer,
                audience="vaidyah",
                options={"require": ["sub", "exp", "iat"]},
            )
        except ExpiredSignatureError:
            return _error_response(401, "Token has expired")
        except PyJWTError as exc:
            error_msg = str(exc).lower()
            if "issuer" in error_msg:
                return _error_response(401, "Invalid token issuer")
            logger.warning("jwt_validation_failed", error=str(exc))
            return _error_response(401, "Token validation failed")

        # Attach decoded user to request state
        # Read role from custom:role (gateway format), role, or roles claims
        role = payload.get("custom:role") or payload.get("role", "patient")
        if not role:
            roles_list = payload.get("roles", [])
            role = roles_list[0] if roles_list else "patient"
        request.state.user = {
            "user_id": payload.get("sub"),
            "role": role,
            "permissions": payload.get("permissions", []),
            "issued_at": payload.get("iat"),
            "expires_at": payload.get("exp"),
        }

        logger.debug(
            "jwt_authenticated",
            user_id=payload.get("sub"),
            role=payload.get("role"),
            path=str(request.url.path),
        )

        return await call_next(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _anonymous_user() -> dict:
    """Return a placeholder user dict when auth is disabled."""
    return {
        "user_id": "anonymous",
        "role": "patient",
        "permissions": ["read"],
        "issued_at": int(time.time()),
        "expires_at": int(time.time()) + 86400,
    }


def _error_response(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": "authentication_error",
            "detail": detail,
        },
    )
