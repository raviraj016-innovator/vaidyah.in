/**
 * Consultation-related type definitions for the Vaidyah healthcare platform.
 * Covers consultations, triage, SOAP notes, prosody analysis, and diagnoses.
 */

import type { VitalsReading } from './patient';

/** Triage classification as per Indian Public Health Standards */
export type TriageCategory = 'A' | 'B' | 'C';

/** Consultation status lifecycle */
export type ConsultationStatus =
  | 'scheduled'
  | 'waiting'
  | 'triage_in_progress'
  | 'in_progress'
  | 'pending_review'
  | 'completed'
  | 'cancelled'
  | 'referred'
  | 'follow_up_required';

/** Consultation mode */
export type ConsultationMode = 'in_person' | 'teleconsultation' | 'home_visit' | 'camp';

/** Referral urgency level */
export type ReferralUrgency = 'immediate' | 'urgent' | 'soon' | 'routine';

/** Disposition outcome of the consultation */
export type DispositionOutcome =
  | 'treated_and_discharged'
  | 'referred_higher_center'
  | 'admitted'
  | 'follow_up_scheduled'
  | 'left_against_advice'
  | 'deceased';

/** Prosody analysis scores derived from voice analysis */
export interface ProsodyScores {
  /** Overall distress level (0.0 to 1.0) */
  distressLevel: number;

  /** Pain indicators from vocal patterns (0.0 to 1.0) */
  painIndicator: number;

  /** Anxiety indicators from speech patterns (0.0 to 1.0) */
  anxietyIndicator: number;

  /** Speech rate (words per minute, approximate) */
  speechRate: number;

  /** Vocal tremor presence (0.0 to 1.0) */
  vocalTremor: number;

  /** Breathlessness indicator from speech fragmentation (0.0 to 1.0) */
  breathlessnessIndicator: number;

  /** Fatigue indicator from vocal energy (0.0 to 1.0) */
  fatigueIndicator: number;

  /** Confidence in the prosody analysis (0.0 to 1.0) */
  confidence: number;

  /** Language detected during analysis */
  detectedLanguage: string;

  /** Duration of analyzed audio in seconds */
  audioDurationSeconds: number;

  /** Timestamp of analysis */
  analyzedAt: string;

  /** Model version used for analysis */
  modelVersion: string;
}

/** Contradiction detected between reported symptoms and observed/measured data */
export interface Contradiction {
  id: string;

  /** What the patient reported verbally */
  reportedValue: string;

  /** What was observed or measured */
  observedValue: string;

  /** Type of contradiction */
  type:
    | 'vitals_vs_report'
    | 'prosody_vs_report'
    | 'history_vs_report'
    | 'symptom_inconsistency'
    | 'medication_conflict'
    | 'temporal_inconsistency';

  /** Severity of the contradiction */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Explanation of why this is flagged */
  explanation: string;

  /** Suggested follow-up action */
  suggestedAction: string;

  /** Confidence in the contradiction detection (0.0 to 1.0) */
  confidence: number;

  /** Source that detected the contradiction */
  source: 'ai_engine' | 'rule_based' | 'clinician';

  /** Whether a clinician has reviewed this flag */
  isReviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

/** Individual symptom as reported/observed */
export interface Symptom {
  name: string;
  bodySystem: string;
  severity: 'mild' | 'moderate' | 'severe';
  duration?: string;
  onset?: 'sudden' | 'gradual';
  frequency?: 'constant' | 'intermittent' | 'episodic';
  aggravatingFactors?: string[];
  relievingFactors?: string[];
  associatedSymptoms?: string[];
  isRedFlag: boolean;
  icdCode?: string;
}

/** Single diagnosis entry with ICD-10 coding */
export interface DiagnosisEntry {
  id: string;

  /** ICD-10 code */
  icdCode: string;

  /** Human-readable diagnosis name */
  name: string;

  /** Diagnosis in the patient's preferred language */
  nameLocalized?: string;

  /** Whether this is a primary or secondary diagnosis */
  type: 'primary' | 'secondary' | 'differential' | 'ruled_out';

  /** Confidence in the diagnosis (0.0 to 1.0, AI-assisted) */
  confidence?: number;

  /** Clinical basis for the diagnosis */
  basis: string;

  /** Severity classification */
  severity: 'mild' | 'moderate' | 'severe' | 'critical';

  /** Whether this is a new or pre-existing condition */
  chronicity: 'acute' | 'chronic' | 'acute_on_chronic' | 'recurrent';

  /** Status of the diagnosis */
  status: 'provisional' | 'confirmed' | 'ruled_out';

