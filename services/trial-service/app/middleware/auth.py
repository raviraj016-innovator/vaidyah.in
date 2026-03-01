"""JWT authentication middleware and dependency."""

from __future__ import annotations

from typing import Any, Optional

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import Settings, get_settings

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


def _decode_token(token: str, settings: Settings) -> dict[str, Any]:
    """Decode and validate a JWT, returning its claims."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
        return payload
    except JWTError as exc:
        logger.warning("jwt_decode_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    """FastAPI dependency that extracts and validates the JWT bearer token.

    In **development** mode (``settings.environment == "development"``), if no
    token is provided a synthetic dev user is returned so that endpoints can be
    exercised without a real auth server.
    """
    if credentials is None or not credentials.credentials:
        if settings.environment == "development":
            logger.debug("dev_mode_no_token", path=request.url.path)
            return AuthenticatedUser(
                sub="dev-user-000",
                roles=["patient", "admin"],
                claims={},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(credentials.credentials, settings)

    sub: Optional[str] = payload.get("sub")
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token does not contain a subject claim.",
        )

    roles: list[str] = payload.get("roles", [])
    return AuthenticatedUser(sub=sub, roles=roles, claims=payload)


async def require_admin(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Dependency that enforces an ``admin`` role."""
    if not user.has_role("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required.",
        )
    return user


# Re-export for convenience
__all__ = [
    "AuthenticatedUser",
    "get_current_user",
    "require_admin",
]
