"""Notifications router -- subscription and notification management."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.middleware.auth import AuthenticatedUser, get_current_user
from app.models import (
    NotificationType,
    Subscription,
    SubscriptionRequest,
    TrialNotification,
    TrialPhase,
    TrialStatus,
)
from app.services.db import execute, fetch_all, fetch_one

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/notifications")


# --------------------------------------------------------------------------- #
#  Request / response models local to this router
# --------------------------------------------------------------------------- #


class NotificationPreferencesRequest(BaseModel):
    """Update notification delivery preferences for a patient."""
    patient_id: str
    notify_via_push: bool = True
    notify_via_email: bool = False
    quiet_hours_start: Optional[str] = Field(
        None, description="Start of quiet hours (HH:MM, 24h format)"
    )
    quiet_hours_end: Optional[str] = Field(
        None, description="End of quiet hours (HH:MM, 24h format)"
    )
    frequency: Literal["immediate", "daily_digest", "weekly_digest"] = Field(
        "immediate",
        description="Delivery frequency: immediate | daily_digest | weekly_digest",
    )

    @field_validator("quiet_hours_start", "quiet_hours_end")
    @classmethod
    def validate_quiet_hours(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
            raise ValueError("Must be in HH:MM 24-hour format (e.g. '22:00')")
        return v


class NotificationPreferencesResponse(BaseModel):
    patient_id: str
    notify_via_push: bool
    notify_via_email: bool
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    frequency: str
    updated_at: datetime


class SubscriptionResponse(BaseModel):
    subscription_id: str
    message: str


class UnsubscribeResponse(BaseModel):
    subscription_id: str
    message: str


# --------------------------------------------------------------------------- #
#  POST /notifications/subscribe
# --------------------------------------------------------------------------- #


@router.post(
    "/subscribe",
    response_model=SubscriptionResponse,
    summary="Subscribe to trial updates",
    description=(
        "Subscribe a patient to receive notifications when new trials "
        "matching their criteria are published or updated."
    ),
)
async def subscribe(body: SubscriptionRequest, _user: AuthenticatedUser = Depends(get_current_user)) -> SubscriptionResponse:
    # Ownership check: patients can only subscribe themselves
    if _user.sub != body.patient_id and not (_user.has_role("admin") or _user.has_role("doctor")):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to create subscriptions for this patient.",
        )

    subscription_id = f"sub_{uuid.uuid4().hex[:16]}"

    logger.info(
        "subscribe",
        patient_id=body.patient_id,
        conditions=body.conditions,
        subscription_id=subscription_id,
    )

    await execute(
        """
        INSERT INTO subscriptions
            (subscription_id, patient_id, conditions, phases, statuses,
             location_country, radius_km, latitude, longitude,
             notify_via_push, notify_via_email, is_active, created_at)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb,
                $6, $7, $8, $9,
                $10, $11, TRUE, NOW())
        """,
        subscription_id,
        body.patient_id,
        json.dumps(body.conditions),
        json.dumps([p.value for p in body.phases]),
        json.dumps([s.value for s in body.statuses]),
        body.location_country,
        body.radius_km,
        body.latitude,
        body.longitude,
        body.notify_via_push,
        body.notify_via_email,
    )

    return SubscriptionResponse(
        subscription_id=subscription_id,
        message="Successfully subscribed to trial updates.",
    )


# --------------------------------------------------------------------------- #
#  DELETE /notifications/unsubscribe/{subscription_id}
# --------------------------------------------------------------------------- #


@router.delete(
    "/unsubscribe/{subscription_id}",
    response_model=UnsubscribeResponse,
    summary="Unsubscribe from trial updates",
    description="Deactivate an existing subscription so that no further notifications are sent.",
)
async def unsubscribe(subscription_id: str, _user: AuthenticatedUser = Depends(get_current_user)) -> UnsubscribeResponse:
    logger.info("unsubscribe", subscription_id=subscription_id)

    row = await fetch_one(
        "SELECT subscription_id, patient_id, is_active FROM subscriptions WHERE subscription_id = $1",
        subscription_id,
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Subscription '{subscription_id}' not found.",
        )

    # Ownership check: patients can only unsubscribe their own subscriptions
    if _user.sub != row["patient_id"] and not (_user.has_role("admin") or _user.has_role("doctor")):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to modify this subscription.",
        )

    if not row["is_active"]:
        return UnsubscribeResponse(
            subscription_id=subscription_id,
            message="Subscription was already inactive.",
        )

    await execute(
        "UPDATE subscriptions SET is_active = FALSE WHERE subscription_id = $1",
        subscription_id,
    )

    return UnsubscribeResponse(
        subscription_id=subscription_id,
        message="Successfully unsubscribed.",
    )


# --------------------------------------------------------------------------- #
#  GET /notifications/{patient_id}
# --------------------------------------------------------------------------- #


@router.get(
    "/{patient_id}",
    response_model=list[TrialNotification],
    summary="Get notifications for a patient",
    description="Retrieve all notifications for a patient, ordered by most recent first.",
)
async def get_patient_notifications(
    patient_id: str,
    unread_only: bool = Query(False, description="Return only unread notifications"),
    notification_type: Optional[NotificationType] = Query(
        None, description="Filter by notification type"
    ),
    limit: int = Query(50, ge=1, le=200, description="Maximum notifications to return"),
    offset: int = Query(0, ge=0, le=10000, description="Pagination offset"),
    _user: AuthenticatedUser = Depends(get_current_user),
) -> list[TrialNotification]:
    # Ownership check: patients can only access their own notifications
    if _user.sub != patient_id and not (_user.has_role("admin") or _user.has_role("doctor")):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access notifications for this patient.",
        )

    logger.info(
        "get_notifications",
        patient_id=patient_id,
        unread_only=unread_only,
    )

    conditions: list[str] = ["patient_id = $1"]
    params: list = [patient_id]
    idx = 2

    if unread_only:
        conditions.append("is_read = FALSE")

    if notification_type is not None:
        conditions.append(f"notification_type = ${idx}")
        params.append(notification_type.value)
        idx += 1

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT notification_id, patient_id, nct_id, notification_type,
               title, message, metadata, is_read, created_at, acknowledged_at
        FROM notifications
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([limit, offset])

    rows = await fetch_all(query, *params)

    results: list[TrialNotification] = []
    for row in rows:
        try:
            metadata = row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}")
        except (json.JSONDecodeError, TypeError):
            logger.warning("invalid_metadata_json", notification_id=row.get("notification_id"))
            metadata = {}
        results.append(TrialNotification(
            notification_id=row["notification_id"],
            patient_id=row["patient_id"],
            nct_id=row["nct_id"],
            trial_title=metadata.get("trial_title", ""),
            notification_type=NotificationType(row["notification_type"]),
            message=row["message"],
            created_at=row["created_at"],
            acknowledged_at=row["acknowledged_at"],
            is_read=row["is_read"],
            metadata=metadata,
        ))

    return results


# --------------------------------------------------------------------------- #
#  POST /notifications/preferences
# --------------------------------------------------------------------------- #


@router.post(
    "/preferences",
    response_model=NotificationPreferencesResponse,
    summary="Update notification preferences",
    description=(
        "Set or update a patient's notification delivery preferences "
        "including push/email toggles, quiet hours, and digest frequency."
    ),
)
async def update_notification_preferences(
    body: NotificationPreferencesRequest,
    _user: AuthenticatedUser = Depends(get_current_user),
) -> NotificationPreferencesResponse:
    # Ownership check: patients can only update their own preferences
    if _user.sub != body.patient_id and not (_user.has_role("admin") or _user.has_role("doctor")):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to update preferences for this patient.",
        )

    logger.info(
        "update_preferences",
        patient_id=body.patient_id,
        push=body.notify_via_push,
        email=body.notify_via_email,
        frequency=body.frequency,
    )

    # Upsert preferences by updating all active subscriptions for the patient
    await execute(
        """
        UPDATE subscriptions
        SET notify_via_push    = $2,
            notify_via_email   = $3,
            quiet_hours_start  = $4,
            quiet_hours_end    = $5,
            frequency          = $6
        WHERE patient_id = $1
          AND is_active = TRUE
        """,
        body.patient_id,
        body.notify_via_push,
        body.notify_via_email,
        body.quiet_hours_start,
        body.quiet_hours_end,
        body.frequency,
    )

    now = datetime.now(timezone.utc)

    return NotificationPreferencesResponse(
        patient_id=body.patient_id,
        notify_via_push=body.notify_via_push,
        notify_via_email=body.notify_via_email,
        quiet_hours_start=body.quiet_hours_start,
        quiet_hours_end=body.quiet_hours_end,
        frequency=body.frequency,
        updated_at=now,
    )
