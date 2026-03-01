/**
 * API request/response type definitions for the Vaidyah healthcare platform.
 * Standardized envelope types for all API communication.
 */

import type { Patient, PatientHistory, VitalsReading } from './patient';
import type {
  Consultation,
  TriageResult,
  SOAPNote,
  DiagnosisEntry,
  ProsodyScores,
  Contradiction,
  PrescriptionEntry,
  InvestigationOrder,
  Symptom,
} from './consultation';
import type { User, UserRole, HealthCenter } from './user';
import type { ClinicalTrial, TrialMatch, TrialEligibility, TrialSearchFilters } from './trial';

// ---------------------------------------------------------------------------
// Generic API envelope types
// ---------------------------------------------------------------------------

/** Standard API success response */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
  requestId: string;
  timestamp: string;
}

/** Paginated API response */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  message?: string;
  requestId: string;
  timestamp: string;
}

/** Standard API error response */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
    stack?: string;
  };
  requestId: string;
  timestamp: string;
}

/** Union type for any API response */
export type ApiResult<T> = ApiResponse<T> | ErrorResponse;

/** Union type for any paginated API response */
export type PaginatedResult<T> = PaginatedResponse<T> | ErrorResponse;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface LoginRequest {
  phone: string;
  otp: string;
  deviceId: string;
  deviceInfo?: {
    platform: 'android' | 'ios' | 'web';
    osVersion: string;
    appVersion: string;
    model?: string;
  };
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestOtpRequest {
  phone: string;
  purpose: 'login' | 'registration' | 'password_reset';
}

export interface RequestOtpResponse {
  otpSent: boolean;
  expiresInSeconds: number;
  retryAfterSeconds: number;
}

// ---------------------------------------------------------------------------
// Patient
// ---------------------------------------------------------------------------

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  approximateAge?: number;
  isAgeDobApproximate: boolean;
  sex: Patient['sex'];
  bloodGroup?: Patient['bloodGroup'];
  phone: string;
  alternatePhone?: string;
  address: Patient['address'];
  preferredLanguage: string;
  governmentId?: Patient['governmentId'];
  insurance?: Patient['insurance'];
  emergencyContact: Patient['emergencyContact'];
  photoBase64?: string;
}

export interface UpdatePatientRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  alternatePhone?: string;
  address?: Partial<Patient['address']>;
  preferredLanguage?: string;
  governmentId?: Patient['governmentId'];
  insurance?: Patient['insurance'];
  emergencyContact?: Partial<Patient['emergencyContact']>;
  photoBase64?: string;
}

export interface PatientSearchRequest {
  query?: string;
  phone?: string;
  abhaId?: string;
  governmentIdNumber?: string;
  name?: string;
  district?: string;
  healthCenterId?: string;
  page?: number;
  pageSize?: number;
}

export interface PatientListResponse {
  patients: Patient[];
}

