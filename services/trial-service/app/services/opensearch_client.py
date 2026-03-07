"""OpenSearch client for clinical trial indexing and search."""

from __future__ import annotations

import time
from functools import lru_cache
from typing import Any, Optional

import structlog
from opensearchpy import OpenSearch, RequestsHttpConnection

from app.config import get_settings
from app.models import (
    ClinicalTrial,
    FacetBucket,
    SearchFacets,
    TrialSearchRequest,
    TrialSearchResponse,
    TrialSummary,
)

logger = structlog.get_logger(__name__)

# --------------------------------------------------------------------------- #
#  Index settings & mapping
# --------------------------------------------------------------------------- #

_INDEX_SETTINGS = {
    "settings": {
        "index": {
            "number_of_shards": 2,
            "number_of_replicas": 1,
            "refresh_interval": "5s",
        },
        "analysis": {
            "analyzer": {
                "medical_text_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": [
                        "lowercase",
                        "medical_synonym",
                        "english_stemmer",
                        "trim",
                    ],
                },
                "medical_keyword_analyzer": {
                    "type": "custom",
                    "tokenizer": "keyword",
                    "filter": ["lowercase", "trim"],
                },
                "autocomplete_analyzer": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "edge_ngram_filter"],
                },
            },
            "filter": {
                "medical_synonym": {
                    "type": "synonym",
                    "lenient": True,
                    "synonyms": [
                        "heart attack, myocardial infarction, MI",
                        "high blood pressure, hypertension, HTN",
                        "diabetes, diabetes mellitus, DM",
                        "cancer, carcinoma, malignant neoplasm",
                        "stroke, cerebrovascular accident, CVA",
                        "kidney disease, renal disease, nephropathy",
                        "liver disease, hepatic disease, hepatopathy",
                        "lung cancer, pulmonary carcinoma",
                        "breast cancer, mammary carcinoma",
                        "asthma, bronchial asthma, reactive airway disease",
                        "COPD, chronic obstructive pulmonary disease",
                        "TB, tuberculosis",
                        "HIV, human immunodeficiency virus",
                        "AIDS, acquired immunodeficiency syndrome",
                        "depression, major depressive disorder, MDD",
                        "anxiety, generalized anxiety disorder, GAD",
                        "Alzheimer, Alzheimer's disease, AD",
                        "Parkinson, Parkinson's disease, PD",
                        "rheumatoid arthritis, RA",
                        "osteoarthritis, OA, degenerative joint disease",
                        "psoriasis, plaque psoriasis",
                        "eczema, atopic dermatitis",
                        "anaemia, anemia",
                        "leukaemia, leukemia",
                        "haemophilia, hemophilia",
                        "oesophagus, esophagus",
                        "paediatric, pediatric",
                        "tumour, tumor",
                        "colour, color",
                        "sugar, glucose, blood sugar",
                    ],
                },
                "english_stemmer": {
                    "type": "stemmer",
                    "language": "english",
                },
                "edge_ngram_filter": {
                    "type": "edge_ngram",
                    "min_gram": 2,
                    "max_gram": 20,
                },
            },
        },
    },
    "mappings": {
        "properties": {
            # ---------- Identifiers ----------
            "nct_id": {"type": "keyword"},
            "org_study_id": {"type": "keyword"},
            # ---------- Titles / descriptions ----------
            "title": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
                "fields": {
                    "raw": {"type": "keyword"},
                    "autocomplete": {
                        "type": "text",
                        "analyzer": "autocomplete_analyzer",
                        "search_analyzer": "standard",
                    },
                },
            },
            "brief_title": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
            },
            "official_title": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
            },
            "brief_summary": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
            },
            "detailed_description": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
            },
            # ---------- Classification ----------
            "overall_status": {"type": "keyword"},
            "phase": {"type": "keyword"},
            "study_type": {"type": "keyword"},
            # ---------- Enrollment ----------
            "enrollment_count": {"type": "integer"},
            "enrollment_type": {"type": "keyword"},
            # ---------- Conditions & interventions ----------
            "conditions": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
                "fields": {
                    "keyword": {"type": "keyword"},
                    "autocomplete": {
                        "type": "text",
                        "analyzer": "autocomplete_analyzer",
                        "search_analyzer": "standard",
                    },
                },
            },
            "interventions": {
                "type": "nested",
                "properties": {
                    "intervention_type": {"type": "keyword"},
                    "name": {
                        "type": "text",
                        "analyzer": "medical_text_analyzer",
                        "fields": {"keyword": {"type": "keyword"}},
                    },
                    "description": {"type": "text", "analyzer": "medical_text_analyzer"},
                },
            },
            "arms": {
                "type": "nested",
                "properties": {
                    "label": {"type": "text"},
                    "arm_type": {"type": "keyword"},
                    "description": {"type": "text"},
                },
            },
            # ---------- Eligibility ----------
            "eligibility": {
                "type": "object",
                "properties": {
                    "criteria_text": {"type": "text", "analyzer": "medical_text_analyzer"},
                    "gender": {"type": "keyword"},
                    "minimum_age_years": {"type": "integer"},
                    "maximum_age_years": {"type": "integer"},
                    "healthy_volunteers": {"type": "boolean"},
                    "inclusion_criteria": {"type": "text", "analyzer": "medical_text_analyzer"},
                    "exclusion_criteria": {"type": "text", "analyzer": "medical_text_analyzer"},
                },
            },
            # ---------- Locations ----------
            "locations": {
                "type": "nested",
                "properties": {
                    "facility_name": {"type": "text"},
                    "city": {"type": "keyword"},
                    "state": {"type": "keyword"},
                    "country": {"type": "keyword"},
                    "zip_code": {"type": "keyword"},
                    "geo_point": {"type": "geo_point"},
                    "status": {"type": "keyword"},
                    "contact_name": {"type": "text"},
                    "contact_phone": {"type": "keyword"},
                    "contact_email": {"type": "keyword"},
                },
            },
            # ---------- Contacts ----------
            "contacts": {
                "type": "nested",
                "properties": {
                    "name": {"type": "text"},
                    "role": {"type": "keyword"},
                    "phone": {"type": "keyword"},
                    "email": {"type": "keyword"},
                },
            },
            # ---------- Sponsor ----------
            "sponsor": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "collaborators": {"type": "keyword"},
            # ---------- Dates ----------
            "start_date": {"type": "date"},
            "completion_date": {"type": "date"},
            "primary_completion_date": {"type": "date"},
            "last_update_posted": {"type": "date"},
            "results_first_posted": {"type": "date"},
            # ---------- Tags ----------
            "keywords": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "mesh_terms": {
                "type": "text",
                "analyzer": "medical_text_analyzer",
                "fields": {"keyword": {"type": "keyword"}},
            },
            # ---------- URL ----------
            "url": {"type": "keyword", "index": False},
            # ---------- Summaries ----------
            "plain_language_summary": {"type": "text"},
            # ---------- Metadata ----------
            "indexed_at": {"type": "date"},
        },
    },
}


