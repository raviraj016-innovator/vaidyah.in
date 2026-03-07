/**
 * Patient-related type definitions for the Vaidyah healthcare platform.
 * Covers patient demographics, medical history, and vitals.
 */

/** Biological sex as recorded for medical purposes */
export type BiologicalSex = 'male' | 'female' | 'intersex' | 'unknown';

/** Blood group with Rh factor */
export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'unknown';

/** Government-issued ID types accepted in India */
export type GovernmentIdType = 'aadhaar' | 'pan' | 'voter_id' | 'ration_card' | 'abha';

/** Insurance scheme type */
export type InsuranceScheme =
  | 'ayushman_bharat'
  | 'esi'
  | 'cghs'
  | 'state_scheme'
  | 'private'
  | 'none';

/** Address structure following Indian postal conventions */
export interface Address {
  line1: string;
  line2?: string;
  village?: string;
  tehsil?: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
}

/** Emergency contact information */
export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
}

/** Known allergy record */
export interface Allergy {
  id: string;
  allergen: string;
  type: 'drug' | 'food' | 'environmental' | 'other';
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  reaction: string;
  onsetDate?: string;
  confirmedBy?: string;
  icdCode?: string;
}

/** Chronic condition record */
export interface ChronicCondition {
  id: string;
  name: string;
  icdCode: string;
  diagnosedDate?: string;
  status: 'active' | 'resolved' | 'in_remission';
  managedBy?: string;
  medications?: string[];
  notes?: string;
}

/** Immunization record */
export interface Immunization {
  id: string;
  vaccine: string;
  dateAdministered: string;
  doseNumber: number;
  totalDoses: number;
  batchNumber?: string;
  administeredBy?: string;
  facility?: string;
  nextDueDate?: string;
}

/** Medication currently being taken */
export interface CurrentMedication {
  id: string;
  name: string;
  genericName: string;
  dosage: string;
  frequency: string;
  route: 'oral' | 'topical' | 'injection' | 'inhalation' | 'sublingual' | 'rectal' | 'iv' | 'im' | 'sc' | 'other';
  prescribedBy?: string;
  startDate: string;
  endDate?: string;
  reason?: string;
  isActive: boolean;
}

/** Surgical history record */
export interface SurgicalHistory {
  id: string;
  procedure: string;
  date: string;
  hospital?: string;
  surgeon?: string;
  outcome?: string;
  complications?: string;
  notes?: string;
}

/** Family medical history entry */
export interface FamilyHistory {
  relationship: 'father' | 'mother' | 'sibling' | 'grandparent_paternal' | 'grandparent_maternal' | 'other';
  condition: string;
  icdCode?: string;
  ageOfOnset?: number;
  isDeceased?: boolean;
  causeOfDeath?: string;
}

/** Complete patient medical history */
export interface PatientHistory {
  patientId: string;
  allergies: Allergy[];
  chronicConditions: ChronicCondition[];
  immunizations: Immunization[];
  currentMedications: CurrentMedication[];
  surgicalHistory: SurgicalHistory[];
  familyHistory: FamilyHistory[];
  socialHistory: {
    smokingStatus: 'never' | 'former' | 'current' | 'unknown';
    alcoholUse: 'never' | 'occasional' | 'moderate' | 'heavy' | 'unknown';
    tobaccoChewing: 'never' | 'former' | 'current' | 'unknown';
    occupation?: string;
    dietType?: 'vegetarian' | 'non_vegetarian' | 'vegan' | 'eggetarian';
    exerciseFrequency?: 'sedentary' | 'light' | 'moderate' | 'active';
    sleepHoursPerNight?: number;
  };
  obstetricHistory?: {
    gravida: number;
    para: number;
    abortions: number;
    livingChildren: number;
    lastMenstrualPeriod?: string;
    expectedDeliveryDate?: string;
    highRiskFactors?: string[];
  };
  lastUpdated: string;
  updatedBy: string;
}

/** Single vitals reading, timestamped */
export interface VitalsReading {
  id: string;
  patientId: string;
  consultationId?: string;
  timestamp: string;
  recordedBy: string;

  /** Temperature in Celsius */
  temperature?: {
    value: number;
    unit: 'celsius';
    method: 'oral' | 'axillary' | 'tympanic' | 'rectal' | 'temporal';
  };

  /** Blood pressure in mmHg */
  bloodPressure?: {
    systolic: number;
    diastolic: number;
    position: 'sitting' | 'standing' | 'supine';
    arm: 'left' | 'right';
  };

  /** Heart rate in beats per minute */
  heartRate?: {
    value: number;
    rhythm: 'regular' | 'irregular';
    method: 'manual' | 'pulse_oximeter' | 'ecg';
  };

  /** Respiratory rate in breaths per minute */
  respiratoryRate?: {
    value: number;
  };

  /** Oxygen saturation as percentage */
  spO2?: {
    value: number;
    isOnSupplementalOxygen: boolean;
    oxygenFlowRate?: number;
  };

  /** Blood glucose in mg/dL */
  bloodGlucose?: {
    value: number;
    type: 'fasting' | 'random' | 'postprandial';
  };

  /** Weight in kilograms */
  weight?: {
    value: number;
    unit: 'kg';
  };

  /** Height in centimeters */
  height?: {
    value: number;
    unit: 'cm';
  };

  /** Body Mass Index (calculated) */
  bmi?: number;

  /** Pain score on 0-10 numeric rating scale */
  painScore?: {
    value: number;
    location?: string;
    type?: 'sharp' | 'dull' | 'burning' | 'throbbing' | 'cramping' | 'aching';
  };

  /** MUAC - Mid Upper Arm Circumference in cm (for malnutrition screening) */
  muac?: {
    value: number;
    unit: 'cm';
  };

  /** Glasgow Coma Scale */
  gcs?: {
    eye: number;
    verbal: number;
    motor: number;
    total: number;
  };

  /** Additional notes */
  notes?: string;
}

/** Core patient record */
export interface Patient {
  id: string;
  abhaId?: string;
  healthCenterId: string;
  registrationDate: string;

  /** Demographics */
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  approximateAge?: number;
  isAgeDobApproximate: boolean;
  sex: BiologicalSex;
  gender?: string;
  bloodGroup: BloodGroup;
  maritalStatus?: 'single' | 'married' | 'widowed' | 'divorced' | 'separated';

  /** Contact */
  phone: string;
  alternatePhone?: string;
  email?: string;
  address: Address;
  preferredLanguage: string;

  /** Identification */
  governmentId?: {
    type: GovernmentIdType;
    number: string;
    verified: boolean;
  };

  /** Insurance */
  insurance: {
    scheme: InsuranceScheme;
    policyNumber?: string;
    validUntil?: string;
    coverageDetails?: string;
  };

  /** Emergency contact */
  emergencyContact: EmergencyContact;

  /** Photo for identification */
  photoUrl?: string;

  /** Medical summary (quick-access fields) */
  allergySummary: string[];
  activeConditions: string[];
  currentMedicationCount: number;

  /** Metadata */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastVisitDate?: string;
  totalVisits: number;
}
