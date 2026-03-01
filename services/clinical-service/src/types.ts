/**
 * Clinical Intelligence Service - Type definitions.
 * Local types for triage, SOAP, symptom checking, diagnosis, and emergency alerts.
 */

import { Request } from 'express';

// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'nurse' | 'doctor' | 'admin' | 'system';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  facilityId?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  requestId: string;
}

// ─── API Response ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

// ─── Vitals ──────────────────────────────────────────────────────────────────

export interface Vitals {
  temperature?: number;       // Celsius
  bp_systolic?: number;       // mmHg
  bp_diastolic?: number;      // mmHg
  spo2?: number;              // percentage
  pulse?: number;             // beats per minute
  respiratory_rate?: number;  // breaths per minute
  weight?: number;            // kg
  height?: number;            // cm
  blood_glucose?: number;     // mg/dL
  pain_score?: number;        // 0-10 NRS
}

// ─── Symptom ─────────────────────────────────────────────────────────────────

export type SymptomSeverity = 'mild' | 'moderate' | 'severe';

export interface SymptomInput {
  name: string;
  body_system?: string;
  severity: SymptomSeverity;
  duration?: string;
  onset?: 'sudden' | 'gradual';
  frequency?: 'constant' | 'intermittent' | 'episodic';
  aggravating_factors?: string[];
  relieving_factors?: string[];
  associated_symptoms?: string[];
}

export interface SymptomWithFlags extends SymptomInput {
  is_red_flag: boolean;
  red_flag_reason?: string;
  urgency_weight: number;
}

// ─── Triage ──────────────────────────────────────────────────────────────────

/** A = minor/non-urgent, B = consult/urgent, C = emergency/immediate */
export type TriageLevel = 'A' | 'B' | 'C';

export interface TriageInput {
  symptoms: SymptomInput[];
  vitals: Vitals;
  age: number;
  gender: 'male' | 'female' | 'other';
  medical_history: MedicalHistory;
  chief_complaint?: string;
  prosody_scores?: ProsodyScores;
}

export interface TriageScoringDetail {
  factor: string;
  score: number;
  max_score: number;
  source: 'red_flag' | 'vitals' | 'symptoms' | 'age' | 'comorbidity' | 'prosody';
  detail: string;
}

export interface TriageResult {
  session_id: string;
  triage_level: TriageLevel;
  urgency_score: number;          // 0-100, higher = more urgent
  needs_immediate_attention: boolean;
  scoring_breakdown: TriageScoringDetail[];
  red_flags: RedFlagAlert[];
  recommended_action: string;
  recommended_wait_minutes: number;
  clinical_impression: string;
  assessed_at: string;
  is_ai_assisted: boolean;
}

export interface RedFlagAlert {
  flag: string;
  severity: 'warning' | 'critical';
  recommendation: string;
  source: string;
}

// ─── Medical History ─────────────────────────────────────────────────────────

export interface MedicalHistory {
  conditions: string[];
  allergies: string[];
  medications: string[];
  surgeries: string[];
  family_history: string[];
  smoking_status?: 'never' | 'former' | 'current';
  alcohol_use?: 'never' | 'occasional' | 'moderate' | 'heavy';
  tobacco_chewing?: 'never' | 'former' | 'current';
}

// ─── Prosody ─────────────────────────────────────────────────────────────────

export interface ProsodyScores {
  distress: number;       // 0-1
  pain: number;           // 0-1
  anxiety: number;        // 0-1
  breathlessness: number; // 0-1
  fatigue: number;        // 0-1
  confidence: number;     // 0-1
}

// ─── SOAP Note ───────────────────────────────────────────────────────────────

export interface SOAPNote {
  id: string;
  session_id: string;
  subjective: SOAPSubjective;
  objective: SOAPObjective;
  assessment: SOAPAssessment;
  plan: SOAPPlan;
  generated_at: string;
  generated_by: string;
  is_ai_generated: boolean;
  is_reviewed: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  version: number;
}

export interface SOAPSubjective {
  chief_complaint: string;
  history_of_present_illness: string;
  patient_narrative: string;
  review_of_systems: Record<string, string[]>;
  reported_symptoms: SymptomInput[];
  pain_description?: string;
  functional_limitations?: string[];
}

export interface SOAPObjective {
  vitals: Vitals;
  general_appearance: string;
  physical_examination: Record<string, string>;
  prosody_analysis?: ProsodyScores;
  emotional_state?: string;
  relevant_lab_results?: string[];
}

export interface SOAPAssessment {
  primary_diagnosis: DiagnosisEntry;
  differential_diagnoses: DiagnosisEntry[];
  clinical_reasoning: string;
  contradiction_flags: ContradictionFlag[];
  risk_factors: string[];
  prognosis?: string;
}

export interface SOAPPlan {
  treatment_recommendations: string[];
  prescriptions: PrescriptionItem[];
  investigations: InvestigationItem[];
  referral?: ReferralInfo;
  follow_up_date?: string;
  follow_up_instructions?: string;
  patient_education: string[];
  patient_education_localized?: string[];
  dietary_advice?: string[];
  lifestyle_modifications?: string[];
  warning_signs: string[];
}

export interface ContradictionFlag {
  reported_value: string;
  observed_value: string;
  type: 'vitals_vs_report' | 'prosody_vs_report' | 'history_vs_report' | 'symptom_inconsistency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  explanation: string;
}

// ─── Diagnosis ───────────────────────────────────────────────────────────────

