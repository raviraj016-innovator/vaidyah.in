/**
 * Triage Engine - Complete multi-step triage algorithm.
 *
 * Designed for Indian rural healthcare settings (Sub-Health Centers, PHCs).
 * Based on Indian Public Health Standards (IPHS) triage guidelines and
 * adapted WHO Emergency Triage Assessment and Treatment (ETAT) framework.
 *
 * Triage Levels:
 *   A = Minor / Non-urgent (can wait, outpatient management)
 *   B = Consult / Urgent (needs timely medical attention)
 *   C = Emergency / Immediate (life-threatening, needs immediate intervention)
 *
 * Algorithm Steps:
 *   1. Red-flag combination check (immediate escalation patterns)
 *   2. Vital signs scoring (physiological derangement)
 *   3. Symptom severity aggregation
 *   4. Age and comorbidity risk adjustment
 *   5. Prosody-based distress (optional, from voice analysis)
 *   6. Final triage level computation
 */

import {
  TriageInput,
  TriageResult,
  TriageScoringDetail,
  RedFlagAlert,
  TriageLevel,
  Vitals,
  SymptomInput,
  ProsodyScores,
} from '../types';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Negation Detection ─────────────────────────────────────────────────────
// Detects whether a symptom keyword appears in a negated context within the
// symptom text.  This prevents phrases like "no chest pain" or
// "denies shortness of breath" from triggering red-flag matches.

const NEGATION_PREFIXES: string[] = [
  'no',
  'not',
  'denies',
  'denied',
  'without',
  'absence of',
  'negative for',
  'rules out',
  // Hindi negation markers
  'नहीं',
  'बिना',
  'अनुपस्थिति',
];

/**
 * Check if a symptom keyword appears in a negated context within the given
 * text.  Returns `true` when the keyword is immediately preceded (possibly
 * with whitespace) by a known negation phrase.
 *
 * @param symptomKeyword  The red-flag keyword to look for (e.g. "chest pain")
 * @param text            The full symptom name / text to search in
 */
function isNegated(symptomKeyword: string, text: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = symptomKeyword.toLowerCase();

  // If the keyword is not even present in the text, nothing to negate.
  if (!lowerText.includes(lowerKeyword)) {
    return false;
  }

  // Build a regex that matches any negation prefix followed by optional
  // whitespace and then the symptom keyword (word-bounded).
  const negationGroup = NEGATION_PREFIXES.map(escapeRegExp).join('|');
  const negationRegex = new RegExp(
    `(?:${negationGroup})\\s+${escapeRegExp(lowerKeyword)}\\b`,
    'i'
  );

  return negationRegex.test(lowerText);
}

// ─── Red Flag Combination Patterns ──────────────────────────────────────────
// Each pattern: if all required symptoms/signs present, escalate immediately.

interface RedFlagPattern {
  name: string;
  required_symptoms: string[];
  required_vital_conditions?: Array<(vitals: Vitals) => boolean>;
  severity: 'warning' | 'critical';
  recommendation: string;
  source: string;
}

