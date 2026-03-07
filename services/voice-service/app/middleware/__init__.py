"""Middleware package for the Vaidyah Voice Processing Service."""

from app.middleware.auth import JWTAuthMiddleware

__all__ = ["JWTAuthMiddleware"]
