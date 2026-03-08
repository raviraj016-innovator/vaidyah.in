"""
Notification engine for the Trial Intelligence Service.

Manages scheduled tasks for:
- Periodic patient-trial re-matching based on active subscriptions.
- Sending notifications (push / email) when new matching trials are found.
- Periodic ETL sync from ClinicalTrials.gov.

Uses APScheduler for cron-like scheduling within the FastAPI process.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import boto3
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# IST offset (UTC+5:30) used for quiet-hours checks
_IST = timezone(timedelta(hours=5, minutes=30))

# ---------------------------------------------------------------------------
# Global scheduler instance -- imported by app.main
# ---------------------------------------------------------------------------
scheduler = AsyncIOScheduler(timezone="UTC")


def start_scheduler() -> None:
    """Configure and start the APScheduler with periodic jobs.

    Called once during application lifespan startup.
    """
    if scheduler.running:
        logger.warning("scheduler_already_running")
        return

    # Job 1: Periodic patient-trial matching
    scheduler.add_job(
        run_subscription_matching,
        trigger="interval",
        minutes=settings.match_check_interval_minutes,
        id="subscription_matching",
        name="Subscription-based trial matching",
        replace_existing=True,
        max_instances=1,
    )

    # Job 2: Periodic ETL sync from ClinicalTrials.gov
    scheduler.add_job(
        run_scheduled_etl_sync,
        trigger="interval",
        hours=settings.etl_sync_interval_hours,
        id="etl_sync",
        name="ClinicalTrials.gov ETL sync",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.start()
    logger.info(
        "notification_engine.scheduler_started",
        match_interval_min=settings.match_check_interval_minutes,
        etl_interval_hours=settings.etl_sync_interval_hours,
    )


# --------------------------------------------------------------------------- #
#  Scheduled job: Subscription-based matching
# --------------------------------------------------------------------------- #


async def run_subscription_matching() -> None:
    """Check all active subscriptions and generate notifications for new matches.

    Pipeline:
    1. Fetch all active subscriptions from the database.
    2. For each subscription, run the trial matcher.
    3. Compare results with existing matches.
    4. Create notifications for newly matched trials.
    """
    from app.services.db import execute, fetch_all

    logger.info("subscription_matching.started")

    try:
        # Fetch active subscriptions
        subscriptions = await fetch_all(
            """
            SELECT subscription_id, patient_id, conditions, phases,
                   statuses, location_country, radius_km, latitude,
                   longitude, notify_via_push, notify_via_email
            FROM subscriptions
            WHERE is_active = TRUE
            """
        )

        if not subscriptions:
            logger.info("subscription_matching.no_active_subscriptions")
            return

        logger.info(
            "subscription_matching.processing",
            subscription_count=len(subscriptions),
        )

        total_notifications = 0

        for sub in subscriptions:
            try:
                new_notifications = await _process_subscription(sub)
                total_notifications += new_notifications
            except Exception:
                logger.exception(
                    "subscription_matching.subscription_failed",
                    subscription_id=sub["subscription_id"],
                )

        logger.info(
            "subscription_matching.completed",
            subscriptions_processed=len(subscriptions),
            notifications_created=total_notifications,
        )

    except Exception:
        logger.exception("subscription_matching.failed")


async def _process_subscription(sub: Any) -> int:
    """Process a single subscription and create notifications for new matches.

    Returns the number of new notifications created.
    """
    from app.services.db import execute, fetch_all

    patient_id = sub.get("patient_id")
    if not patient_id:
        logger.warning("notification_check_missing_patient_id", sub=sub)
        return 0
    raw_conditions = sub.get("conditions", "[]")
    conditions = raw_conditions if isinstance(raw_conditions, list) else json.loads(raw_conditions or "[]")

    # Get existing match NCT IDs for this patient to avoid duplicates
    existing_rows = await fetch_all(
        """
        SELECT DISTINCT nct_id FROM trial_matches
        WHERE patient_id = $1
        """,
        patient_id,
    )
    existing_nct_ids = {row["nct_id"] for row in existing_rows}

    # Search for matching trials using OpenSearch
    try:
        from app.services.opensearch_client import get_opensearch_client

        os_client = get_opensearch_client()

        from app.models import TrialSearchRequest

        raw_phases = sub.get("phases", "[]")
        phases_raw = raw_phases if isinstance(raw_phases, list) else json.loads(raw_phases or "[]")
        raw_statuses = sub.get("statuses", "[]")
        statuses_raw = raw_statuses if isinstance(raw_statuses, list) else json.loads(raw_statuses or "[]")

        from app.models import TrialPhase, TrialStatus
        phases_enums = [TrialPhase(p) if isinstance(p, str) else p for p in phases_raw] if phases_raw else None
        statuses_enums = [TrialStatus(s) if isinstance(s, str) else s for s in statuses_raw] if statuses_raw else None

        search_request = TrialSearchRequest(
            conditions=conditions,
            phases=phases_enums or [],
            statuses=statuses_enums or [],
            location_country=sub.get("location_country"),
            latitude=sub.get("latitude"),
            longitude=sub.get("longitude"),
            radius_km=sub.get("radius_km") or 100.0,
            page_size=50,
        )

        search_response = await os_client.search_trials(search_request)
    except Exception:
        logger.warning(
            "subscription_matching.search_failed",
            patient_id=patient_id,
            exc_info=True,
        )
        return 0

    # Find new trials not already matched
    new_count = 0
    for trial in search_response.trials:
        if trial.nct_id in existing_nct_ids:
            continue

        # Create notification
        notification_id = f"notif_{uuid.uuid4().hex[:16]}"
        try:
            await execute(
                """
                INSERT INTO notifications
                    (notification_id, patient_id, nct_id, notification_type,
                     title, message, metadata, is_read, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, FALSE, NOW())
                """,
                notification_id,
                patient_id,
                trial.nct_id,
                "new_match",
                f"New trial match: {trial.brief_title or trial.title}",
                (
                    f"A new clinical trial matching your criteria has been found: "
                    f"{trial.title}. Status: {trial.overall_status.value if hasattr(trial.overall_status, 'value') else (trial.overall_status or 'Unknown')}."
                ),
                json.dumps({
                    "trial_title": trial.title,
                    "conditions": trial.conditions,
                    "subscription_id": sub["subscription_id"],
                }),
            )
            # Record the match to prevent duplicate notifications
            match_id = f"match_{uuid.uuid4().hex[:16]}"
            await execute(
                """
                INSERT INTO trial_matches (match_id, patient_id, nct_id, composite_score, scores, status, created_at)
                VALUES ($1, $2, $3, $4, '{}'::jsonb, 'pending', NOW())
                ON CONFLICT (patient_id, nct_id) DO NOTHING
                """,
                match_id,
                patient_id,
                trial.nct_id,
                0.0,
            )
            new_count += 1

            logger.debug(
                "subscription_matching.notification_created",
                patient_id=patient_id,
                nct_id=trial.nct_id,
                notification_id=notification_id,
            )
        except Exception:
            logger.warning(
                "subscription_matching.notification_insert_failed",
                patient_id=patient_id,
                nct_id=trial.nct_id,
                exc_info=True,
            )

    if new_count > 0:
        # Send push / email notifications if configured
        await _deliver_notifications(
            patient_id=patient_id,
            count=new_count,
            notify_via_push=sub["notify_via_push"],
            notify_via_email=sub["notify_via_email"],
        )

    return new_count


async def _deliver_notifications(
    patient_id: str,
    count: int,
    notify_via_push: bool,
    notify_via_email: bool,
) -> None:
    """Deliver notifications via push (SNS) and/or email (SES).

    Respects quiet hours (IST) and per-patient daily frequency limits.
    During quiet hours, notifications are queued for later delivery
    rather than sent immediately.
    """
    # ---- Quiet-hours gate ----
    if _is_quiet_hours():
        logger.info(
            "notification.deferred_quiet_hours",
            patient_id=patient_id,
            count=count,
        )
        await _queue_for_later(patient_id, count, notify_via_push, notify_via_email)
        return

    # ---- Frequency-limit gate ----
    if not await _check_frequency_limit(patient_id):
        return

    # ---- Push delivery (SNS) ----
    if notify_via_push:
        try:
            if settings.sns_topic_arn:
                sns_client = boto3.client(
                    "sns", region_name=settings.sns_region
                )
                await asyncio.to_thread(
                    sns_client.publish,
                    TopicArn=settings.sns_topic_arn,
                    Message=json.dumps({
                        "patient_id": patient_id,
                        "type": "new_trial_matches",
                        "count": count,
                    }),
                    MessageAttributes={
                        "patient_id": {
                            "DataType": "String",
                            "StringValue": patient_id,
                        },
                    },
                )
                logger.info(
                    "notification.push_sent",
                    patient_id=patient_id,
                    count=count,
                )
            else:
                logger.debug(
                    "notification.push_skipped_no_sns",
                    patient_id=patient_id,
                    count=count,
                )
        except Exception:
            logger.warning(
                "notification.push_failed",
                patient_id=patient_id,
                exc_info=True,
            )

    # ---- Email delivery (SES) ----
    if notify_via_email:
        try:
            if not settings.ses_sender_email:
                logger.debug(
                    "notification.email_skipped_no_ses_sender",
                    patient_id=patient_id,
                    count=count,
                )
                return

            patient_email = await _get_patient_email(patient_id)
            if not patient_email:
                logger.warning(
                    "notification.email_skipped_no_address",
                    patient_id=patient_id,
                )
                return

            html_body, text_body = _build_email_body(count, patient_id)
            ses_client = boto3.client("ses", region_name=settings.ses_region)
            await asyncio.to_thread(
                ses_client.send_email,
                Source=settings.ses_sender_email,
                Destination={"ToAddresses": [patient_email]},
                Message={
                    "Subject": {
                        "Data": f"Vaidyah: {count} new trial matches found",
                    },
                    "Body": {
                        "Html": {"Data": html_body},
                        "Text": {"Data": text_body},
                    },
                },
            )
            logger.info(
                "notification.email_sent",
                patient_id=patient_id,
                recipient=patient_email,
                count=count,
            )
        except Exception:
            logger.warning(
                "notification.email_failed",
                patient_id=patient_id,
                exc_info=True,
            )


# --------------------------------------------------------------------------- #
#  Notification helpers
# --------------------------------------------------------------------------- #


def _is_quiet_hours() -> bool:
    """Return True if the current time in IST falls within the configured quiet hours.

    Quiet hours span from ``notification_quiet_hours_start`` to
    ``notification_quiet_hours_end`` (e.g. 22:00 -- 07:00 IST).
    """
    now_ist = datetime.now(_IST)
    hour = now_ist.hour
    start = settings.notification_quiet_hours_start
    end = settings.notification_quiet_hours_end

    if start > end:
        # Overnight window, e.g. 22 -> 7
        return hour >= start or hour < end
    else:
        # Same-day window (unusual, but supported)
        return start <= hour < end


async def _check_frequency_limit(patient_id: str) -> bool:
    """Check whether the patient has already received the maximum notifications today.

    Returns ``True`` if delivery may proceed, ``False`` if the daily cap
    has been reached.
    """
    from app.services.db import fetch_one

    today_start_ist = datetime.now(_IST).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    # Convert IST midnight to UTC for the DB query
    today_start_utc = today_start_ist.astimezone(timezone.utc)

    row = await fetch_one(
        """
        SELECT COUNT(*) AS cnt
        FROM notifications
        WHERE patient_id = $1
          AND created_at >= $2
        """,
        patient_id,
        today_start_utc,
    )

    sent_today = row["cnt"] if row else 0

    if sent_today >= settings.notification_max_per_day:
        logger.warning(
            "notification.frequency_limit_reached",
            patient_id=patient_id,
            sent_today=sent_today,
            max_per_day=settings.notification_max_per_day,
        )
        return False

    return True


async def _get_patient_email(patient_id: str) -> Optional[str]:
    """Fetch the patient's email address from the database.

    Returns the email string, or ``None`` if not found.
    """
    from app.services.db import fetch_one

    row = await fetch_one(
        """
        SELECT email
        FROM patients
        WHERE patient_id = $1
        """,
        patient_id,
    )
    if row and row.get("email"):
        return row["email"]

    logger.debug(
        "notification.patient_email_not_found",
        patient_id=patient_id,
    )
    return None


def _build_email_body(count: int, patient_id: str) -> tuple[str, str]:
    """Build HTML and plain-text bodies for the trial-match notification email.

    Returns a ``(html_body, text_body)`` tuple.
    """
    app_url = "https://app.vaidyah.health"
    matches_url = f"{app_url}/patient/trials"
    unsubscribe_url = f"{app_url}/patient/notifications?unsubscribe=true"

    trial_word = "trial" if count == 1 else "trials"

    html_body = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a73e8; padding: 24px; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">Vaidyah</h1>
    <p style="color: #e0e0e0; margin: 4px 0 0; font-size: 14px;">Clinical Trial Intelligence</p>
  </div>
  <div style="padding: 24px;">
    <h2 style="color: #1a73e8;">New Trial Matches Found</h2>
    <p>We found <strong>{count}</strong> new clinical {trial_word} matching your health profile and preferences.</p>
    <p>Review your matches to see eligibility details, trial locations, and next steps.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{matches_url}"
         style="background: #1a73e8; color: #fff; padding: 12px 32px; text-decoration: none;
                border-radius: 6px; font-weight: bold; display: inline-block;">
        View My Matches
      </a>
    </div>
  </div>
  <div style="border-top: 1px solid #e0e0e0; padding: 16px 24px; font-size: 12px; color: #999;">
    <p>You are receiving this email because you subscribed to trial-match notifications on Vaidyah.</p>
    <p><a href="{unsubscribe_url}" style="color: #999;">Unsubscribe</a> from these notifications.</p>
  </div>
</body>
</html>"""

    text_body = (
        f"Vaidyah - Clinical Trial Intelligence\n"
        f"{'=' * 40}\n\n"
        f"New Trial Matches Found\n\n"
        f"We found {count} new clinical {trial_word} matching your health profile "
        f"and preferences.\n\n"
        f"Review your matches: {matches_url}\n\n"
        f"---\n"
        f"Unsubscribe: {unsubscribe_url}\n"
    )

    return html_body, text_body