const RED_FLAG_PATTERNS: RedFlagPattern[] = [
  {
    name: 'Acute Coronary Syndrome',
    required_symptoms: ['chest pain'],
    required_vital_conditions: [
      (v) => (v.pulse !== undefined && (v.pulse > 120 || v.pulse < 50)) ||
             (v.bp_systolic !== undefined && v.bp_systolic < 90),
    ],
    severity: 'critical',
    recommendation: 'Immediate ECG, aspirin 325mg, IV access. Prepare for referral to higher center.',
    source: 'ACS Protocol',
  },
  {
    name: 'Chest Pain with Dyspnea',
    required_symptoms: ['chest pain', 'shortness of breath'],
    severity: 'critical',
    recommendation: 'Immediate oxygen, ECG, monitor vitals. Consider ACS, PE, or pneumothorax. Prepare emergency referral.',
    source: 'ETAT-adapted',
  },
  {
    name: 'Respiratory Distress',
    required_symptoms: ['shortness of breath'],
    required_vital_conditions: [
      (v) => (v.spo2 !== undefined && v.spo2 < 92) ||
             (v.respiratory_rate !== undefined && v.respiratory_rate > 30),
    ],
    severity: 'critical',
    recommendation: 'Immediate oxygen supplementation, nebulization if wheezing. Monitor SpO2 continuously.',
    source: 'WHO-ETAT',
  },
  {
    name: 'Severe Dehydration (Pediatric/Adult)',
    required_symptoms: ['diarrhea', 'vomiting'],
    required_vital_conditions: [
      (v) => (v.pulse !== undefined && v.pulse > 120) ||
             (v.bp_systolic !== undefined && v.bp_systolic < 90),
    ],
    severity: 'critical',
    recommendation: 'Immediate IV fluid resuscitation with Ringer Lactate. Start ORS. Monitor urine output.',
    source: 'IMNCI/WHO',
  },
  {
    name: 'Stroke Warning Signs',
    required_symptoms: ['sudden weakness', 'speech difficulty'],
    severity: 'critical',
    recommendation: 'FAST assessment. Do NOT give aspirin until stroke type confirmed. Immediate referral for CT scan.',
    source: 'Stroke Protocol',
  },
  {
    name: 'Stroke with Headache',
    required_symptoms: ['severe headache', 'sudden weakness'],
    severity: 'critical',
    recommendation: 'Possible hemorrhagic stroke. Immediate referral. Keep head elevated 30 degrees.',
    source: 'Stroke Protocol',
  },
  {
    name: 'Meningitis Suspicion',
    required_symptoms: ['fever', 'headache', 'neck stiffness'],
    severity: 'critical',
    recommendation: 'Suspected meningitis. Start empiric antibiotics (Ceftriaxone) before referral if available.',
    source: 'Infectious Disease Protocol',
  },
  {
    name: 'Anaphylaxis',
    required_symptoms: ['allergic reaction', 'shortness of breath'],
    severity: 'critical',
    recommendation: 'Immediate IM Epinephrine 0.3mg (adult), 0.15mg (child). IV fluids. Refer to higher center.',
    source: 'Anaphylaxis Protocol',
  },
  {
    name: 'Snakebite with Systemic Signs',
    required_symptoms: ['snakebite'],
    required_vital_conditions: [
      (v) => (v.bp_systolic !== undefined && v.bp_systolic < 90) ||
             (v.pulse !== undefined && v.pulse > 120),
    ],
    severity: 'critical',
    recommendation: 'Immobilize limb, mark swelling, prepare anti-snake venom. Immediate referral to district hospital.',
    source: 'Snakebite Protocol India',
  },
  {
    name: 'Obstetric Emergency - APH',
    required_symptoms: ['vaginal bleeding', 'pregnancy'],
    severity: 'critical',
    recommendation: 'Antepartum hemorrhage. IV access, type and cross-match. Do NOT do PV exam. Immediate referral.',
    source: 'Obstetric Emergency Protocol',
  },
  {
    name: 'Eclampsia/Pre-eclampsia',
    required_symptoms: ['seizure', 'pregnancy'],
    severity: 'critical',
    recommendation: 'Magnesium sulfate loading dose. Left lateral position. Immediate referral.',
    source: 'Obstetric Emergency Protocol',
  },
  {
    name: 'Febrile Seizure (Pediatric)',
    required_symptoms: ['seizure', 'fever'],
    severity: 'critical',
    recommendation: 'Position safely, reduce temperature. If seizure >5 min, give diazepam. Monitor airway.',
    source: 'Pediatric Emergency Protocol',
  },
  {
    name: 'Severe Malaria Suspicion',
    required_symptoms: ['fever', 'altered consciousness'],
    severity: 'critical',
    recommendation: 'RDT/smear immediately. Start artesunate injection if positive. IV fluids. Urgent referral.',
    source: 'NVBDCP Guidelines',
  },
  {
    name: 'Dengue Warning Signs',
    required_symptoms: ['fever', 'abdominal pain'],
    required_vital_conditions: [
      (v) => (v.pulse !== undefined && v.pulse > 100) ||
             (v.bp_systolic !== undefined && v.bp_systolic < 100),
    ],
    severity: 'warning',
    recommendation: 'Check platelet count, hematocrit. IV fluids. Monitor for plasma leakage. Consider referral.',
    source: 'NVBDCP Dengue Guidelines',
  },
  {
    name: 'Poisoning/Overdose',
    required_symptoms: ['poisoning'],
    severity: 'critical',
    recommendation: 'Identify poison. Do NOT induce vomiting if corrosive. Activated charcoal if within 1h. Immediate referral.',
    source: 'Toxicology Protocol',
  },
  {
    name: 'Severe Burns',
    required_symptoms: ['burns'],
    required_vital_conditions: [
      (v) => v.pulse !== undefined && v.pulse > 120,
    ],
    severity: 'critical',
    recommendation: 'Cool with running water 20 min. IV fluids (Parkland formula). Pain management. Referral to burn center.',
    source: 'Burns Protocol',
  },
];

// ─── Individual Red Flag Symptoms ───────────────────────────────────────────