export interface PatientDetailResponse {
  patient: Patient;
  history: PatientHistory;
  recentVitals: VitalsReading[];
  activeConsultations: Consultation[];
  upcomingAppointments: {
    id: string;
    scheduledAt: string;
    purpose: string;
    clinician: string;
  }[];
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

export interface RecordVitalsRequest {
  patientId: string;
  consultationId?: string;
  temperature?: VitalsReading['temperature'];
  bloodPressure?: VitalsReading['bloodPressure'];
  heartRate?: VitalsReading['heartRate'];
  respiratoryRate?: VitalsReading['respiratoryRate'];
  spO2?: VitalsReading['spO2'];
  bloodGlucose?: VitalsReading['bloodGlucose'];
  weight?: VitalsReading['weight'];
  height?: VitalsReading['height'];
  painScore?: VitalsReading['painScore'];
  muac?: VitalsReading['muac'];
  gcs?: VitalsReading['gcs'];
  notes?: string;
}

export interface VitalsHistoryRequest {
  patientId: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface VitalsTrendResponse {
  patientId: string;
  readings: VitalsReading[];
  trends: {
    metric: string;
    direction: 'improving' | 'stable' | 'worsening';
    percentageChange?: number;
    alerts?: string[];
  }[];
}

// ---------------------------------------------------------------------------
// Consultation
// ---------------------------------------------------------------------------

export interface CreateConsultationRequest {
  patientId: string;
  healthCenterId: string;
  mode: Consultation['mode'];
  scheduledAt?: string;
  primaryClinician: string;
  consultationLanguage: string;
  chiefComplaint?: string;
}

export interface UpdateConsultationStatusRequest {
  status: Consultation['status'];
  notes?: string;
}

export interface ConsultationListRequest {
  healthCenterId?: string;
  clinicianId?: string;
  patientId?: string;
  status?: Consultation['status'][];
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ConsultationSummaryResponse {
  consultation: Consultation;
  patient: Patient;
  clinician: Pick<User, 'id' | 'displayName' | 'role' | 'specialization'>;
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

export interface PerformTriageRequest {
  consultationId: string;
  patientId: string;
  vitals: RecordVitalsRequest;
  reportedSymptoms: Symptom[];
  chiefComplaint: string;
  chiefComplaintLanguage: string;
  audioRecordingUrl?: string;
  useAiAssist: boolean;
}

export interface TriageResponse {
  triageResult: TriageResult;
  suggestedActions: string[];
  warningMessages: string[];
}

export interface TriageOverrideRequest {
  triageResultId: string;
  newCategory: TriageResult['category'];
  reason: string;
}

// ---------------------------------------------------------------------------
// SOAP Note & Diagnosis
// ---------------------------------------------------------------------------

export interface SaveSOAPNoteRequest {
  consultationId: string;
  soapNote: Partial<SOAPNote>;
  isDraft: boolean;
}

export interface AddDiagnosisRequest {
  consultationId: string;
  diagnosis: Omit<DiagnosisEntry, 'id'>;
}

export interface UpdateDiagnosisRequest {
  diagnosisId: string;
  updates: Partial<DiagnosisEntry>;
}

export interface DiagnosisSuggestionRequest {
  symptoms: Symptom[];
  vitals: VitalsReading;
  patientAge: number;
  patientSex: string;
  medicalHistory?: string[];
}

export interface DiagnosisSuggestionResponse {
  suggestions: {
    diagnosis: DiagnosisEntry;
    confidence: number;
    reasoning: string;
    supportingEvidence: string[];
    differentialConsiderations: string[];
  }[];
  modelVersion: string;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Prosody & Contradiction Analysis
// ---------------------------------------------------------------------------

export interface AnalyzeProsodyRequest {
  consultationId: string;
  audioUrl: string;
  audioFormat: 'wav' | 'mp3' | 'ogg' | 'webm';
  language: string;
  durationSeconds: number;
}

export interface ProsodyAnalysisResponse {
  scores: ProsodyScores;
  transcript?: string;
  keyMoments?: {
    timestampSeconds: number;
    event: string;
    severity: 'low' | 'medium' | 'high';
  }[];
}

export interface DetectContradictionsRequest {
  consultationId: string;
  patientId: string;
  reportedSymptoms: Symptom[];
  vitals: VitalsReading;
  prosodyScores?: ProsodyScores;
  patientHistory?: PatientHistory;
}

export interface ContradictionDetectionResponse {
  contradictions: Contradiction[];
  overallConsistencyScore: number;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

export interface CreatePrescriptionRequest {
  consultationId: string;
  prescriptions: Omit<PrescriptionEntry, 'id'>[];
}

export interface DrugInteractionCheckRequest {
  newDrug: string;
  currentMedications: string[];
  allergies: string[];
  patientAge: number;
  patientWeight?: number;
  renalFunction?: string;
  hepaticFunction?: string;
}

export interface DrugInteractionCheckResponse {
  interactions: {
    drug1: string;
    drug2: string;
    severity: 'minor' | 'moderate' | 'major' | 'contraindicated';
    description: string;
    recommendation: string;
  }[];
  allergyConflicts: {
    drug: string;
    allergen: string;
    severity: string;
    recommendation: string;
  }[];
  dosageWarnings: {
    drug: string;
    warning: string;
    adjustedDose?: string;
  }[];
  isSafe: boolean;
}

// ---------------------------------------------------------------------------
// Investigation / Lab
// ---------------------------------------------------------------------------

export interface OrderInvestigationRequest {
  consultationId: string;
  orders: Omit<InvestigationOrder, 'id' | 'status' | 'results' | 'resultDate'>[];
}

export interface SubmitLabResultRequest {
  orderId: string;
  results: string;
  normalRange?: string;
  isAbnormal: boolean;
  criticalValue?: boolean;
  notes?: string;
  attachmentUrls?: string[];
}

// ---------------------------------------------------------------------------
// Clinical Trials
// ---------------------------------------------------------------------------

export interface SearchTrialsRequest extends TrialSearchFilters {}

export interface SearchTrialsResponse {
  trials: ClinicalTrial[];
}

export interface MatchPatientToTrialsRequest {
  patientId: string;
  conditionFocus?: string[];
  maxDistance?: number;
  maxResults?: number;
}

export interface MatchPatientToTrialsResponse {
  matches: TrialMatch[];
  totalEvaluated: number;
  matchedCount: number;
  searchCriteria: {
    conditions: string[];
    location: string;
    radius: number;
  };
}

export interface EvaluateTrialEligibilityRequest {
  patientId: string;
  trialId: string;
  additionalData?: Record<string, string | number | boolean>;
}

export interface EvaluateTrialEligibilityResponse {
  eligibility: TrialEligibility;
  trial: ClinicalTrial;
  patient: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'dateOfBirth' | 'sex'>;
}

export interface UpdateTrialMatchStatusRequest {
  matchId: string;
  status: TrialMatch['status'];
  notes?: string;
  declineReason?: string;
}

// ---------------------------------------------------------------------------
// Referral
// ---------------------------------------------------------------------------

export interface CreateReferralRequest {
  consultationId: string;
  patientId: string;
  referToFacilityId: string;
  referToSpecialization?: string;
  urgency: 'immediate' | 'urgent' | 'soon' | 'routine';
  reason: string;
  clinicalSummary: string;
  investigationsSummary?: string;
  currentMedications?: string;
}

export interface ReferralResponse {
  referralId: string;
  referralCode: string;
  status: 'created' | 'sent' | 'accepted' | 'rejected' | 'completed';
  estimatedResponseTime?: string;
}

// ---------------------------------------------------------------------------
// Reports & Analytics
// ---------------------------------------------------------------------------

export interface DashboardRequest {
  healthCenterId: string;
  dateRange: {
    from: string;
    to: string;
  };
}

export interface DashboardResponse {
  summary: {
    totalPatients: number;
    newPatientsToday: number;
    activeConsultations: number;
    completedToday: number;
    pendingTriage: number;
    referralsMade: number;
    avgWaitTimeMinutes: number;
  };
  triageBreakdown: {
    categoryA: number;
    categoryB: number;
    categoryC: number;
  };
  topConditions: {
    icdCode: string;
    name: string;
    count: number;
  }[];
  staffWorkload: {
    userId: string;
    name: string;
    consultationsToday: number;
    avgConsultationMinutes: number;
  }[];
  alertsAndFlags: {
    type: 'critical_patient' | 'supply_shortage' | 'staff_shortage' | 'system_alert';
    message: string;
    severity: 'info' | 'warning' | 'critical';
    timestamp: string;
  }[];
}

// ---------------------------------------------------------------------------
// User & Health Center Management
// ---------------------------------------------------------------------------

export interface CreateUserRequest {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  qualification: string;
  registrationNumber?: string;
  registrationCouncil?: string;
  specialization?: string;
  primaryHealthCenterId: string;
  preferredLanguage: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  qualification?: string;
  specialization?: string;
  primaryHealthCenterId?: string;
  additionalHealthCenterIds?: string[];
  preferredLanguage?: string;
  isActive?: boolean;
}

export interface UserListRequest {
  healthCenterId?: string;
  role?: UserRole;
  isActive?: boolean;
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateHealthCenterRequest {
  name: string;
  nameLocal?: string;
  facilityCode: string;
  tier: HealthCenter['tier'];
  address: HealthCenter['address'];
  coordinates?: HealthCenter['coordinates'];
  phone: string;
  email?: string;
  inChargeUserId: string;
  services: HealthCenter['services'];
  languagesSupported: string[];
  referralFacilityIds?: string[];
}

export interface HealthCenterListRequest {
  state?: string;
  district?: string;
  tier?: HealthCenter['tier'];
  status?: HealthCenter['status'];
  hasService?: string;
  nearLocation?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Sync & Offline
// ---------------------------------------------------------------------------

export interface SyncPullRequest {
  deviceId: string;
  lastSyncTimestamp: string;
  entityTypes: ('patient' | 'consultation' | 'vitals' | 'prescription' | 'user')[];
  healthCenterId: string;
}

export interface SyncPullResponse {
  entities: {
    type: string;
    data: unknown[];
    deletedIds: string[];
  }[];
  syncTimestamp: string;
  hasMore: boolean;
}

export interface SyncPushRequest {
  deviceId: string;
  changes: {
    type: string;
    operation: 'create' | 'update' | 'delete';
    data: unknown;
    localId: string;
    timestamp: string;
  }[];
}

export interface SyncPushResponse {
  results: {
    localId: string;
    serverId?: string;
    status: 'success' | 'conflict' | 'error';
    error?: string;
    resolvedData?: unknown;
  }[];
  syncTimestamp: string;
}
