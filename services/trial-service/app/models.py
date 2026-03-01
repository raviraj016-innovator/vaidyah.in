"""Pydantic models for the Trial Intelligence Service."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
#  Enums
# --------------------------------------------------------------------------- #

class TrialPhase(str, Enum):
    EARLY_PHASE_1 = "Early Phase 1"
    PHASE_1 = "Phase 1"
    PHASE_1_2 = "Phase 1/Phase 2"
    PHASE_2 = "Phase 2"
    PHASE_2_3 = "Phase 2/Phase 3"
    PHASE_3 = "Phase 3"
    PHASE_4 = "Phase 4"
    NOT_APPLICABLE = "Not Applicable"


class TrialStatus(str, Enum):
    NOT_YET_RECRUITING = "Not yet recruiting"
    RECRUITING = "Recruiting"
    ENROLLING_BY_INVITATION = "Enrolling by invitation"
    ACTIVE_NOT_RECRUITING = "Active, not recruiting"
    SUSPENDED = "Suspended"
    TERMINATED = "Terminated"
    COMPLETED = "Completed"
    WITHDRAWN = "Withdrawn"
    UNKNOWN = "Unknown status"


class Gender(str, Enum):
    ALL = "All"
    MALE = "Male"
    FEMALE = "Female"


class MatchStatus(str, Enum):
    PENDING = "pending"
    VIEWED = "viewed"
    INTERESTED = "interested"
    DISMISSED = "dismissed"
    ENROLLED = "enrolled"


class NotificationType(str, Enum):
    NEW_MATCH = "new_match"
    TRIAL_UPDATE = "trial_update"
    ENROLLMENT_OPEN = "enrollment_open"
    TRIAL_CLOSED = "trial_closed"


class ETLState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SupportedLanguage(str, Enum):
    ENGLISH = "en"
    HINDI = "hi"


# --------------------------------------------------------------------------- #
#  Core domain models
# --------------------------------------------------------------------------- #

class TrialLocation(BaseModel):
    """A single site / facility participating in the trial."""
    facility_name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None


class TrialContact(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class TrialEligibility(BaseModel):
    """Eligibility criteria for a clinical trial."""
    criteria_text: Optional[str] = None
    gender: Gender = Gender.ALL
    minimum_age: Optional[str] = None  # e.g. "18 Years"
    maximum_age: Optional[str] = None  # e.g. "65 Years"
    minimum_age_years: Optional[int] = None
    maximum_age_years: Optional[int] = None
    healthy_volunteers: bool = False
    inclusion_criteria: list[str] = Field(default_factory=list)
    exclusion_criteria: list[str] = Field(default_factory=list)


class TrialArm(BaseModel):
    label: Optional[str] = None
    arm_type: Optional[str] = None
    description: Optional[str] = None
    interventions: list[str] = Field(default_factory=list)


class TrialIntervention(BaseModel):
    intervention_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class ClinicalTrial(BaseModel):
    """Full clinical trial record."""
    nct_id: str = Field(..., description="ClinicalTrials.gov NCT identifier")
    org_study_id: Optional[str] = None
    title: str = Field(..., description="Official title of the trial")
    brief_title: Optional[str] = None
    acronym: Optional[str] = None
    official_title: Optional[str] = None
    brief_summary: Optional[str] = None
    detailed_description: Optional[str] = None
    overall_status: TrialStatus = TrialStatus.UNKNOWN
    phase: Optional[TrialPhase] = None
    study_type: Optional[str] = None
    enrollment_count: Optional[int] = None
    enrollment_type: Optional[str] = None
    conditions: list[str] = Field(default_factory=list)
    interventions: list[TrialIntervention] = Field(default_factory=list)
    arms: list[TrialArm] = Field(default_factory=list)
    eligibility: TrialEligibility = Field(default_factory=TrialEligibility)
    locations: list[TrialLocation] = Field(default_factory=list)
    contacts: list[TrialContact] = Field(default_factory=list)
    sponsor: Optional[str] = None
    collaborators: list[str] = Field(default_factory=list)
    start_date: Optional[date] = None
    completion_date: Optional[date] = None
    primary_completion_date: Optional[date] = None
    last_update_posted: Optional[date] = None
    results_first_posted: Optional[date] = None
    keywords: list[str] = Field(default_factory=list)
    mesh_terms: list[str] = Field(default_factory=list)
    url: Optional[str] = None
    plain_language_summary: Optional[str] = None
    plain_language_eligibility: Optional[list[str]] = None
    indexed_at: Optional[datetime] = None

    class Config:
        json_encoders = {
            date: lambda v: v.isoformat() if v else None,
            datetime: lambda v: v.isoformat() if v else None,
        }


# --------------------------------------------------------------------------- #
#  Demographic filter
# --------------------------------------------------------------------------- #

class DemographicFilter(BaseModel):
    """Demographic constraints used during search / matching."""
    min_age: Optional[int] = Field(None, ge=0, le=120)
    max_age: Optional[int] = Field(None, ge=0, le=120)
    gender: Optional[Gender] = None


# --------------------------------------------------------------------------- #
#  Search
# --------------------------------------------------------------------------- #

class TrialSearchRequest(BaseModel):
    """Parameters for a full-text trial search."""
    query: Optional[str] = Field(None, description="Free-text search query")
    conditions: list[str] = Field(default_factory=list)
    phases: list[TrialPhase] = Field(default_factory=list)
    statuses: list[TrialStatus] = Field(default_factory=list)
    location_country: Optional[str] = None
    location_state: Optional[str] = None
    location_city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: Optional[float] = Field(None, description="Search radius in kilometres")
    demographics: Optional[DemographicFilter] = None
    sponsor: Optional[str] = None
    intervention_type: Optional[str] = None
    healthy_volunteers: Optional[bool] = None
    sort_by: str = Field("relevance", description="relevance | date | enrollment")
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class TrialSummary(BaseModel):
    """Lightweight trial representation for list endpoints."""
    nct_id: str
    title: str
    brief_title: Optional[str] = None
    overall_status: Optional[TrialStatus] = None
    phase: Optional[TrialPhase] = None
    conditions: list[str] = Field(default_factory=list)
    sponsor: Optional[str] = None
    enrollment_count: Optional[int] = None
    start_date: Optional[date] = None
    locations_count: int = 0
    score: Optional[float] = None


class FacetBucket(BaseModel):
    key: str
    doc_count: int


class SearchFacets(BaseModel):
    conditions: list[FacetBucket] = Field(default_factory=list)
    phases: list[FacetBucket] = Field(default_factory=list)
    statuses: list[FacetBucket] = Field(default_factory=list)
    countries: list[FacetBucket] = Field(default_factory=list)
    sponsors: list[FacetBucket] = Field(default_factory=list)


class TrialSearchResponse(BaseModel):
    """Paginated search results with facets."""
    total: int
    page: int
    page_size: int
    trials: list[TrialSummary]
    facets: Optional[SearchFacets] = None
    query_time_ms: Optional[float] = None


# --------------------------------------------------------------------------- #
#  Patient matching
# --------------------------------------------------------------------------- #

class PatientProfile(BaseModel):
    """Subset of patient data used for matching."""
    patient_id: str
    age: Optional[int] = None
    gender: Optional[Gender] = None
    conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    preferred_radius_km: float = 100.0
    preferred_phases: list[TrialPhase] = Field(default_factory=list)


class TrialMatchRequest(BaseModel):
    """Request body for POST /trials/match/{patient_id}."""
    profile: PatientProfile
    max_results: int = Field(20, ge=1, le=100)
    include_summary: bool = False
    language: SupportedLanguage = SupportedLanguage.ENGLISH


class TrialMatchScore(BaseModel):
    """A single matched trial with scoring breakdown."""
    nct_id: str
    title: str
    brief_title: Optional[str] = None
    overall_status: Optional[TrialStatus] = None
    phase: Optional[TrialPhase] = None
    conditions: list[str] = Field(default_factory=list)
    composite_score: float = Field(..., ge=0.0, le=1.0)
    eligibility_score: float = Field(0.0, ge=0.0, le=1.0)
    condition_score: float = Field(0.0, ge=0.0, le=1.0)
    location_score: float = Field(0.0, ge=0.0, le=1.0)
    phase_score: float = Field(0.0, ge=0.0, le=1.0)
    ml_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    distance_km: Optional[float] = None
    match_reasons: list[str] = Field(default_factory=list)
    plain_language_summary: Optional[str] = None
    match_status: MatchStatus = MatchStatus.PENDING


class TrialMatchResponse(BaseModel):
    """Response from the matching endpoint."""
    patient_id: str
    matched_at: datetime
    total_evaluated: int
    total_matched: int
    matches: list[TrialMatchScore]


# --------------------------------------------------------------------------- #
#  Notifications
# --------------------------------------------------------------------------- #

class TrialNotification(BaseModel):
    """A notification about a trial event for a patient."""
    notification_id: str
    patient_id: str
    nct_id: str
    trial_title: str
    notification_type: NotificationType
    message: str
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    is_read: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubscriptionRequest(BaseModel):
    """Subscribe a patient to condition-based trial alerts."""
    patient_id: str
    conditions: list[str] = Field(default_factory=list)
    phases: list[TrialPhase] = Field(default_factory=list)
    statuses: list[TrialStatus] = Field(
        default_factory=lambda: [TrialStatus.RECRUITING]
    )
    location_country: Optional[str] = None
    radius_km: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notify_via_push: bool = True
    notify_via_email: bool = False


class Subscription(BaseModel):
    subscription_id: str
    patient_id: str
    conditions: list[str]
    phases: list[TrialPhase]
    statuses: list[TrialStatus]
    location_country: Optional[str] = None
    radius_km: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notify_via_push: bool = True
    notify_via_email: bool = False
    created_at: datetime
    is_active: bool = True


# --------------------------------------------------------------------------- #
#  ETL / Ingest
# --------------------------------------------------------------------------- #

class ETLStatus(BaseModel):
    """Current status of the ClinicalTrials.gov ETL pipeline."""
    state: ETLState = ETLState.IDLE
    last_sync_started: Optional[datetime] = None
    last_sync_completed: Optional[datetime] = None
    last_sync_error: Optional[str] = None
    trials_fetched: int = 0
    trials_indexed: int = 0
    trials_failed: int = 0
    total_trials_in_index: int = 0
    next_scheduled_sync: Optional[datetime] = None


class ETLSyncRequest(BaseModel):
    """Request body for triggering a manual sync."""
    conditions: list[str] = Field(
        default_factory=list,
        description="Filter sync to specific conditions; empty = sync all",
    )
    full_refresh: bool = Field(
        False,
        description="If True, re-index everything instead of incremental sync",
    )
    max_records: Optional[int] = Field(
        None,
        description="Cap the number of records to fetch (useful for testing)",
    )
