/**
 * Triage rules engine for the Vaidyah clinical triage service.
 *
 * Encodes evidence-based triage logic used across Indian primary healthcare
 * facilities (PHC / CHC). Produces an acuity level and recommended action
 * based on reported symptoms, vitals, and patient demographics.
 */

import type { SymptomEntry, SymptomSeverity } from './symptoms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AcuityLevel = 'emergent' | 'urgent' | 'semi-urgent' | 'non-urgent' | 'self-care';

export interface VitalSigns {
  temperature?: number;       // Celsius
  heartRate?: number;         // bpm
  systolicBP?: number;        // mmHg
  diastolicBP?: number;       // mmHg
  respiratoryRate?: number;   // per minute
  oxygenSaturation?: number;  // percentage
  bloodGlucose?: number;      // mg/dL
}

export interface PatientDemographics {
  ageYears: number;
  gender: 'male' | 'female' | 'other';
  pregnant?: boolean;
  knownConditions?: string[];   // ICD-10 codes
  currentMedications?: string[];
}

export interface TriageInput {
  symptoms: SymptomEntry[];
  severityOverrides?: Record<string, SymptomSeverity>;
  vitals?: VitalSigns;
  patient: PatientDemographics;
  durationDays?: number;
}

export interface TriageRuleResult {
  acuity: AcuityLevel;
  score: number;                // 0-100 (higher = more urgent)
  recommendation: string;
  recommendationHi: string;
  referralNeeded: boolean;
  referralType?: 'CHC' | 'district-hospital' | 'tertiary' | 'specialist';
  redFlagsTriggered: string[];
  reasoning: string[];
}

// ---------------------------------------------------------------------------
// Age-stratified vital sign thresholds
// ---------------------------------------------------------------------------

interface VitalRanges {
  hr: [number, number];
  rr: [number, number];
  sbp: [number, number];
  spo2: number;
}

const PEDIATRIC_VITALS: Record<string, VitalRanges> = {
  neonate_0_28d:  { hr: [100, 180], rr: [30, 60], sbp: [60, 90],  spo2: 92 },
  infant_1_12m:   { hr: [80, 160],  rr: [25, 50], sbp: [70, 100], spo2: 92 },
  toddler_1_3y:   { hr: [80, 140],  rr: [20, 40], sbp: [80, 110], spo2: 94 },
  preschool_3_5y: { hr: [70, 120],  rr: [18, 30], sbp: [85, 110], spo2: 94 },
  child_5_12y:    { hr: [60, 110],  rr: [16, 24], sbp: [90, 120], spo2: 95 },
  adolescent_12y: { hr: [55, 100],  rr: [12, 20], sbp: [100, 140], spo2: 95 },
};

const ADULT_VITALS: VitalRanges = {
  hr: [50, 120], rr: [12, 20], sbp: [90, 180], spo2: 92,
};

const PREGNANT_VITALS: VitalRanges = {
  hr: [60, 110], rr: [12, 24], sbp: [80, 160], spo2: 94,
};

export function getAgeGroup(ageYears: number): string {
  if (ageYears < 0.077) return 'neonate_0_28d';   // < 28 days
  if (ageYears < 1) return 'infant_1_12m';
  if (ageYears < 3) return 'toddler_1_3y';
  if (ageYears < 5) return 'preschool_3_5y';
  if (ageYears < 12) return 'child_5_12y';
  if (ageYears < 18) return 'adolescent_12y';
  return 'adult';
}