const INDIVIDUAL_RED_FLAGS: Record<string, { severity: 'warning' | 'critical'; recommendation: string }> = {
  'chest pain': { severity: 'warning', recommendation: 'Obtain ECG. Monitor vitals closely.' },
  'shortness of breath': { severity: 'warning', recommendation: 'Check SpO2. Provide supplemental oxygen if SpO2 < 94%.' },
  'seizure': { severity: 'critical', recommendation: 'Protect airway. Time the seizure. Position safely.' },
  'altered consciousness': { severity: 'critical', recommendation: 'Check GCS. Assess airway. Check blood glucose.' },
  'unconsciousness': { severity: 'critical', recommendation: 'ABCs. Check blood glucose. Immediate referral.' },
  'severe bleeding': { severity: 'critical', recommendation: 'Direct pressure. Elevate. IV access for fluid resuscitation.' },
  'snakebite': { severity: 'warning', recommendation: 'Immobilize limb. Mark swelling margin with time. Do NOT tourniquet.' },
  'poisoning': { severity: 'critical', recommendation: 'Identify substance. Supportive care. Contact poison center.' },
  'burns': { severity: 'warning', recommendation: 'Cool burn with water. Assess TBSA percentage.' },
  'head injury': { severity: 'warning', recommendation: 'GCS assessment. Watch for vomiting, unequal pupils.' },
  'vaginal bleeding': { severity: 'warning', recommendation: 'Assess for pregnancy. Check hemodynamic stability.' },
  'hematemesis': { severity: 'critical', recommendation: 'NPO. IV access x2. Type and cross-match. Urgent referral.' },
  'blood in stool': { severity: 'warning', recommendation: 'Assess hemodynamic stability. Consider GI bleed workup.' },
  'suicidal ideation': { severity: 'critical', recommendation: 'Ensure safety. Do not leave patient alone. Psychiatric evaluation.' },
  'sudden severe headache': { severity: 'warning', recommendation: 'Consider subarachnoid hemorrhage. Check BP. Referral for CT.' },
  'high fever': { severity: 'warning', recommendation: 'Evaluate for focus of infection. Blood cultures if available.' },
};

// ─── Vital Signs Scoring ────────────────────────────────────────────────────
// Scoring based on Modified Early Warning Score (MEWS) adapted for
// resource-limited settings. Ranges calibrated for Indian adult population.

interface VitalScoreRule {
  name: string;
  score: (vitals: Vitals, age: number) => number;
  max: number;
  detail: (vitals: Vitals, age: number) => string;
}

