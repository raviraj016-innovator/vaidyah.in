"""PostgreSQL full-text search for clinical trials.

Replaces OpenSearch with PostgreSQL tsvector/tsquery for budget deployment.
Maintains the same public API surface so routers need minimal changes.
"""

from __future__ import annotations

import json
import time
from functools import lru_cache
from typing import Any, Optional

import structlog

from app.models import (
    ClinicalTrial,
    FacetBucket,
    SearchFacets,
    TrialSearchRequest,
    TrialSearchResponse,
    TrialSummary,
)
from app.services.db import execute, fetch_all, fetch_one, fetch_val, get_pool

logger = structlog.get_logger(__name__)

# Medical synonyms for search expansion (same terms as the old OpenSearch config)
MEDICAL_SYNONYMS: dict[str, list[str]] = {
    "heart attack": ["myocardial infarction", "MI"],
    "high blood pressure": ["hypertension", "HTN"],
    "diabetes": ["diabetes mellitus", "DM"],
    "cancer": ["carcinoma", "malignant neoplasm"],
    "stroke": ["cerebrovascular accident", "CVA"],
    "kidney disease": ["renal disease", "nephropathy"],
    "liver disease": ["hepatic disease", "hepatopathy"],
    "COPD": ["chronic obstructive pulmonary disease"],
    "TB": ["tuberculosis"],
    "HIV": ["human immunodeficiency virus"],
    "AIDS": ["acquired immunodeficiency syndrome"],
    "depression": ["major depressive disorder", "MDD"],
    "anxiety": ["generalized anxiety disorder", "GAD"],
}


def _expand_query(query: str) -> str:
    """Expand query with medical synonyms for better recall."""
    terms = [query]
    q_lower = query.lower()
    for term, synonyms in MEDICAL_SYNONYMS.items():
        if term.lower() in q_lower:
            terms.extend(synonyms)
        for syn in synonyms:
            if syn.lower() in q_lower:
                terms.append(term)
                break
    return " OR ".join(terms)


def _build_search_vector_expr() -> str:
    """SQL expression to build a tsvector from JSONB trial data."""
    return """
        setweight(to_tsvector('english', coalesce(data->>'title', '')), 'A') ||
        setweight(to_tsvector('english', coalesce(data->>'brief_title', '')), 'A') ||
        setweight(to_tsvector('english', coalesce(
            (SELECT string_agg(c, ' ') FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(data->'conditions') = 'array' THEN data->'conditions' ELSE '[]'::jsonb END
            ) AS c), '')), 'B') ||
        setweight(to_tsvector('english', coalesce(data->>'brief_summary', '')), 'C') ||
        setweight(to_tsvector('english', coalesce(data->>'detailed_description', '')), 'D') ||
        setweight(to_tsvector('english', coalesce(data->>'sponsor', '')), 'D')
    """


