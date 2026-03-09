"""PostgreSQL async connection pool and query helpers."""

from __future__ import annotations

from typing import Any, Optional

import asyncpg
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)

_pool: Optional[asyncpg.Pool] = None


def _dsn() -> str:
    """Convert the SQLAlchemy-style URL to a plain DSN for asyncpg."""
    url = get_settings().database_url
    # asyncpg does not understand the ``+asyncpg`` driver suffix.
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def init_db_pool() -> asyncpg.Pool:
    """Create the global connection pool.  Idempotent."""
    global _pool
    if _pool is not None:
        return _pool

    settings = get_settings()
    ssl_context = "require" if settings.environment in ("production", "prod", "staging") else None
    try:
        _pool = await asyncpg.create_pool(
            dsn=_dsn(),
            min_size=settings.database_pool_min,
            max_size=settings.database_pool_max,
            command_timeout=30,
            ssl=ssl_context,
        )
        logger.info("pg_pool_created", min=settings.database_pool_min, max=settings.database_pool_max)
    except Exception:
        logger.exception("pg_pool_creation_failed")
        raise
    return _pool


async def close_db_pool() -> None:
    """Gracefully close the pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("pg_pool_closed")


def get_pool() -> asyncpg.Pool:
    """Return the active pool, raising if not yet initialised."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialised. Call init_db_pool() first.")
    return _pool


# --------------------------------------------------------------------------- #
#  Query helpers
# --------------------------------------------------------------------------- #

async def fetch_one(query: str, *args: Any) -> Optional[asyncpg.Record]:
    """Execute *query* and return the first row, or ``None``."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetch_all(query: str, *args: Any) -> list[asyncpg.Record]:
    """Execute *query* and return all rows."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetch_val(query: str, *args: Any) -> Any:
    """Execute *query* and return a single scalar value."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args: Any) -> str:
    """Execute *query* (INSERT / UPDATE / DELETE) and return the status string."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def execute_many(query: str, args_list: list[tuple]) -> None:
    """Execute *query* for each set of parameters in *args_list* inside a transaction."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.executemany(query, args_list)


async def execute_in_transaction(queries: list[tuple[str, tuple]]) -> None:
    """Execute a list of ``(query, args)`` pairs inside a single transaction."""
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for query, args in queries:
                await conn.execute(query, *args)


# --------------------------------------------------------------------------- #
#  Schema bootstrap (called once on first startup)
# --------------------------------------------------------------------------- #

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS trials (
    nct_id          TEXT PRIMARY KEY,
    data            JSONB NOT NULL,
    search_vector   TSVECTOR,
    indexed_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trials_search ON trials USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_trials_data_status ON trials ((data->>'overall_status'));
CREATE INDEX IF NOT EXISTS idx_trials_data_phase ON trials ((data->>'phase'));
CREATE INDEX IF NOT EXISTS idx_trials_data_sponsor ON trials ((data->>'sponsor'));
CREATE INDEX IF NOT EXISTS idx_trials_updated ON trials (updated_at DESC);

CREATE TABLE IF NOT EXISTS trial_matches (
    match_id        TEXT PRIMARY KEY,
    patient_id      TEXT NOT NULL,
    nct_id          TEXT NOT NULL,
    composite_score REAL NOT NULL,
    scores          JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trial_matches_patient ON trial_matches (patient_id);
CREATE INDEX IF NOT EXISTS idx_trial_matches_nct     ON trial_matches (nct_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_matches_patient_nct ON trial_matches (patient_id, nct_id);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT PRIMARY KEY,
    patient_id      TEXT NOT NULL,
    nct_id          TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_patient ON notifications (patient_id, is_read);

CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id TEXT PRIMARY KEY,
    patient_id      TEXT NOT NULL,
    conditions      JSONB NOT NULL DEFAULT '[]',
    phases          JSONB NOT NULL DEFAULT '[]',
    statuses        JSONB NOT NULL DEFAULT '[]',
    location_country TEXT,
    radius_km       REAL,
    latitude        REAL,
    longitude       REAL,
    notify_via_push BOOLEAN DEFAULT TRUE,
    notify_via_email BOOLEAN DEFAULT FALSE,
    quiet_hours_start TEXT,
    quiet_hours_end   TEXT,
    frequency       TEXT NOT NULL DEFAULT 'immediate',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_patient ON subscriptions (patient_id, is_active);

CREATE TABLE IF NOT EXISTS pending_deliveries (
    delivery_id TEXT PRIMARY KEY,
    patient_id  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS etl_runs (
    run_id          TEXT PRIMARY KEY,
    state           TEXT NOT NULL DEFAULT 'idle',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           TEXT,
    trials_fetched  INT DEFAULT 0,
    trials_indexed  INT DEFAULT 0,
    trials_failed   INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trial_summaries (
    nct_id          TEXT PRIMARY KEY,
    plain_summary   TEXT NOT NULL,
    plain_summary_hi TEXT NOT NULL,
    key_points      JSONB NOT NULL DEFAULT '[]',
    risk_benefit    TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'fallback',
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);
"""


async def ensure_schema() -> None:
    """Create tables and indexes if they do not already exist."""
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(_SCHEMA_SQL)
    logger.info("database_schema_ensured")