const VITAL_SCORE_RULES: VitalScoreRule[] = [
  {
    name: 'Temperature',
    max: 15,
    score: (v) => {
      if (v.temperature === undefined) return 0;
      const t = v.temperature;
      if (t >= 40.0) return 15;         // Hyperpyrexia
      if (t >= 39.5) return 12;         // High fever (103.1F+)
      if (t >= 39.0) return 10;         // Fever > 102.2F
      if (t >= 38.5) return 7;          // Moderate fever
      if (t >= 38.0) return 4;          // Low-grade fever
      if (t <= 35.0) return 15;         // Severe hypothermia
      if (t <= 35.5) return 10;         // Hypothermia
      if (t <= 36.0) return 5;          // Mild hypothermia
      return 0;
    },
    detail: (v) => {
      if (v.temperature === undefined) return 'Temperature: not recorded';
      return `Temperature: ${v.temperature}C (${((v.temperature * 9) / 5 + 32).toFixed(1)}F)`;
    },
  },
  {
    name: 'SpO2 (Oxygen Saturation)',
    max: 20,
    score: (v) => {
      if (v.spo2 === undefined) return 0;
      if (v.spo2 < 85) return 20;       // Severe hypoxemia
      if (v.spo2 < 88) return 18;       // Critical hypoxia
      if (v.spo2 < 90) return 15;       // Severe
      if (v.spo2 < 92) return 12;       // Significant hypoxia
      if (v.spo2 < 94) return 8;        // Mild hypoxia
      if (v.spo2 < 96) return 3;        // Borderline
      return 0;
    },
    detail: (v) => {
      if (v.spo2 === undefined) return 'SpO2: not recorded';
      return `SpO2: ${v.spo2}%`;
    },
  },
  {
    name: 'Blood Pressure (Systolic)',
    max: 18,
    score: (v) => {
      if (v.bp_systolic === undefined) return 0;
      const sys = v.bp_systolic;
      if (sys < 70) return 18;           // Severe hypotension / shock
      if (sys < 80) return 15;           // Significant hypotension
      if (sys < 90) return 12;           // Hypotension
      if (sys < 100) return 6;           // Low
      if (sys >= 200) return 18;         // Hypertensive crisis
      if (sys >= 180) return 14;         // Severe hypertension
      if (sys >= 160) return 8;          // Stage 2 HTN
      if (sys >= 140) return 4;          // Stage 1 HTN
      return 0;
    },
    detail: (v) => {
      if (v.bp_systolic === undefined || v.bp_diastolic === undefined) return 'BP: not recorded';
      return `BP: ${v.bp_systolic}/${v.bp_diastolic} mmHg`;
    },
  },
  {
    name: 'Blood Pressure (Diastolic)',
    max: 15,
    score: (v) => {
      if (v.bp_diastolic === undefined) return 0;
      const dia = v.bp_diastolic;
      if (dia >= 120) return 15;          // Hypertensive emergency
      if (dia >= 110) return 12;          // Severe hypertension
      if (dia >= 100) return 8;           // Stage 2 HTN
      if (dia >= 90) return 4;            // Stage 1 HTN
      if (dia <= 40) return 15;           // Severe hypotension / shock
      if (dia <= 50) return 10;           // Hypotension
      return 0;
    },
    detail: (v) => {
      if (v.bp_diastolic === undefined) return 'Diastolic BP: not recorded';
      return `Diastolic BP: ${v.bp_diastolic} mmHg`;
    },
  },
  {
    name: 'Heart Rate / Pulse',
    max: 15,
    score: (v, age) => {
      if (v.pulse === undefined) return 0;
      const hr = v.pulse;
      // Pediatric thresholds are different
      if (age < 5) {
        if (hr > 180) return 15;
        if (hr > 160) return 10;
        if (hr < 60) return 15;
        if (hr < 80) return 8;
        return 0;
      }
      if (age < 12) {
        if (hr > 160) return 15;
        if (hr > 140) return 10;
        if (hr < 50) return 15;
        if (hr < 60) return 8;
        return 0;
      }
      // Adult thresholds
      if (hr > 150) return 15;           // Severe tachycardia
      if (hr > 130) return 12;
      if (hr > 120) return 8;
      if (hr > 100) return 4;
      if (hr < 40) return 15;            // Severe bradycardia
      if (hr < 50) return 10;
      if (hr < 60) return 4;
      return 0;
    },
    detail: (v) => {
      if (v.pulse === undefined) return 'Pulse: not recorded';
      return `Pulse: ${v.pulse} bpm`;
    },
  },
  {
    name: 'Respiratory Rate',
    max: 15,
    score: (v, age) => {
      if (v.respiratory_rate === undefined) return 0;
      const rr = v.respiratory_rate;
      if (age < 2) {
        if (rr > 60) return 15;
        if (rr > 50) return 10;
        if (rr < 20) return 12;
        return 0;
      }
      if (age < 5) {
        if (rr > 50) return 15;
        if (rr > 40) return 10;
        if (rr < 15) return 12;
        return 0;
      }
      if (age < 12) {
        // Pediatric 5-12 years: normal RR 18-25
        if (rr > 40) return 15;
        if (rr > 30) return 10;
        if (rr > 25) return 4;
        if (rr < 12) return 12;
        if (rr < 15) return 6;
        return 0;
      }
      // Adult thresholds
      if (rr > 35) return 15;
      if (rr > 30) return 12;
      if (rr > 25) return 8;
      if (rr > 20) return 4;
      if (rr < 8) return 15;
      if (rr < 10) return 10;
      return 0;
    },
    detail: (v) => {
      if (v.respiratory_rate === undefined) return 'RR: not recorded';
      return `RR: ${v.respiratory_rate} breaths/min`;
    },
  },
  {
    name: 'Blood Glucose',
    max: 15,
    score: (v) => {
      if (v.blood_glucose === undefined) return 0;
      const bg = v.blood_glucose;
      if (bg < 40) return 15;            // Severe hypoglycemia
      if (bg < 54) return 12;            // Hypoglycemia
      if (bg < 70) return 6;             // Low
      if (bg > 500) return 15;           // DKA/HHS risk
      if (bg > 400) return 12;
      if (bg > 300) return 8;
      if (bg > 250) return 5;
      return 0;
    },
    detail: (v) => {
      if (v.blood_glucose === undefined) return 'Blood glucose: not recorded';
      return `Blood glucose: ${v.blood_glucose} mg/dL`;
    },
  },
  {
    name: 'Pain Score',
    max: 10,
    score: (v) => {
      if (v.pain_score === undefined) return 0;
      if (v.pain_score >= 9) return 10;
      if (v.pain_score >= 7) return 7;
      if (v.pain_score >= 5) return 4;
      if (v.pain_score >= 3) return 2;
      return 0;
    },
    detail: (v) => {
      if (v.pain_score === undefined) return 'Pain: not assessed';
      return `Pain score: ${v.pain_score}/10`;
    },
  },
];

