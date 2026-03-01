/**
 * Clinical trial type definitions for the Vaidyah healthcare platform.
 * Supports matching rural patients to eligible clinical trials.
 */

/** Trial phase classification */
export type TrialPhase = 'phase_1' | 'phase_2' | 'phase_3' | 'phase_4' | 'observational' | 'not_applicable';

/** Trial recruitment status */
export type TrialRecruitmentStatus =
  | 'not_yet_recruiting'
  | 'recruiting'
  | 'enrolling_by_invitation'
  | 'active_not_recruiting'
  | 'suspended'
  | 'terminated'
  | 'completed'
  | 'withdrawn';

/** Study type */
export type StudyType = 'interventional' | 'observational' | 'expanded_access' | 'registry';

/** Intervention type */
export type InterventionType =
  | 'drug'
  | 'biological'
  | 'device'
  | 'procedure'
  | 'behavioral'
  | 'dietary_supplement'
  | 'diagnostic_test'
  | 'genetic'
  | 'radiation'
  | 'combination'
  | 'other';

/** Match strength classification */
export type MatchStrength = 'strong' | 'moderate' | 'weak' | 'ineligible';

/** Eligibility criterion type */
export type CriterionType = 'inclusion' | 'exclusion';

/** Gender eligibility */
export type GenderEligibility = 'male' | 'female' | 'all';

/** Individual eligibility criterion */
export interface EligibilityCriterion {
  id: string;
  type: CriterionType;
  category: 'demographic' | 'medical_condition' | 'medication' | 'lab_value' | 'vital_sign' | 'lifestyle' | 'consent' | 'geographic' | 'other';
  description: string;
  descriptionLocalized?: string;

  /** Structured criterion for automated matching */
  structured?: {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'between' | 'contains' | 'exists';
    value: string | number | boolean | string[] | number[];
    unit?: string;
  };

  /** Whether this criterion is mandatory (cannot be waived) */
  isMandatory: boolean;
}

/** Contact information for a trial site */
export interface TrialContact {
  name: string;
  role: string;
  phone?: string;
  email?: string;
  organization?: string;
}

/** Trial site location */
export interface TrialSite {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  pincode?: string;
  status: 'active' | 'inactive' | 'pending';
  contact: TrialContact;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  distanceFromPatientKm?: number;
}

/** Clinical trial definition */
export interface ClinicalTrial {
  id: string;

  /** External identifiers */
  ctriNumber?: string;
  nctNumber?: string;
  who_ictrp_id?: string;

  /** Basic information */
  title: string;
  shortTitle?: string;
  titleLocalized?: string;
  description: string;
  descriptionLocalized?: string;

  /** Sponsor and organization */
  sponsor: string;
  principalInvestigator: string;
  fundingSource?: string;
  collaborators?: string[];

  /** Study design */
  studyType: StudyType;
  phase: TrialPhase;
  interventionType: InterventionType;
  interventionName: string;
  interventionDescription: string;
  comparator?: string;

  /** Target conditions */
  targetConditions: {
    name: string;
    icdCode: string;
  }[];

  /** Primary and secondary outcomes */
  primaryOutcome: string;
  secondaryOutcomes?: string[];
  primaryEndpoint?: string;

  /** Eligibility */
  eligibilityCriteria: EligibilityCriterion[];
  genderEligibility: GenderEligibility;
  minimumAge: number;
  maximumAge: number;
  ageUnit: 'years' | 'months';

  /** Recruitment */
  recruitmentStatus: TrialRecruitmentStatus;
  targetEnrollment: number;
  currentEnrollment: number;
  enrollmentStartDate?: string;
  estimatedCompletionDate?: string;
  actualCompletionDate?: string;

  /** Sites */
  sites: TrialSite[];
  isMultiCenter: boolean;

  /** Ethical approval */
  ethicsCommittee: string;
  ethicsApprovalDate?: string;
  ethicsApprovalNumber?: string;

  /** Compensation and support */
  patientCompensation?: string;
  travelSupport?: boolean;
  travelSupportDetails?: string;
  freeInvestigationalDrug: boolean;
  freeDiagnostics: boolean;
  insuranceProvided: boolean;

  /** Consent */
  informedConsentLanguages: string[];
  consentDocumentUrl?: string;

  /** Contacts */
  primaryContact: TrialContact;
  secondaryContact?: TrialContact;