  /** Notes from the clinician */
  notes?: string;
}

/** Prescription entry for a single medication */
export interface PrescriptionEntry {
  id: string;
  drugName: string;
  genericName: string;
  dosage: string;
  dosageUnit: string;
  frequency: string;
  route: 'oral' | 'topical' | 'injection' | 'inhalation' | 'sublingual' | 'rectal' | 'iv' | 'im' | 'sc' | 'other';
  duration: string;
  quantity: number;
  instructions: string;
  instructionsLocalized?: string;
  beforeAfterFood: 'before' | 'after' | 'with' | 'not_applicable';
  isSubstitutable: boolean;
  isCritical: boolean;
  warnings?: string[];
  contraindications?: string[];
}

/** Investigation/lab test ordered */
export interface InvestigationOrder {
  id: string;
  testName: string;
  testCode?: string;
  urgency: 'routine' | 'urgent' | 'stat';
  reason: string;
  specialInstructions?: string;
  fasting: boolean;
  status: 'ordered' | 'sample_collected' | 'in_progress' | 'completed' | 'cancelled';
  results?: string;
  resultDate?: string;
}

/** SOAP note structure (Subjective, Objective, Assessment, Plan) */
export interface SOAPNote {
  /** Subjective: patient's reported complaints and history */
  subjective: {
    chiefComplaint: string;
    chiefComplaintLocalized?: string;
    historyOfPresentIllness: string;
    reviewOfSystems: Record<string, string[]>;
    reportedSymptoms: Symptom[];
    patientNarrative?: string;
    narrativeLanguage?: string;
    painDescription?: string;
    functionalLimitations?: string[];
  };

  /** Objective: measurable/observable findings */
  objective: {
    vitals: VitalsReading;
    generalAppearance: string;
    physicalExamination: Record<string, string>;
    prosodyAnalysis?: ProsodyScores;
    relevantLabResults?: string[];
    imagingFindings?: string[];
  };

  /** Assessment: diagnoses and clinical reasoning */
  assessment: {
    diagnoses: DiagnosisEntry[];
    differentialDiagnoses?: DiagnosisEntry[];
    clinicalReasoning: string;
    contradictions: Contradiction[];
    riskFactors: string[];
    prognosis?: string;
  };

  /** Plan: treatment and follow-up */
  plan: {
    prescriptions: PrescriptionEntry[];
    investigations: InvestigationOrder[];
    procedures?: string[];
    nonPharmacological?: string[];
    patientEducation: string[];
    patientEducationLocalized?: string[];
    followUpDate?: string;
    followUpInstructions?: string;
    referral?: {
      to: string;
      facility?: string;
      urgency: ReferralUrgency;
      reason: string;
      clinicalSummary: string;
    };
    dietaryAdvice?: string[];
    lifestyleModifications?: string[];
    warningSignsToWatch: string[];
    warningSignsLocalized?: string[];
  };
}

/** Triage result after initial assessment */
export interface TriageResult {
  id: string;
  consultationId: string;
  patientId: string;
  performedBy: string;
  performedAt: string;

  /** Classification: A (immediate), B (urgent), C (non-urgent) */
  category: TriageCategory;

  /** Urgency score (0-100, higher = more urgent) */
  urgencyScore: number;

  /** Factors that contributed to the triage decision */
  contributingFactors: {
    factor: string;
    weight: number;
    source: 'vitals' | 'symptoms' | 'history' | 'age' | 'prosody' | 'red_flag' | 'rule_based';
  }[];

  /** Red flags detected */
  redFlags: {
    flag: string;
    severity: 'warning' | 'critical';
    recommendation: string;
  }[];

  /** Recommended waiting time in minutes */
  recommendedWaitMinutes: number;

  /** Whether triage was AI-assisted */
  isAiAssisted: boolean;
  aiModelVersion?: string;

  /** Override information if category was manually changed */
  override?: {
    originalCategory: TriageCategory;
    overriddenBy: string;
    reason: string;
    overriddenAt: string;
  };

  /** Vital signs at triage */
  triageVitals: VitalsReading;

  /** Brief clinical impression */
  clinicalImpression: string;

  /** Whether patient needs immediate attention */
  needsImmediateAttention: boolean;
}

/** Complete consultation record */
export interface Consultation {
  id: string;
  patientId: string;
  healthCenterId: string;

  /** Consultation details */
  status: ConsultationStatus;
  mode: ConsultationMode;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;

  /** Queue management */
  tokenNumber?: string;
  queuePosition?: number;

  /** Clinical staff */
  primaryClinician: string;
  assistingStaff?: string[];
  supervisingDoctor?: string;

  /** Language used during consultation */
  consultationLanguage: string;
  interpreterUsed: boolean;

  /** Triage */
  triageResult?: TriageResult;

  /** Clinical documentation */
  soapNote?: SOAPNote;

  /** AI-generated summary for the patient in their language */
  patientSummary?: {
    content: string;
    language: string;
    generatedAt: string;
  };

  /** Audio/video recording reference */
  recordings?: {
    id: string;
    type: 'audio' | 'video';
    startTime: string;
    endTime: string;
    storageUrl: string;
    transcriptionUrl?: string;
    consentObtained: boolean;
  }[];

  /** Disposition */
  disposition?: {
    outcome: DispositionOutcome;
    notes?: string;
    followUpDate?: string;
    referralFacility?: string;
  };

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastModifiedBy: string;

  /** Version for optimistic concurrency */
  version: number;
}