# --------------------------------------------------------------------------- #
#  Client wrapper
# --------------------------------------------------------------------------- #

class TrialOpenSearchClient:
    """High-level OpenSearch operations for clinical trials."""

    def __init__(self) -> None:
        settings = get_settings()
        self._index = settings.opensearch_index
        self._client = OpenSearch(
            hosts=[settings.opensearch_endpoint],
            http_auth=(settings.opensearch_username, settings.opensearch_password),
            use_ssl=settings.opensearch_use_ssl,
            verify_certs=settings.opensearch_verify_certs,
            connection_class=RequestsHttpConnection,
            timeout=30,
        )

    # ------------------------------------------------------------------ #
    #  Index management
    # ------------------------------------------------------------------ #

    def ensure_index(self) -> None:
        """Create the clinical_trials index with mapping if it does not exist."""
        if self._client.indices.exists(index=self._index):
            logger.info("opensearch_index_exists", index=self._index)
            return
        self._client.indices.create(index=self._index, body=_INDEX_SETTINGS)
        logger.info("opensearch_index_created", index=self._index)

    def delete_index(self) -> None:
        """Delete the index (admin / testing only)."""
        if self._client.indices.exists(index=self._index):
            self._client.indices.delete(index=self._index)
            logger.warning("opensearch_index_deleted", index=self._index)

    # ------------------------------------------------------------------ #
    #  Indexing
    # ------------------------------------------------------------------ #

    def index_trial(self, nct_id: str, trial_data: dict[str, Any]) -> None:
        """Index or update a single trial document.

        Parameters
        ----------
        nct_id:
            The NCT identifier used as the document ID.
        trial_data:
            A JSON-serialisable dict representing the trial.
        """
        # Convert location lat/lon to geo_point if not already present
        doc = dict(trial_data)
        locations = doc.get("locations", [])
        for loc in locations:
            if "geo_point" not in loc:
                lat = loc.pop("latitude", None)
                lon = loc.pop("longitude", None)
                if lat is not None and lon is not None:
                    loc["geo_point"] = {"lat": lat, "lon": lon}

        self._client.index(
            index=self._index,
            id=nct_id,
            body=doc,
            refresh="wait_for",
        )

    def bulk_index_trials(self, trials: list[ClinicalTrial]) -> dict[str, int]:
        """Bulk index a batch of trials. Returns counts of success / failure."""
        if not trials:
            return {"indexed": 0, "failed": 0}

        actions: list[dict[str, Any]] = []
        for trial in trials:
            actions.append({"index": {"_index": self._index, "_id": trial.nct_id}})
            actions.append(self._trial_to_doc(trial))

        resp = self._client.bulk(body=actions, refresh="wait_for")
        errors = sum(1 for item in resp.get("items", []) if item.get("index", {}).get("error"))
        return {"indexed": len(trials) - errors, "failed": errors}

    def delete_trial(self, nct_id: str) -> None:
        """Delete a single trial document from the index by its NCT ID.

        Silently ignores the case where the document does not exist.
        """
        try:
            self._client.delete(
                index=self._index,
                id=nct_id,
                refresh="wait_for",
            )
        except Exception:
            # Document may not exist in the index; log and move on.
            logger.warning("opensearch_delete_not_found", nct_id=nct_id, exc_info=True)

    # ------------------------------------------------------------------ #
    #  Search
    # ------------------------------------------------------------------ #

    def search_trials(self, request: TrialSearchRequest) -> TrialSearchResponse:
        """Execute a full-text search with filters, boosting, and facets."""
        t0 = time.perf_counter()

        must_clauses: list[dict] = []
        filter_clauses: list[dict] = []

        # --- Free-text query with field boosting ---
        if request.query:
            must_clauses.append({
                "bool": {
                    "should": [
                        {
                            "multi_match": {
                                "query": request.query,
                                "fields": [
                                    "title^3",
                                    "brief_title^2.5",
                                    "conditions^2",
                                    "brief_summary^1.5",
                                    "detailed_description",
                                    "keywords^1.5",
                                    "mesh_terms^1.5",
                                ],
                                "type": "best_fields",
                                "fuzziness": "AUTO",
                                "prefix_length": 2,
                            },
                        },
                        {
                            "nested": {
                                "path": "interventions",
                                "query": {
                                    "match": {
                                        "interventions.name": {
                                            "query": request.query,
                                            "boost": 1.5,
                                        },
                                    },
                                },
                            },
                        },
                    ],
                    "minimum_should_match": 1,
                },
            })

        # --- Condition filter ---
        if request.conditions:
            filter_clauses.append({
                "bool": {
                    "should": [
                        {"match": {"conditions": cond}} for cond in request.conditions
                    ],
                    "minimum_should_match": 1,
                },
            })

        # --- Phase filter ---
        if request.phases:
            filter_clauses.append({
                "terms": {"phase": [p.value for p in request.phases]},
            })

        # --- Status filter ---
        if request.statuses:
            filter_clauses.append({
                "terms": {"overall_status": [s.value for s in request.statuses]},
            })

        # --- Sponsor filter ---
        if request.sponsor:
            filter_clauses.append({
                "match": {"sponsor": request.sponsor},
            })

        # --- Intervention type ---
        if request.intervention_type:
            filter_clauses.append({
                "nested": {
                    "path": "interventions",
                    "query": {"term": {"interventions.intervention_type": request.intervention_type}},
                },
            })

        # --- Healthy volunteers ---
        if request.healthy_volunteers is not None:
            filter_clauses.append({
                "term": {"eligibility.healthy_volunteers": request.healthy_volunteers},
            })

        # --- Location filters ---
        if request.location_country:
            filter_clauses.append({
                "nested": {
                    "path": "locations",
                    "query": {"term": {"locations.country": request.location_country}},
                },
            })
        if request.location_state:
            filter_clauses.append({
                "nested": {
                    "path": "locations",
                    "query": {"term": {"locations.state": request.location_state}},
                },
            })
        if request.location_city:
            filter_clauses.append({
                "nested": {
                    "path": "locations",
                    "query": {"term": {"locations.city": request.location_city}},
                },
            })

        # --- Geo-distance filter ---
        if request.latitude is not None and request.longitude is not None and request.radius_km:
            filter_clauses.append({
                "nested": {
                    "path": "locations",
                    "query": {
                        "geo_distance": {
                            "distance": f"{request.radius_km}km",
                            "locations.geo_point": {
                                "lat": request.latitude,
                                "lon": request.longitude,
                            },
                        },
                    },
                },
            })

        # --- Demographic filters ---
        if request.demographics:
            demo = request.demographics
            if demo.min_age is not None:
                filter_clauses.append({
                    "bool": {
                        "should": [
                            {"range": {"eligibility.maximum_age_years": {"gte": demo.min_age}}},
                            {"bool": {"must_not": {"exists": {"field": "eligibility.maximum_age_years"}}}},
                        ],
                    },
                })
            if demo.max_age is not None:
                filter_clauses.append({
                    "bool": {
                        "should": [
                            {"range": {"eligibility.minimum_age_years": {"lte": demo.max_age}}},
                            {"bool": {"must_not": {"exists": {"field": "eligibility.minimum_age_years"}}}},
                        ],
                    },
                })
            if demo.gender and demo.gender.value != "All":
                filter_clauses.append({
                    "bool": {
                        "should": [
                            {"term": {"eligibility.gender": demo.gender.value}},
                            {"term": {"eligibility.gender": "All"}},
                        ],
                    },
                })

        # --- Assemble bool query ---
        bool_query: dict[str, Any] = {}
        if must_clauses:
            bool_query["must"] = must_clauses
        if filter_clauses:
            bool_query["filter"] = filter_clauses
        if not bool_query:
            bool_query["must"] = [{"match_all": {}}]

        query_body: dict[str, Any] = {"bool": bool_query}

        # --- Sort ---
        sort_spec: list[Any] = []
        if request.sort_by == "date":
            sort_spec = [{"last_update_posted": {"order": "desc"}}, "_score"]
        elif request.sort_by == "enrollment":
            sort_spec = [{"enrollment_count": {"order": "desc"}}, "_score"]
        else:
            sort_spec = ["_score", {"last_update_posted": {"order": "desc"}}]

        # --- Aggregations for faceted search ---
        aggs = {
            "conditions": {
                "terms": {"field": "conditions.keyword", "size": 30},
            },
            "phases": {
                "terms": {"field": "phase", "size": 10},
            },
            "statuses": {
                "terms": {"field": "overall_status", "size": 15},
            },
            "countries": {
                "nested": {"path": "locations"},
                "aggs": {
                    "country_names": {
                        "terms": {"field": "locations.country", "size": 30},
                    },
                },
            },
            "sponsors": {
                "terms": {"field": "sponsor.keyword", "size": 20},
            },
        }

        # --- Pagination ---
        from_offset = (request.page - 1) * request.page_size

        body: dict[str, Any] = {
            "query": query_body,
            "sort": sort_spec,
            "from": from_offset,
            "size": request.page_size,
            "aggs": aggs,
            "_source": [
                "nct_id", "title", "brief_title", "overall_status", "phase",
                "conditions", "sponsor", "enrollment_count", "start_date",
                "locations",
            ],
        }

        resp = self._client.search(index=self._index, body=body)

        # --- Parse hits ---
        hits = resp.get("hits", {})
        total = hits.get("total", {}).get("value", 0)
        trial_summaries: list[TrialSummary] = []
        for hit in hits.get("hits", []):
            src = hit["_source"]
            trial_summaries.append(TrialSummary(
                nct_id=src["nct_id"],
                title=src.get("title", ""),
                brief_title=src.get("brief_title"),
                overall_status=src.get("overall_status"),
                phase=src.get("phase"),
                conditions=src.get("conditions", []),
                sponsor=src.get("sponsor"),
                enrollment_count=src.get("enrollment_count"),
                start_date=src.get("start_date"),
                locations_count=len(src.get("locations", [])),
                score=hit.get("_score"),
            ))

        # --- Parse aggregations ---
        raw_aggs = resp.get("aggregations", {})
        facets = SearchFacets(
            conditions=[
                FacetBucket(key=b["key"], doc_count=b["doc_count"])
                for b in raw_aggs.get("conditions", {}).get("buckets", [])
            ],
            phases=[
                FacetBucket(key=b["key"], doc_count=b["doc_count"])
                for b in raw_aggs.get("phases", {}).get("buckets", [])
            ],
            statuses=[
                FacetBucket(key=b["key"], doc_count=b["doc_count"])
                for b in raw_aggs.get("statuses", {}).get("buckets", [])
            ],
            countries=[
                FacetBucket(key=b["key"], doc_count=b["doc_count"])
                for b in raw_aggs.get("countries", {}).get("country_names", {}).get("buckets", [])
            ],
            sponsors=[
                FacetBucket(key=b["key"], doc_count=b["doc_count"])
                for b in raw_aggs.get("sponsors", {}).get("buckets", [])
            ],
        )

        elapsed_ms = (time.perf_counter() - t0) * 1000

        return TrialSearchResponse(
            total=total,
            page=request.page,
            page_size=request.page_size,
            trials=trial_summaries,
            facets=facets,
            query_time_ms=round(elapsed_ms, 2),
        )

    def get_trial(self, nct_id: str) -> Optional[dict[str, Any]]:
        """Retrieve a single trial document by NCT ID."""
        try:
            resp = self._client.get(index=self._index, id=nct_id)
            return resp["_source"]
        except Exception:
            return None

    def get_distinct_conditions(self, prefix: Optional[str] = None, size: int = 100) -> list[str]:
        """Return distinct condition values, optionally filtered by prefix."""
        size = max(1, min(size, 500))  # Clamp size to prevent excessive aggregation
        agg_body: dict[str, Any] = {
            "size": 0,
            "aggs": {
                "unique_conditions": {
                    "terms": {"field": "conditions.keyword", "size": size},
                },
            },
        }
        if prefix:
            # Sanitize prefix: strip whitespace, limit length, remove wildcard chars
            sanitized = prefix.strip()[:200].replace("*", "").replace("?", "")
            if sanitized:
                agg_body["query"] = {
                    "prefix": {"conditions.keyword": {"value": sanitized, "case_insensitive": True}},
                }

        resp = self._client.search(index=self._index, body=agg_body)
        buckets = resp.get("aggregations", {}).get("unique_conditions", {}).get("buckets", [])
        return [b["key"] for b in buckets]

    def count(self) -> int:
        """Return total number of documents in the index."""
        resp = self._client.count(index=self._index)
        return resp.get("count", 0)

    # ------------------------------------------------------------------ #
    #  Helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def _trial_to_doc(trial: ClinicalTrial) -> dict[str, Any]:
        """Convert a ClinicalTrial model to an OpenSearch document."""
        doc = trial.model_dump(mode="json", exclude_none=True)
        # Build geo_point for each location that has coordinates
        locations = doc.get("locations", [])
        for loc in locations:
            lat = loc.pop("latitude", None)
            lon = loc.pop("longitude", None)
            if lat is not None and lon is not None:
                loc["geo_point"] = {"lat": lat, "lon": lon}
        return doc


@lru_cache
def get_opensearch_client() -> TrialOpenSearchClient:
    """Return a cached singleton OpenSearch client."""
    return TrialOpenSearchClient()