async def _queue_for_later(
    patient_id: str,
    count: int,
    notify_via_push: bool,
    notify_via_email: bool,
) -> None:
    """Queue a notification for delivery after quiet hours end.

    Stores the pending delivery in the ``pending_deliveries`` table so
    it can be picked up by the next scheduler run outside quiet hours.
    If the table does not exist, falls back to logging only.
    """
    from app.services.db import execute

    delivery_id = f"dlvr_{uuid.uuid4().hex[:16]}"
    payload = json.dumps({
        "patient_id": patient_id,
        "count": count,
        "notify_via_push": notify_via_push,
        "notify_via_email": notify_via_email,
    })

    try:
        await execute(
            """
            INSERT INTO pending_deliveries
                (delivery_id, patient_id, payload, created_at)
            VALUES ($1, $2, $3::jsonb, NOW())
            """,
            delivery_id,
            patient_id,
            payload,
        )
        logger.info(
            "notification.queued_for_later",
            delivery_id=delivery_id,
            patient_id=patient_id,
        )
    except Exception:
        # Table may not exist yet -- log so it is not silently lost
        logger.warning(
            "notification.queue_failed_falling_back_to_log",
            patient_id=patient_id,
            count=count,
            exc_info=True,
        )


# --------------------------------------------------------------------------- #
#  Scheduled job: ETL sync
# --------------------------------------------------------------------------- #


async def run_scheduled_etl_sync() -> None:
    """Periodic ETL sync from ClinicalTrials.gov.

    Runs an incremental sync (fetching only recently updated trials).
    """
    logger.info("scheduled_etl_sync.started")

    try:
        from app.routers.ingest import _run_etl_sync

        run_id = f"etl_scheduled_{uuid.uuid4().hex[:12]}"

        from app.services.db import execute

        await execute(
            """
            INSERT INTO etl_runs (run_id, state, started_at)
            VALUES ($1, $2, NOW())
            """,
            run_id,
            "running",
        )

        await _run_etl_sync(
            run_id=run_id,
            conditions=[],
            full_refresh=False,
            max_records=None,
        )

        logger.info("scheduled_etl_sync.completed", run_id=run_id)

    except Exception:
        logger.exception("scheduled_etl_sync.failed")