  /** Metadata */
  registrationDate: string;
  lastUpdated: string;
  source: 'ctri' | 'clinicaltrials_gov' | 'who_ictrp' | 'manual';
  sourceUrl?: string;
  isActive: boolean;
  tags?: string[];
}

/** Result of evaluating a single eligibility criterion against a patient */
export interface CriterionEvaluation {
  criterionId: string;
  criterion: EligibilityCriterion;
  result: 'met' | 'not_met' | 'unknown' | 'needs_assessment';
  patientValue?: string;
  explanation: string;
  confidence: number;
  dataSource?: 'patient_record' | 'vitals' | 'lab_results' | 'self_reported' | 'inferred';
}

/** Full eligibility evaluation for a patient-trial pair */
export interface TrialEligibility {
  patientId: string;
  trialId: string;
  evaluatedAt: string;
  evaluatedBy: string;

  /** Overall eligibility result */
  isEligible: boolean;
  eligibilityScore: number;

  /** Per-criterion evaluation */
  criteriaEvaluations: CriterionEvaluation[];

  /** Summary counts */
  inclusionCriteriaMet: number;
  inclusionCriteriaTotal: number;
  exclusionCriteriaMet: number;
  exclusionCriteriaTotal: number;
  unknownCriteria: number;

  /** Barriers to eligibility */
  barriers: {
    criterion: string;
    barrier: string;
    isWaivable: boolean;
  }[];

  /** Missing data that would need to be collected */
  missingData: {
    field: string;
    description: string;
    howToCollect: string;
  }[];

  /** Clinical notes */
  notes?: string;
  reviewedByClinician: boolean;
  clinicianApproval?: boolean;
  clinicianNotes?: string;
}

/** Patient-trial match result */
export interface TrialMatch {
  id: string;
  patientId: string;
  trialId: string;
  trial: ClinicalTrial;
  eligibility: TrialEligibility;

  /** Match quality */
  matchStrength: MatchStrength;
  matchScore: number;
  matchRank: number;

  /** Practical considerations */
  nearestSite?: TrialSite;
  distanceToSiteKm?: number;
  languageMatch: boolean;
  travelSupportAvailable: boolean;

  /** Status tracking */
  status:
    | 'identified'
    | 'presented_to_patient'
    | 'patient_interested'
    | 'patient_declined'
    | 'clinician_review'
    | 'clinician_approved'
    | 'clinician_rejected'
    | 'referred_to_site'
    | 'screening'
    | 'enrolled'
    | 'screen_failed'
    | 'withdrawn';

  /** Patient communication */
  patientNotifiedAt?: string;
  patientNotificationLanguage?: string;
  patientDecisionAt?: string;
  patientDeclineReason?: string;

  /** Timestamps */
  identifiedAt: string;
  lastUpdated: string;
  updatedBy: string;
}

/** Filters for searching clinical trials */
export interface TrialSearchFilters {
  /** Text search across title and description */
  query?: string;

  /** Filter by target condition ICD codes */
  conditionIcdCodes?: string[];

  /** Filter by condition name (partial match) */
  conditionName?: string;

  /** Filter by phase */
  phases?: TrialPhase[];

  /** Filter by study type */
  studyTypes?: StudyType[];

  /** Filter by intervention type */
  interventionTypes?: InterventionType[];

  /** Filter by recruitment status */
  recruitmentStatuses?: TrialRecruitmentStatus[];

  /** Filter by patient age (auto-checks age eligibility) */
  patientAge?: number;

  /** Filter by patient gender */
  patientGender?: 'male' | 'female';

  /** Filter by state (for site location) */
  states?: string[];

  /** Filter by distance from coordinates */
  location?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };

  /** Filter by available language for consent */
  consentLanguage?: string;

  /** Only trials with travel support */
  requireTravelSupport?: boolean;

  /** Only trials with free diagnostics */
  requireFreeDiagnostics?: boolean;

  /** Sponsor filter */
  sponsor?: string;

  /** Registration source */
  source?: 'ctri' | 'clinicaltrials_gov' | 'who_ictrp' | 'manual';

  /** Tags */
  tags?: string[];

  /** Pagination */
  page?: number;
  pageSize?: number;

  /** Sort */
  sortBy?: 'relevance' | 'distance' | 'match_score' | 'enrollment_date' | 'last_updated';
  sortOrder?: 'asc' | 'desc';
}