class TrialPgSearchClient:
    """PostgreSQL full-text search for clinical trials."""

    async def ensure_index(self) -> None:
        """Update search vectors for any rows that are missing them."""
        expr = _build_search_vector_expr()
        await execute(f"""
            UPDATE trials SET search_vector = ({expr})
            WHERE search_vector IS NULL
        """)
        count = await fetch_val("SELECT count(*) FROM trials WHERE search_vector IS NOT NULL")
        logger.info("pg_search_vectors_ready", indexed_count=count)

    async def index_trial(self, nct_id: str, trial_data: dict[str, Any]) -> None:
        """Insert or update a trial and compute its search vector."""
        data_json = json.dumps(trial_data, default=str)
        expr = _build_search_vector_expr()
        await execute(f"""
            INSERT INTO trials (nct_id, data, search_vector, indexed_at, updated_at)
            VALUES ($1, $2::jsonb, ({expr.replace('data', '$2::jsonb')}), NOW(), NOW())
            ON CONFLICT (nct_id) DO UPDATE SET
                data = EXCLUDED.data,
                search_vector = EXCLUDED.search_vector,
                updated_at = NOW()
        """, nct_id, data_json)

    async def bulk_index_trials(self, trials: list[ClinicalTrial]) -> dict[str, int]:
        """Bulk index trials. Returns counts of success/failure."""
        if not trials:
            return {"indexed": 0, "failed": 0}

        indexed = 0
        failed = 0
        pool = get_pool()

        async with pool.acquire() as conn:
            for trial in trials:
                try:
                    doc = trial.model_dump(mode="json", exclude_none=True)
                    data_json = json.dumps(doc, default=str)
                    await conn.execute("""
                        INSERT INTO trials (nct_id, data, indexed_at, updated_at)
                        VALUES ($1, $2::jsonb, NOW(), NOW())
                        ON CONFLICT (nct_id) DO UPDATE SET
                            data = EXCLUDED.data,
                            updated_at = NOW()
                    """, trial.nct_id, data_json)
                    indexed += 1
                except Exception:
                    logger.warning("bulk_index_failed", nct_id=trial.nct_id, exc_info=True)
                    failed += 1

        # Rebuild search vectors for newly inserted rows
        expr = _build_search_vector_expr()
        await execute(f"UPDATE trials SET search_vector = ({expr}) WHERE search_vector IS NULL")

        return {"indexed": indexed, "failed": failed}

    async def delete_trial(self, nct_id: str) -> None:
        """Delete a trial by NCT ID."""
        await execute("DELETE FROM trials WHERE nct_id = $1", nct_id)

    async def search_trials(self, request: TrialSearchRequest) -> TrialSearchResponse:
        """Full-text search with filters, pagination, and facets."""
        t0 = time.perf_counter()

        where_clauses: list[str] = []
        params: list[Any] = []
        param_idx = 0

        # Free-text query
        rank_expr = "0"
        if request.query:
            param_idx += 1
            expanded = _expand_query(request.query)
            where_clauses.append(f"search_vector @@ websearch_to_tsquery('english', ${param_idx})")
            params.append(expanded)
            rank_expr = f"ts_rank_cd(search_vector, websearch_to_tsquery('english', ${param_idx}))"

        # Condition filter
        if request.conditions:
            cond_parts = []
            for cond in request.conditions:
                param_idx += 1
                cond_parts.append(f"data->>'conditions' ILIKE '%' || ${param_idx} || '%'")
                params.append(cond)
            where_clauses.append(f"({' OR '.join(cond_parts)})")

        # Phase filter
        if request.phases:
            param_idx += 1
            placeholders = ", ".join(f"${param_idx + i}" for i in range(len(request.phases)))
            for p in request.phases:
                params.append(p.value)
            param_idx += len(request.phases) - 1
            where_clauses.append(f"data->>'phase' IN ({placeholders})")

        # Status filter
        if request.statuses:
            status_placeholders = []
            for s in request.statuses:
                param_idx += 1
                status_placeholders.append(f"${param_idx}")
                params.append(s.value)
            where_clauses.append(f"data->>'overall_status' IN ({', '.join(status_placeholders)})")

        # Sponsor filter
        if request.sponsor:
            param_idx += 1
            where_clauses.append(f"data->>'sponsor' ILIKE '%' || ${param_idx} || '%'")
            params.append(request.sponsor)

        # Healthy volunteers filter
        if request.healthy_volunteers is not None:
            param_idx += 1
            where_clauses.append(f"(data->'eligibility'->>'healthy_volunteers')::boolean = ${param_idx}")
            params.append(request.healthy_volunteers)

        # Location filters
        if request.location_country:
            param_idx += 1
            where_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'locations') = 'array' THEN data->'locations' ELSE '[]'::jsonb END) loc WHERE loc->>'country' = ${param_idx})")
            params.append(request.location_country)

        if request.location_state:
            param_idx += 1
            where_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'locations') = 'array' THEN data->'locations' ELSE '[]'::jsonb END) loc WHERE loc->>'state' = ${param_idx})")
            params.append(request.location_state)

        if request.location_city:
            param_idx += 1
            where_clauses.append(f"EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'locations') = 'array' THEN data->'locations' ELSE '[]'::jsonb END) loc WHERE loc->>'city' = ${param_idx})")
            params.append(request.location_city)

        # Demographics
        if request.demographics:
            demo = request.demographics
            if demo.min_age is not None:
                param_idx += 1
                where_clauses.append(f"(COALESCE((data->'eligibility'->>'maximum_age_years')::int, 999) >= ${param_idx})")
                params.append(demo.min_age)
            if demo.max_age is not None:
                param_idx += 1
                where_clauses.append(f"(COALESCE((data->'eligibility'->>'minimum_age_years')::int, 0) <= ${param_idx})")
                params.append(demo.max_age)
            if demo.gender and demo.gender.value != "All":
                param_idx += 1
                where_clauses.append(f"(data->'eligibility'->>'gender' IN (${param_idx}, 'All'))")
                params.append(demo.gender.value)

        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

        # Sort
        if request.sort_by == "date":
            order_sql = "data->>'last_update_posted' DESC NULLS LAST"
        elif request.sort_by == "enrollment":
            order_sql = "(data->>'enrollment_count')::int DESC NULLS LAST"
        else:
            order_sql = f"{rank_expr} DESC, data->>'last_update_posted' DESC NULLS LAST"

        # Snapshot filter params before adding pagination (used by facets/count)
        filter_params = list(params)

        # Count total
        count_sql = f"SELECT count(*) FROM trials WHERE {where_sql}"
        total = await fetch_val(count_sql, *filter_params)

        # Paginated results (parameterized LIMIT/OFFSET to prevent injection)
        offset = (request.page - 1) * request.page_size
        param_idx += 1
        limit_param = param_idx
        params.append(request.page_size)
        param_idx += 1
        offset_param = param_idx
        params.append(offset)
        results_sql = f"""
            SELECT nct_id, data, {rank_expr} AS score
            FROM trials
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT ${limit_param} OFFSET ${offset_param}
        """
        rows = await fetch_all(results_sql, *params)

        trial_summaries: list[TrialSummary] = []
        for row in rows:
            d = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
            locations = d.get("locations", [])
            conditions = d.get("conditions", [])
            if isinstance(conditions, str):
                conditions = [conditions]
            trial_summaries.append(TrialSummary(
                nct_id=row["nct_id"],
                title=d.get("title", ""),
                brief_title=d.get("brief_title"),
                overall_status=d.get("overall_status"),
                phase=d.get("phase"),
                conditions=conditions,
                sponsor=d.get("sponsor"),
                enrollment_count=d.get("enrollment_count"),
                start_date=d.get("start_date"),
                locations_count=len(locations) if isinstance(locations, list) else 0,
                score=float(row["score"]) if row["score"] else None,
            ))

        # Facets (simple aggregation queries) — use filter_params (without LIMIT/OFFSET)
        facets = await self._build_facets(where_sql, filter_params)

        elapsed_ms = (time.perf_counter() - t0) * 1000

        return TrialSearchResponse(
            total=total or 0,
            page=request.page,
            page_size=request.page_size,
            trials=trial_summaries,
            facets=facets,
            query_time_ms=round(elapsed_ms, 2),
        )

    async def get_trial(self, nct_id: str) -> Optional[dict[str, Any]]:
        """Retrieve a single trial by NCT ID."""
        row = await fetch_one("SELECT data FROM trials WHERE nct_id = $1", nct_id)
        if row is None:
            return None
        return row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])

    async def get_distinct_conditions(self, prefix: Optional[str] = None, size: int = 100) -> list[str]:
        """Return distinct condition values, optionally filtered by prefix."""
        size = max(1, min(size, 500))
        if prefix:
            rows = await fetch_all("""
                SELECT cond, count(*) AS cnt
                FROM trials, jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(data->'conditions') = 'array' THEN data->'conditions' ELSE '[]'::jsonb END
                ) AS cond
                WHERE cond ILIKE $1 || '%'
                GROUP BY cond ORDER BY cnt DESC LIMIT $2
            """, prefix, size)
        else:
            rows = await fetch_all("""
                SELECT cond, count(*) AS cnt
                FROM trials, jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(data->'conditions') = 'array' THEN data->'conditions' ELSE '[]'::jsonb END
                ) AS cond
                GROUP BY cond ORDER BY cnt DESC LIMIT $1
            """, size)
        return [row["cond"] for row in rows]

    async def count(self) -> int:
        """Return total number of trials in the database."""
        result = await fetch_val("SELECT count(*) FROM trials")
        return result or 0

    async def find_similar_trials(self, nct_id: str, max_results: int = 5) -> list[dict[str, Any]]:
        """Find trials similar to the given one using text similarity."""
        source = await self.get_trial(nct_id)
        if source is None:
            raise ValueError(f"Trial '{nct_id}' not found")

        # Build a search query from the source trial's title + conditions
        search_terms = source.get("title", "")
        conditions = source.get("conditions", [])
        if isinstance(conditions, list):
            search_terms += " " + " ".join(conditions)

        rows = await fetch_all("""
            SELECT nct_id, data,
                   ts_rank_cd(search_vector, plainto_tsquery('english', $1)) AS score
            FROM trials
            WHERE nct_id != $2
              AND search_vector @@ plainto_tsquery('english', $1)
            ORDER BY score DESC
            LIMIT $3
        """, search_terms, nct_id, max_results)

        results: list[dict[str, Any]] = []
        for row in rows:
            d = row["data"] if isinstance(row["data"], dict) else json.loads(row["data"])
            results.append(d)

        logger.info("find_similar_trials", nct_id=nct_id, results_count=len(results))
        return results

    async def _build_facets(self, where_sql: str, params: list[Any]) -> SearchFacets:
        """Build faceted counts using simple GROUP BY queries."""
        try:
            # Phase facets
            phase_rows = await fetch_all(f"""
                SELECT data->>'phase' AS key, count(*) AS doc_count
                FROM trials WHERE {where_sql} AND data->>'phase' IS NOT NULL
                GROUP BY data->>'phase' ORDER BY doc_count DESC LIMIT 10
            """, *params)

            # Status facets
            status_rows = await fetch_all(f"""
                SELECT data->>'overall_status' AS key, count(*) AS doc_count
                FROM trials WHERE {where_sql} AND data->>'overall_status' IS NOT NULL
                GROUP BY data->>'overall_status' ORDER BY doc_count DESC LIMIT 15
            """, *params)

            # Sponsor facets
            sponsor_rows = await fetch_all(f"""
                SELECT data->>'sponsor' AS key, count(*) AS doc_count
                FROM trials WHERE {where_sql} AND data->>'sponsor' IS NOT NULL
                GROUP BY data->>'sponsor' ORDER BY doc_count DESC LIMIT 20
            """, *params)

            return SearchFacets(
                conditions=[],  # Expensive to compute from JSONB arrays; omit for performance
                phases=[FacetBucket(key=r["key"], doc_count=r["doc_count"]) for r in phase_rows],
                statuses=[FacetBucket(key=r["key"], doc_count=r["doc_count"]) for r in status_rows],
                countries=[],  # Expensive nested JSONB; omit for performance
                sponsors=[FacetBucket(key=r["key"], doc_count=r["doc_count"]) for r in sponsor_rows],
            )
        except Exception:
            logger.warning("facet_query_failed", exc_info=True)
            return SearchFacets()


# Singleton
_client: Optional[TrialPgSearchClient] = None


def get_opensearch_client() -> TrialPgSearchClient:
    """Return a cached singleton search client.

    Function name preserved for backward compatibility with router imports.
    """
    global _client
    if _client is None:
        _client = TrialPgSearchClient()
    return _client
