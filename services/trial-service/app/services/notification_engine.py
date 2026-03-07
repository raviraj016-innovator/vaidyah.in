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
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

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

        search_response = os_client.search_trials(search_request)
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
            await execute(
                """
                INSERT INTO trial_matches (patient_id, nct_id, matched_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (patient_id, nct_id) DO NOTHING
                """,
                patient_id,
                trial.nct_id,
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
    """Deliver notifications via push and/or email.

    In production, this would integrate with AWS SNS for push and
    AWS SES for email.  Currently logs the delivery intent.
    """
    if notify_via_push:
        try:
            if settings.sns_topic_arn:
                import boto3

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

    if notify_via_email:
        logger.info(
            "notification.email_queued",
            patient_id=patient_id,
            count=count,
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