function getVitalRanges(patient: PatientDemographics): VitalRanges {
  if (patient.pregnant) return PREGNANT_VITALS;
  const group = getAgeGroup(patient.ageYears);
  if (group === 'adult') return ADULT_VITALS;
  return PEDIATRIC_VITALS[group] ?? ADULT_VITALS;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export interface TriageRule {
  id: string;
  description: string;
  /** Returns score contribution (0-100) if rule matches, or 0 */
  evaluate: (input: TriageInput) => RuleResult;
}

export interface RuleResult {
  score: number;
  triggered: boolean;
  reason?: string;
  redFlag?: string;
}

const RULES: TriageRule[] = [
  // ── Red-flag symptom rule ───────────────────────────────────────────
  {
    id: 'RED_FLAG_SYMPTOMS',
    description: 'Any red-flag symptom present',
    evaluate: (input) => {
      const redFlags = input.symptoms.filter((s) => s.redFlag);
      if (redFlags.length === 0) return { score: 0, triggered: false };
      return {
        score: Math.min(30 + redFlags.length * 15, 80),
        triggered: true,
        reason: `Red-flag symptom(s): ${redFlags.map((s) => s.name).join(', ')}`,
        redFlag: redFlags.map((s) => s.name).join(', '),
      };
    },
  },

  // ── Cardiac arrest (HR = 0) ────────────────────────────────────────
  {
    id: 'CARDIAC_ARREST',
    description: 'Heart rate is zero — cardiac arrest',
    evaluate: (input) => {
      const v = input.vitals;
      if (!v || v.heartRate === undefined || v.heartRate !== 0)
        return { score: 0, triggered: false };
      return {
        score: 100,
        triggered: true,
        reason: 'HR = 0: possible cardiac arrest',
        redFlag: 'Cardiac arrest (HR 0)',
      };
    },
  },

  // ── Critical vitals (age-stratified) ──────────────────────────────
  {
    id: 'CRITICAL_VITALS',
    description: 'Vitals outside safe ranges (age-adjusted)',
    evaluate: (input) => {
      const v = input.vitals;
      if (!v) return { score: 0, triggered: false };

      const ranges = getVitalRanges(input.patient);
      const flags: string[] = [];

      if (v.temperature !== undefined && v.temperature >= 39.5)
        flags.push(`High fever (${v.temperature}°C)`);
      if (v.temperature !== undefined && v.temperature <= 35.0)
        flags.push(`Hypothermia (${v.temperature}°C)`);
      if (v.heartRate !== undefined && v.heartRate > 0 && v.heartRate >= ranges.hr[1])
        flags.push(`Tachycardia (${v.heartRate} bpm)`);
      if (v.heartRate !== undefined && v.heartRate > 0 && v.heartRate <= ranges.hr[0])
        flags.push(`Bradycardia (${v.heartRate} bpm)`);
      if (v.systolicBP !== undefined && v.systolicBP >= ranges.sbp[1])
        flags.push(`Hypertensive crisis (${v.systolicBP}/${v.diastolicBP ?? '?'} mmHg)`);
      if (v.systolicBP !== undefined && v.systolicBP <= ranges.sbp[0])
        flags.push(`Hypotension (${v.systolicBP}/${v.diastolicBP ?? '?'} mmHg)`);
      if (v.oxygenSaturation !== undefined && v.oxygenSaturation < ranges.spo2)
        flags.push(`Low SpO2 (${v.oxygenSaturation}%)`);
      if (v.respiratoryRate !== undefined && v.respiratoryRate >= ranges.rr[1])
        flags.push(`Tachypnea (${v.respiratoryRate}/min)`);
      if (v.respiratoryRate !== undefined && v.respiratoryRate < ranges.rr[0])
        flags.push(`Bradypnea (${v.respiratoryRate}/min)`);
      if (v.bloodGlucose !== undefined && v.bloodGlucose < 70)
        flags.push(`Hypoglycemia (${v.bloodGlucose} mg/dL)`);
      if (v.bloodGlucose !== undefined && v.bloodGlucose > 400)
        flags.push(`Severe hyperglycemia (${v.bloodGlucose} mg/dL)`);

      if (flags.length === 0) return { score: 0, triggered: false };

      return {
        score: Math.min(40 + flags.length * 15, 95),
        triggered: true,
        reason: `Abnormal vitals: ${flags.join('; ')}`,
        redFlag: flags.join('; '),
      };
    },
  },

  // ── Vulnerable demographics ─────────────────────────────────────────
  {
    id: 'VULNERABLE_PATIENT',
    description: 'Age or pregnancy escalation',
    evaluate: (input) => {
      const { patient } = input;
      const flags: string[] = [];

      if (patient.ageYears < 5) flags.push('Child under 5');
      if (patient.ageYears > 65) flags.push('Elderly (>65)');
      if (patient.pregnant) flags.push('Pregnant');

      if (flags.length === 0) return { score: 0, triggered: false };

      return {
        score: 15 * flags.length,
        triggered: true,
        reason: `Vulnerable patient: ${flags.join(', ')}`,
      };
    },
  },

  // ── Symptom count / severity ────────────────────────────────────────
  {
    id: 'SYMPTOM_BURDEN',
    description: 'Multiple or severe symptoms',
    evaluate: (input) => {
      const count = input.symptoms.length;
      if (count === 0) return { score: 0, triggered: false };

      const severeCount = input.symptoms.filter((s) => {
        const override = input.severityOverrides?.[s.id];
        const severity = override ?? s.defaultSeverity;
        return severity === 'severe' || severity === 'critical';
      }).length;

      const base = Math.min(count * 5, 25);
      const severityBonus = severeCount * 10;

      return {
        score: Math.min(base + severityBonus, 50),
        triggered: true,
        reason: `${count} symptom(s) reported, ${severeCount} severe/critical`,
      };
    },
  },

  // ── Duration escalation ─────────────────────────────────────────────
  {
    id: 'PROLONGED_DURATION',
    description: 'Symptoms persisting > 7 days',
    evaluate: (input) => {
      if (!input.durationDays || input.durationDays <= 7)
        return { score: 0, triggered: false };

      const bonus = input.durationDays > 14 ? 20 : 10;
      return {
        score: bonus,
        triggered: true,
        reason: `Symptoms persisting for ${input.durationDays} days`,
      };
    },
  },

  // ── Known comorbidities ─────────────────────────────────────────────
  {
    id: 'COMORBIDITIES',
    description: 'Pre-existing high-risk conditions',
    evaluate: (input) => {
      const risky = new Set([
        'E11.9', // Diabetes
        'I10',   // Hypertension
        'J45.9', // Asthma
        'I50.9', // Heart failure
        'N18.9', // CKD
        'B20',   // HIV
        'A15.0', // TB
      ]);

      const hits = (input.patient.knownConditions ?? []).filter((c) =>
        risky.has(c),
      );
      if (hits.length === 0) return { score: 0, triggered: false };

      return {
        score: Math.min(hits.length * 10, 30),
        triggered: true,
        reason: `Comorbidities: ${hits.join(', ')}`,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Acuity mapping
// ---------------------------------------------------------------------------

function scoreToAcuity(score: number): AcuityLevel {
  if (score >= 80) return 'emergent';
  if (score >= 60) return 'urgent';
  if (score >= 40) return 'semi-urgent';
  if (score >= 20) return 'non-urgent';
  return 'self-care';
}

function acuityToRecommendation(acuity: AcuityLevel): { en: string; hi: string } {
  const map: Record<AcuityLevel, { en: string; hi: string }> = {
    emergent: {
      en: 'Seek emergency care immediately. Call 108 or visit the nearest hospital.',
      hi: 'तुरंत आपातकालीन सेवा लें। 108 पर कॉल करें या निकटतम अस्पताल जाएँ।',
    },
    urgent: {
      en: 'Visit a doctor within the next few hours. Do not delay.',
      hi: 'अगले कुछ घंटों में डॉक्टर से मिलें। देरी न करें।',
    },
    'semi-urgent': {
      en: 'Schedule a doctor visit within 24-48 hours.',
      hi: '24-48 घंटों के भीतर डॉक्टर से मिलने का समय लें।',
    },
    'non-urgent': {
      en: 'Monitor symptoms. Visit a doctor if they worsen or persist beyond a week.',
      hi: 'लक्षणों पर नज़र रखें। यदि वे बिगड़ें या एक सप्ताह से अधिक रहें तो डॉक्टर से मिलें।',
    },
    'self-care': {
      en: 'Rest, stay hydrated, and use over-the-counter remedies. Seek care if symptoms worsen.',
      hi: 'आराम करें, पानी पिएँ और घरेलू उपचार अपनाएँ। लक्षण बिगड़ें तो डॉक्टर से मिलें।',
    },
  };
  return map[acuity];
}

function acuityToReferralType(
  acuity: AcuityLevel,
): 'CHC' | 'district-hospital' | 'tertiary' | 'specialist' | undefined {
  if (acuity === 'emergent') return 'district-hospital';
  if (acuity === 'urgent') return 'CHC';
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the triage rules engine against a set of patient inputs.
 * Returns an acuity level, numeric score, and plain-language recommendation.
 */
export function runTriage(input: TriageInput): TriageRuleResult {
  // Validate vital signs are within physiologically possible ranges
  if (input.vitals) {
    const v = input.vitals;
    if (v.temperature !== undefined && (v.temperature < 25 || v.temperature > 45)) {
      throw new Error(`Invalid temperature: ${v.temperature}°C (must be 25–45)`);
    }
    if (v.heartRate !== undefined && (v.heartRate < 0 || v.heartRate > 300)) {
      throw new Error(`Invalid heart rate: ${v.heartRate} bpm (must be 0–300)`);
    }
    if (v.systolicBP !== undefined && (v.systolicBP < 0 || v.systolicBP > 350)) {
      throw new Error(`Invalid systolic BP: ${v.systolicBP} mmHg (must be 0–350)`);
    }
    if (v.diastolicBP !== undefined && (v.diastolicBP < 0 || v.diastolicBP > 250)) {
      throw new Error(`Invalid diastolic BP: ${v.diastolicBP} mmHg (must be 0–250)`);
    }
    if (v.respiratoryRate !== undefined && (v.respiratoryRate < 0 || v.respiratoryRate > 80)) {
      throw new Error(`Invalid respiratory rate: ${v.respiratoryRate}/min (must be 0–80)`);
    }
    if (v.oxygenSaturation !== undefined && (v.oxygenSaturation < 0 || v.oxygenSaturation > 100)) {
      throw new Error(`Invalid SpO2: ${v.oxygenSaturation}% (must be 0–100)`);
    }
    if (v.bloodGlucose !== undefined && (v.bloodGlucose < 0 || v.bloodGlucose > 2000)) {
      throw new Error(`Invalid blood glucose: ${v.bloodGlucose} mg/dL (must be 0–2000)`);
    }
  }

  const results = RULES.map((rule) => ({ rule, ...rule.evaluate(input) }));

  const totalScore = Math.min(
    results.reduce((sum, r) => sum + r.score, 0),
    100,
  );

  const acuity = scoreToAcuity(totalScore);
  const rec = acuityToRecommendation(acuity);
  const referralType = acuityToReferralType(acuity);

  const redFlags = results
    .filter((r) => r.redFlag)
    .map((r) => r.redFlag as string);

  const reasoning = results
    .filter((r) => r.triggered)
    .map((r) => `[${r.rule.id}] ${r.reason}`);

  // Any red-flag symptom inherently requires referral
  const symptomReferral = input.symptoms.some((s) => s.redFlag);
  const referralNeeded = acuity === 'emergent' || acuity === 'urgent' || symptomReferral;

  // Ensure referralType is always set when referral is needed.
  // If a red flag is present but the score-based acuity didn't assign a referralType,
  // default to at least 'urgent' (CHC).
  let finalReferralType = referralType;
  if (referralNeeded && !finalReferralType) {
    finalReferralType = symptomReferral ? 'district-hospital' : 'CHC';
  }

  return {
    acuity,
    score: totalScore,
    recommendation: rec.en,
    recommendationHi: rec.hi,
    referralNeeded,
    referralType: finalReferralType,
    redFlagsTriggered: redFlags,
    reasoning,
  };
}

export { RULES as TRIAGE_RULES };