// ─── Comorbidity Risk Weights ───────────────────────────────────────────────
// Common chronic conditions and their triage risk multiplier.
// These increase urgency because of higher complication risk.

const COMORBIDITY_RISK: Record<string, number> = {
  'diabetes': 1.3,
  'diabetes mellitus': 1.3,
  'type 2 diabetes': 1.3,
  'type 1 diabetes': 1.4,
  'hypertension': 1.2,
  'heart disease': 1.5,
  'coronary artery disease': 1.5,
  'heart failure': 1.6,
  'copd': 1.4,
  'asthma': 1.2,
  'chronic kidney disease': 1.5,
  'ckd': 1.5,
  'liver disease': 1.4,
  'cirrhosis': 1.5,
  'cancer': 1.4,
  'hiv': 1.3,
  'tuberculosis': 1.3,
  'tb': 1.3,
  'sickle cell disease': 1.4,
  'epilepsy': 1.2,
  'pregnancy': 1.3,
  'immunocompromised': 1.5,
  'transplant': 1.5,
  'rheumatic heart disease': 1.4,
  'valvular heart disease': 1.4,
  'stroke': 1.4,
  'previous stroke': 1.4,
  'deep vein thrombosis': 1.3,
  'pulmonary embolism': 1.5,
};

// ─── Symptom Severity Weights ───────────────────────────────────────────────

const SYMPTOM_SEVERITY_WEIGHT: Record<string, number> = {
  'mild': 1,
  'moderate': 3,
  'severe': 6,
};

const SYMPTOM_ONSET_WEIGHT: Record<string, number> = {
  'sudden': 2,
  'gradual': 1,
};

const SYMPTOM_FREQUENCY_WEIGHT: Record<string, number> = {
  'constant': 2,
  'intermittent': 1.5,
  'episodic': 1,
};

// ─── Triage Engine ──────────────────────────────────────────────────────────