export interface DiagnosisEntry {
  condition_name: string;
  icd10_code: string;
  confidence: number;            // 0-1
  type: 'primary' | 'secondary' | 'differential' | 'ruled_out';
  severity: 'mild' | 'moderate' | 'severe' | 'critical';
  supporting_evidence: string[];
  contradicting_evidence: string[];
  recommended_tests: string[];
  basis: string;
}

export interface DifferentialDiagnosisResult {
  session_id: string;
  diagnoses: DiagnosisEntry[];
  clinical_summary: string;
  data_quality_notes: string[];
  generated_at: string;
  is_ai_assisted: boolean;
}

// ─── Symptom Checker ─────────────────────────────────────────────────────────

export interface SymptomCheckInput {
  symptoms: string[];
  age: number;
  gender: 'male' | 'female' | 'other';
  medical_history?: MedicalHistory;
}

export interface ConditionMatch {
  condition_name: string;
  icd10_code: string;
  probability: number;           // 0-1
  matching_symptoms: string[];
  missing_key_symptoms: string[];
  severity_indicator: 'low' | 'moderate' | 'high' | 'critical';
  seek_care_urgency: 'routine' | 'soon' | 'urgent' | 'emergency';
  common_in_region: boolean;     // Common in Indian rural setting
  brief_description: string;
}

export interface SymptomCheckResult {
  possible_conditions: ConditionMatch[];
  red_flags_detected: RedFlagAlert[];
  recommendations: string[];
  disclaimer: string;
}

// ─── Prescription & Investigation ────────────────────────────────────────────

export interface PrescriptionItem {
  drug_name: string;
  generic_name: string;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
  instructions: string;
  is_essential_medicine: boolean;  // From India NLEM list
}

export interface InvestigationItem {
  test_name: string;
  test_code?: string;
  urgency: 'routine' | 'urgent' | 'stat';
  reason: string;
  fasting_required: boolean;
  special_instructions?: string;
}

export interface ReferralInfo {
  to_specialty: string;
  to_facility?: string;
  urgency: 'immediate' | 'urgent' | 'soon' | 'routine';
  reason: string;
  clinical_summary: string;
}

// ─── Emergency ───────────────────────────────────────────────────────────────

export type EmergencyAlertType = 'cardiac' | 'respiratory' | 'trauma' | 'obstetric' | 'pediatric' | 'stroke' | 'poisoning' | 'snakebite' | 'other';

export type EmergencyAlertStatus = 'created' | 'dispatched' | 'en_route' | 'arrived' | 'resolved' | 'cancelled';

export interface EmergencyAlertInput {
  session_id?: string;
  patient_id: string;
  center_id: string;
  alert_type: EmergencyAlertType;
  severity: 'critical' | 'high';
  clinical_summary: string;
  vitals?: Vitals;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  emergency_contacts?: Array<{
    name: string;
    phone: string;
    relationship: string;
  }>;
}

export interface EmergencyAlert {
  id: string;
  session_id?: string;
  patient_id: string;
  center_id: string;
  alert_type: EmergencyAlertType;
  severity: 'critical' | 'high';
  status: EmergencyAlertStatus;
  clinical_summary: string;
  vitals?: Vitals;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  ambulance_dispatch?: AmbulanceDispatch;
  referral_hospital?: ReferralHospitalInfo;
  notifications_sent: NotificationRecord[];
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

export interface AmbulanceDispatch {
  ambulance_id: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  emt_name?: string;
  estimated_arrival_minutes: number;
  dispatched_at: string;
  status: 'dispatched' | 'en_route' | 'arrived';
}

export interface ReferralHospitalInfo {
  hospital_id: string;
  hospital_name: string;
  distance_km: number;
  specialties: string[];
  bed_available: boolean;
  contact_phone: string;
  notified_at: string;
  accepted: boolean;
}

export interface NotificationRecord {
  recipient: string;
  recipient_phone: string;
  method: 'sms' | 'whatsapp' | 'call';
  status: 'sent' | 'delivered' | 'failed';
  sent_at: string;
  message_summary: string;
}

// ─── Session Data (from DB) ─────────────────────────────────────────────────

export interface SessionData {
  id: string;
  patient_id: string;
  nurse_id: string | null;
  doctor_id: string | null;
  center_id: string;
  status: string;
  triage_level: TriageLevel | null;
  urgency: string;
  vitals: Vitals;
  symptoms: SymptomInput[];
  transcript: string | null;
  transcript_original: string | null;
  language: string;
  soap_note: SOAPNote | null;
  diagnosis: DiagnosisEntry[];
  contradictions: ContradictionFlag[];
  prosody_scores: ProsodyScores | null;
  prescription: unknown;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Patient Data (from DB) ─────────────────────────────────────────────────

export interface PatientData {
  id: string;
  abdm_id: string | null;
  name: string;
  age: number;
  gender: string;
  date_of_birth: string | null;
  phone: string | null;
  language_pref: string;
  blood_group: string | null;
  medical_history: MedicalHistory;
  emergency_contact: {
    name: string;
    phone: string;
    relationship: string;
  } | null;
}

// ─── NLU Service ─────────────────────────────────────────────────────────────

export interface NLUSymptomExtractionRequest {
  text: string;
  language: string;
  context?: string;
}

export interface NLUSymptomExtractionResponse {
  symptoms: SymptomInput[];
  chief_complaint: string;
  confidence: number;
}

export interface NLUGenerationRequest {
  prompt: string;
  context: Record<string, unknown>;
  max_tokens?: number;
  temperature?: number;
}

export interface NLUGenerationResponse {
  text: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
