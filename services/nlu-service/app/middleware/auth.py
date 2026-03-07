"""JWT authentication dependency for the NLU service.

Validates Bearer tokens when ``settings.auth_enabled`` is True.
In development mode with no token provided a synthetic dev user is returned.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import structlog
import jwt
from jwt.exceptions import PyJWTError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

logger = structlog.get_logger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    """Lightweight representation of the authenticated caller."""

    __slots__ = ("sub", "roles", "claims")

    def __init__(self, sub: str, roles: list[str], claims: dict[str, Any]) -> None:
        self.sub = sub
        self.roles = roles
        self.claims = claims

    @property
    def user_id(self) -> str:
        return self.sub

    def has_role(self, role: str) -> bool:
        return role in self.roles


def _decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT, returning its claims."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            audience="vaidyah",
            options={"require": ["sub", "exp", "iat", "iss", "aud"]},
        )
        return payload
    except PyJWTError as exc:
        logger.warning("jwt_decode_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """FastAPI dependency that extracts and validates the JWT bearer token.

    When ``settings.auth_enabled`` is False, authentication is skipped and an
    anonymous user with full permissions is returned.

    In development mode with auth enabled, if no token is provided a synthetic
    dev user is returned so that endpoints can be exercised without a real auth
    server.
    """
    settings = get_settings()
    # Skip auth entirely when globally disabled
    if not settings.auth_enabled:
        return AuthenticatedUser(
            sub="anonymous",
            roles=["patient"],
            claims={},
        )

    if credentials is None or not credentials.credentials:
        if settings.environment == "development" and os.environ.get("ALLOW_DEV_AUTH") == "true":
            logger.debug("dev_mode_no_token", path=request.url.path)
            return AuthenticatedUser(
                sub="dev-user-000",
                roles=["patient"],
                claims={},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(credentials.credentials)

    sub: Optional[str] = payload.get("sub")
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token does not contain a subject claim.",
        )

    roles: list[str] = payload.get("roles", [])
    return AuthenticatedUser(sub=sub, roles=roles, claims=payload)


__all__ = ["AuthenticatedUser", "get_current_user"]