export class TriageEngine {
  /**
   * Run the full 5-step triage algorithm.
   */
  public runTriage(sessionId: string, input: TriageInput): TriageResult {
    const scoringBreakdown: TriageScoringDetail[] = [];
    const redFlags: RedFlagAlert[] = [];

    // ────────────────────────────────────────────────────────────────────
    // Step 1: Red-flag combination check
    // ────────────────────────────────────────────────────────────────────
    const { redFlagScore, redFlagDetails } = this.checkRedFlags(
      input.symptoms,
      input.vitals,
      redFlags
    );

    scoringBreakdown.push(...redFlagDetails);

    // Also check individual symptom red flags
    const individualRedFlagScore = this.checkIndividualRedFlags(
      input.symptoms,
      redFlags,
      scoringBreakdown
    );

    const totalRedFlagScore = redFlagScore + individualRedFlagScore;

    // ────────────────────────────────────────────────────────────────────
    // Step 2: Vital signs scoring
    // ────────────────────────────────────────────────────────────────────
    let vitalsTotalScore = 0;
    const vitalsMaxScore = VITAL_SCORE_RULES.reduce((sum, r) => sum + r.max, 0);

    for (const rule of VITAL_SCORE_RULES) {
      const score = rule.score(input.vitals, input.age);
      if (score > 0) {
        vitalsTotalScore += score;
        scoringBreakdown.push({
          factor: rule.name,
          score,
          max_score: rule.max,
          source: 'vitals',
          detail: rule.detail(input.vitals, input.age),
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // Step 3: Symptom severity aggregation
    // ────────────────────────────────────────────────────────────────────
    let symptomScore = 0;
    const maxSymptomScore = input.symptoms.length * 24; // max per symptom: 6 severity * 2 onset * 2 frequency

    for (const symptom of input.symptoms) {
      const sevWeight = SYMPTOM_SEVERITY_WEIGHT[symptom.severity] ?? 1;
      const onsetWeight = symptom.onset ? (SYMPTOM_ONSET_WEIGHT[symptom.onset] ?? 1) : 1;
      const freqWeight = symptom.frequency ? (SYMPTOM_FREQUENCY_WEIGHT[symptom.frequency] ?? 1) : 1;

      const sScore = sevWeight * onsetWeight * freqWeight;
      symptomScore += sScore;

      scoringBreakdown.push({
        factor: `Symptom: ${symptom.name}`,
        score: sScore,
        max_score: 24,
        source: 'symptoms',
        detail: `${symptom.severity} severity, ${symptom.onset ?? 'unknown'} onset, ${symptom.frequency ?? 'unknown'} frequency`,
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // Step 4: Age and comorbidity risk adjustment
    // ────────────────────────────────────────────────────────────────────
    let ageRiskMultiplier = 1.0;
    let ageDetail = 'Normal age risk';

    if (input.age < 1) {
      ageRiskMultiplier = 1.8;
      ageDetail = 'Neonate/Infant - highest risk age group';
    } else if (input.age < 5) {
      ageRiskMultiplier = 1.5;
      ageDetail = 'Under-5 child - high risk per IMNCI';
    } else if (input.age < 12) {
      ageRiskMultiplier = 1.2;
      ageDetail = 'Pediatric patient - elevated risk';
    } else if (input.age >= 75) {
      ageRiskMultiplier = 1.5;
      ageDetail = 'Elderly (75+) - high complication risk';
    } else if (input.age >= 65) {
      ageRiskMultiplier = 1.3;
      ageDetail = 'Senior (65+) - elevated complication risk';
    } else if (input.age >= 55) {
      ageRiskMultiplier = 1.1;
      ageDetail = 'Middle-aged (55+) - slightly elevated risk';
    }

    scoringBreakdown.push({
      factor: 'Age Risk',
      score: Math.round((ageRiskMultiplier - 1.0) * 10),
      max_score: 8,
      source: 'age',
      detail: `Age ${input.age}: ${ageDetail}`,
    });

    // Comorbidity multiplier
    let comorbidityMultiplier = 1.0;
    const matchedConditions: Array<{ name: string; risk: number }> = [];

    for (const condition of input.medical_history.conditions) {
      const normalizedCondition = condition.toLowerCase().trim();
      for (const [key, risk] of Object.entries(COMORBIDITY_RISK)) {
        const keyRegex = new RegExp(`\\b${escapeRegExp(key)}\\b`);
        if (normalizedCondition === key || keyRegex.test(normalizedCondition)) {
          if (risk > comorbidityMultiplier) {
            comorbidityMultiplier = risk;
          }
          matchedConditions.push({ name: condition, risk });
          break;
        }
      }
    }

    // Check medications for high-risk drugs
    const highRiskMeds = ['warfarin', 'insulin', 'immunosuppressant', 'chemotherapy', 'anticoagulant', 'methotrexate'];
    for (const med of input.medical_history.medications) {
      const normalizedMed = med.toLowerCase();
      for (const hm of highRiskMeds) {
        const hmRegex = new RegExp(`\\b${escapeRegExp(hm)}\\b`);
        if (hmRegex.test(normalizedMed)) {
          if (1.3 > comorbidityMultiplier) {
            comorbidityMultiplier = 1.3;
          }
          matchedConditions.push({ name: `High-risk medication: ${med}`, risk: 1.3 });
          break;
        }
      }
    }

    // Compound comorbidity multiplier: use max, then add diminishing bonus per additional condition
    if (matchedConditions.length > 1) {
      const additionalConditions = matchedConditions.length - 1;
      comorbidityMultiplier = Math.min(2.5, comorbidityMultiplier + 0.1 * additionalConditions);
    }

    if (matchedConditions.length > 0) {
      const conditionDesc = matchedConditions.map(c => `${c.name} (risk: ${c.risk}x)`).join(', ');
      scoringBreakdown.push({
        factor: 'Comorbidity Risk',
        score: Math.round((comorbidityMultiplier - 1.0) * 10),
        max_score: 15,
        source: 'comorbidity',
        detail: `Conditions: ${conditionDesc}. Combined multiplier: ${comorbidityMultiplier.toFixed(2)}x`,
      });
    }

    // ────────────────────────────────────────────────────────────────────
    // Step 5: Prosody-based distress scoring (optional)
    // ────────────────────────────────────────────────────────────────────
    let prosodyScore = 0;
    if (input.prosody_scores) {
      prosodyScore = this.scoreProsody(input.prosody_scores, scoringBreakdown);
    }

    // ────────────────────────────────────────────────────────────────────
    // Final Score Computation
    // ────────────────────────────────────────────────────────────────────

    // Normalize component scores to 0-100 scale
    const normalizedVitals = vitalsMaxScore > 0 ? (vitalsTotalScore / vitalsMaxScore) * 40 : 0;
    const normalizedSymptoms = maxSymptomScore > 0 ? (symptomScore / maxSymptomScore) * 20 : 0;
    const normalizedRedFlags = Math.min(totalRedFlagScore, 30); // Cap at 30
    const normalizedProsody = prosodyScore; // Already 0-10

    let rawScore = normalizedVitals + normalizedSymptoms + normalizedRedFlags + normalizedProsody;

    // Apply risk multipliers
    rawScore = rawScore * ageRiskMultiplier * comorbidityMultiplier;

    // Clamp to 0-100
    const urgencyScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    // Determine triage level
    const { triageLevel, needsImmediate } = this.determineTriageLevel(
      urgencyScore,
      redFlags,
      input.vitals
    );

    // Generate clinical impression
    const clinicalImpression = this.generateClinicalImpression(
      input,
      triageLevel,
      redFlags,
      urgencyScore
    );

    // Recommended action and wait time
    const { action, waitMinutes } = this.getRecommendedAction(triageLevel, redFlags);

    return {
      session_id: sessionId,
      triage_level: triageLevel,
      urgency_score: urgencyScore,
      needs_immediate_attention: needsImmediate,
      scoring_breakdown: scoringBreakdown,
      red_flags: redFlags,
      recommended_action: action,
      recommended_wait_minutes: waitMinutes,
      clinical_impression: clinicalImpression,
      assessed_at: new Date().toISOString(),
      is_ai_assisted: true,
    };
  }

  /**
   * Step 1a: Check for dangerous symptom combinations (pattern-based red flags).
   */
  private checkRedFlags(
    symptoms: SymptomInput[],
    vitals: Vitals,
    redFlags: RedFlagAlert[]
  ): { redFlagScore: number; redFlagDetails: TriageScoringDetail[] } {
    let score = 0;
    const details: TriageScoringDetail[] = [];
    const symptomNames = symptoms.map((s) => s.name.toLowerCase().trim());

    for (const pattern of RED_FLAG_PATTERNS) {
      const allSymptomsPresent = pattern.required_symptoms.every((req) => {
        const reqLower = req.toLowerCase();
        const reqRegex = new RegExp(`\\b${escapeRegExp(reqLower)}\\b`);
        return symptomNames.some(
          (s) => (s === reqLower || reqRegex.test(s)) && !isNegated(reqLower, s)
        );
      });

      if (!allSymptomsPresent) continue;

      // Check vital conditions if any
      const vitalConditionsMet =
        !pattern.required_vital_conditions ||
        pattern.required_vital_conditions.every((fn) => fn(vitals));

      if (!vitalConditionsMet) continue;

      // Pattern matched
      const patternScore = pattern.severity === 'critical' ? 25 : 15;
      score += patternScore;

      redFlags.push({
        flag: pattern.name,
        severity: pattern.severity,
        recommendation: pattern.recommendation,
        source: pattern.source,
      });

      details.push({
        factor: `Red Flag: ${pattern.name}`,
        score: patternScore,
        max_score: 25,
        source: 'red_flag',
        detail: pattern.recommendation,
      });
    }

    return { redFlagScore: score, redFlagDetails: details };
  }

  /**
   * Step 1b: Check individual symptoms against the red flag list.
   */
  private checkIndividualRedFlags(
    symptoms: SymptomInput[],
    redFlags: RedFlagAlert[],
    scoringBreakdown: TriageScoringDetail[]
  ): number {
    let score = 0;

    for (const symptom of symptoms) {
      const normalizedName = symptom.name.toLowerCase().trim();

      for (const [flagName, flagInfo] of Object.entries(INDIVIDUAL_RED_FLAGS)) {
        const flagRegex = new RegExp(`\\b${escapeRegExp(flagName)}\\b`);
        if ((normalizedName === flagName || flagRegex.test(normalizedName)) && !isNegated(flagName, normalizedName)) {
          // Avoid duplicates
          const alreadyFlagged = redFlags.some(
            (rf) => rf.flag.toLowerCase().includes(flagName)
          );
          if (alreadyFlagged) continue;

          const flagScore = flagInfo.severity === 'critical' ? 15 : 8;
          score += flagScore;

          redFlags.push({
            flag: `Individual red flag: ${symptom.name}`,
            severity: flagInfo.severity,
            recommendation: flagInfo.recommendation,
            source: 'symptom_screening',
          });

          scoringBreakdown.push({
            factor: `Red Flag Symptom: ${symptom.name}`,
            score: flagScore,
            max_score: 15,
            source: 'red_flag',
            detail: flagInfo.recommendation,
          });

          break;
        }
      }
    }

    return score;
  }

  /**
   * Step 5: Score prosody (voice distress indicators).
   */
  private scoreProsody(
    prosody: ProsodyScores,
    scoringBreakdown: TriageScoringDetail[]
  ): number {
    let score = 0;

    // Distress level
    if (prosody.distress > 0.8) score += 4;
    else if (prosody.distress > 0.6) score += 2;
    else if (prosody.distress > 0.4) score += 1;

    // Pain indicator
    if (prosody.pain > 0.8) score += 3;
    else if (prosody.pain > 0.6) score += 2;
    else if (prosody.pain > 0.4) score += 1;

    // Breathlessness
    if (prosody.breathlessness > 0.7) score += 3;
    else if (prosody.breathlessness > 0.5) score += 1;

    if (score > 0) {
      scoringBreakdown.push({
        factor: 'Prosody Analysis',
        score,
        max_score: 10,
        source: 'prosody',
        detail: `Distress: ${(prosody.distress * 100).toFixed(0)}%, Pain: ${(prosody.pain * 100).toFixed(0)}%, Breathlessness: ${(prosody.breathlessness * 100).toFixed(0)}%`,
      });
    }

    return score;
  }

  /**
   * Determine the final triage level from urgency score and red flags.
   */
  private determineTriageLevel(
    urgencyScore: number,
    redFlags: RedFlagAlert[],
    vitals: Vitals
  ): { triageLevel: TriageLevel; needsImmediate: boolean } {
    // Any critical red flag immediately escalates to C
    const hasCriticalRedFlag = redFlags.some((rf) => rf.severity === 'critical');
    if (hasCriticalRedFlag) {
      return { triageLevel: 'C', needsImmediate: true };
    }

    // Critical vital derangements override score-based triage
    if (vitals.spo2 !== undefined && vitals.spo2 < 88) {
      return { triageLevel: 'C', needsImmediate: true };
    }
    if (vitals.bp_systolic !== undefined && vitals.bp_systolic < 70) {
      return { triageLevel: 'C', needsImmediate: true };
    }
    if (vitals.bp_systolic !== undefined && vitals.bp_systolic >= 200) {
      return { triageLevel: 'C', needsImmediate: true };
    }
    if (vitals.pulse !== undefined && (vitals.pulse < 35 || vitals.pulse > 160)) {
      return { triageLevel: 'C', needsImmediate: true };
    }

    // Score-based determination
    if (urgencyScore >= 60) {
      return { triageLevel: 'C', needsImmediate: true };
    }
    if (urgencyScore >= 30) {
      return { triageLevel: 'B', needsImmediate: false };
    }
    return { triageLevel: 'A', needsImmediate: false };
  }

  /**
   * Generate a brief clinical impression based on triage inputs.
   */
  private generateClinicalImpression(
    input: TriageInput,
    level: TriageLevel,
    redFlags: RedFlagAlert[],
    score: number
  ): string {
    const parts: string[] = [];

    parts.push(`${input.age}-year-old ${input.gender} patient`);

    if (input.chief_complaint) {
      parts.push(`presenting with ${input.chief_complaint}`);
    } else if (input.symptoms.length > 0) {
      const topSymptoms = input.symptoms
        .slice(0, 3)
        .map((s) => s.name)
        .join(', ');
      parts.push(`presenting with ${topSymptoms}`);
    }

    if (redFlags.length > 0) {
      parts.push(`${redFlags.length} red flag(s) identified`);
    }

    const conditions = input.medical_history.conditions;
    if (conditions.length > 0) {
      parts.push(`with history of ${conditions.slice(0, 3).join(', ')}`);
    }

    const levelDesc: Record<TriageLevel, string> = {
      A: 'non-urgent, suitable for outpatient management',
      B: 'urgent, requires timely medical consultation',
      C: 'emergency, requires immediate medical intervention',
    };

    parts.push(`Triage Level ${level}: ${levelDesc[level]} (urgency score: ${score}/100)`);

    return parts.join('. ') + '.';
  }

  /**
   * Get recommended action and wait time based on triage level.
   */
  private getRecommendedAction(
    level: TriageLevel,
    redFlags: RedFlagAlert[]
  ): { action: string; waitMinutes: number } {
    switch (level) {
      case 'C':
        if (redFlags.some((rf) => rf.severity === 'critical')) {
          return {
            action: 'IMMEDIATE ATTENTION REQUIRED. Begin emergency protocol. Stabilize patient. Prepare for referral to higher center if needed.',
            waitMinutes: 0,
          };
        }
        return {
          action: 'Emergency case. Prioritize for immediate assessment by available medical officer. Prepare IV access and monitoring.',
          waitMinutes: 0,
        };
      case 'B':
        return {
          action: 'Urgent consultation needed. Patient should be seen by medical officer within 30 minutes. Monitor vitals at 15-minute intervals.',
          waitMinutes: 30,
        };
      case 'A':
        return {
          action: 'Non-urgent. Patient can wait for routine consultation. Provide symptomatic relief if needed while waiting.',
          waitMinutes: 120,
        };
    }
  }
}

/** Singleton instance */
export const triageEngine = new TriageEngine();
