import { TriageEngine } from '../services/triage-engine';
import { TriageInput, TriageResult, Vitals, SymptomInput, MedicalHistory } from '../types';

const engine = new TriageEngine();

function makeHistory(overrides: Partial<MedicalHistory> = {}): MedicalHistory {
  return {
    conditions: [],
    allergies: [],
    medications: [],
    surgeries: [],
    family_history: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    symptoms: [],
    vitals: {},
    age: 35,
    gender: 'male',
    medical_history: makeHistory(),
    ...overrides,
  };
}

function triage(overrides: Partial<TriageInput> = {}): TriageResult {
  return engine.runTriage('test-session-001', makeInput(overrides));
}

// ---------------------------------------------------------------------------
// Red-Flag Detection
// ---------------------------------------------------------------------------
describe('TriageEngine', () => {
  describe('Red-flag pattern detection', () => {
    it('detects Acute Coronary Syndrome (chest pain + tachycardia)', () => {
      const result = triage({
        symptoms: [{ name: 'chest pain', severity: 'severe' }],
        vitals: { pulse: 130, bp_systolic: 85 },
      });
      expect(result.triage_level).toBe('C');
      expect(result.needs_immediate_attention).toBe(true);
      expect(result.red_flags.some((rf) => rf.flag.includes('Acute Coronary Syndrome'))).toBe(true);
    });

    it('detects Respiratory Distress (shortness of breath + low SpO2)', () => {
      const result = triage({
        symptoms: [{ name: 'shortness of breath', severity: 'severe' }],
        vitals: { spo2: 88 },
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Respiratory Distress'))).toBe(true);
      expect(result.recommended_wait_minutes).toBe(0);
    });

    it('detects Stroke Warning Signs (sudden weakness + speech difficulty)', () => {
      const result = triage({
        symptoms: [
          { name: 'sudden weakness', severity: 'severe' },
          { name: 'speech difficulty', severity: 'severe' },
        ],
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Stroke Warning Signs'))).toBe(true);
    });

    it('detects Snakebite with systemic signs (hypotension)', () => {
      const result = triage({
        symptoms: [{ name: 'snakebite', severity: 'severe' }],
        vitals: { bp_systolic: 80, pulse: 125 },
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Snakebite with Systemic Signs'))).toBe(true);
    });

    it('detects Severe Dehydration with diarrhea + vomiting + tachycardia', () => {
      const result = triage({
        symptoms: [
          { name: 'diarrhea', severity: 'severe' },
          { name: 'vomiting', severity: 'severe' },
        ],
        vitals: { pulse: 130 },
        age: 3,
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Severe Dehydration'))).toBe(true);
    });

    it('detects Meningitis Suspicion (fever + headache + neck stiffness)', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'severe' },
          { name: 'headache', severity: 'severe' },
          { name: 'neck stiffness', severity: 'severe' },
        ],
        vitals: { temperature: 40.2 },
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Meningitis Suspicion'))).toBe(true);
    });

    it('detects Obstetric Emergency APH (vaginal bleeding + pregnancy)', () => {
      const result = triage({
        symptoms: [
          { name: 'vaginal bleeding', severity: 'severe' },
          { name: 'pregnancy', severity: 'moderate' },
        ],
        gender: 'female',
        age: 28,
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Obstetric Emergency'))).toBe(true);
    });

    it('detects individual red flag for altered consciousness', () => {
      const result = triage({
        symptoms: [{ name: 'altered consciousness', severity: 'severe' }],
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.severity === 'critical')).toBe(true);
    });

    it('detects Dengue Warning Signs (fever + abdominal pain + tachycardia)', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'moderate' },
          { name: 'abdominal pain', severity: 'moderate' },
        ],
        vitals: { pulse: 110, bp_systolic: 95 },
      });
      const hasDengueFlag = result.red_flags.some((rf) => rf.flag.includes('Dengue Warning Signs'));
      expect(hasDengueFlag).toBe(true);
    });

    it('does not flag ACS when vitals are normal despite chest pain', () => {
      const result = triage({
        symptoms: [{ name: 'chest pain', severity: 'mild' }],
        vitals: { pulse: 78, bp_systolic: 120 },
      });
      const hasACS = result.red_flags.some((rf) => rf.flag.includes('Acute Coronary Syndrome'));
      expect(hasACS).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Vital Signs Scoring
  // ---------------------------------------------------------------------------
  describe('Vital signs scoring', () => {
    it('scores 0 for completely normal adult vitals', () => {
      const result = triage({
        symptoms: [{ name: 'cough', severity: 'mild' }],
        vitals: {
          temperature: 36.8,
          spo2: 98,
          bp_systolic: 120,
          bp_diastolic: 80,
          pulse: 72,
          respiratory_rate: 16,
          blood_glucose: 95,
          pain_score: 2,
        },
        age: 30,
      });
      const vitalScores = result.scoring_breakdown.filter((s) => s.source === 'vitals');
      expect(vitalScores.length).toBe(0);
      expect(result.triage_level).toBe('A');
    });

    it('produces high vitals score for hyperpyrexia (40.5 C)', () => {
      const result = triage({
        symptoms: [{ name: 'high fever', severity: 'severe' }],
        vitals: { temperature: 40.5 },
      });
      const tempScore = result.scoring_breakdown.find((s) => s.factor === 'Temperature');
      expect(tempScore).toBeDefined();
      expect(tempScore!.score).toBe(15);
    });

    it('scores critical hypoxia (SpO2 < 85)', () => {
      const result = triage({
        symptoms: [{ name: 'shortness of breath', severity: 'severe' }],
        vitals: { spo2: 82 },
      });
      const spo2Score = result.scoring_breakdown.find((s) => s.factor.includes('SpO2'));
      expect(spo2Score).toBeDefined();
      expect(spo2Score!.score).toBe(20);
      expect(result.triage_level).toBe('C');
    });

    it('scores severe hypotension (systolic < 70)', () => {
      const result = triage({
        symptoms: [{ name: 'dizziness', severity: 'severe' }],
        vitals: { bp_systolic: 65, bp_diastolic: 40 },
      });
      expect(result.triage_level).toBe('C');
    });

    it('scores hypertensive crisis (systolic >= 200)', () => {
      const result = triage({
        symptoms: [{ name: 'severe headache', severity: 'severe' }],
        vitals: { bp_systolic: 210, bp_diastolic: 120 },
      });
      expect(result.triage_level).toBe('C');
    });

    it('scores severe hypoglycemia (blood glucose < 40)', () => {
      const result = triage({
        symptoms: [{ name: 'altered consciousness', severity: 'severe' }],
        vitals: { blood_glucose: 32 },
      });
      const bgScore = result.scoring_breakdown.find((s) => s.factor.includes('Blood Glucose'));
      expect(bgScore).toBeDefined();
      expect(bgScore!.score).toBe(15);
    });

    it('applies pediatric pulse thresholds for children under 5', () => {
      const result = triage({
        symptoms: [{ name: 'fever', severity: 'moderate' }],
        vitals: { pulse: 170, temperature: 39.0 },
        age: 3,
      });
      const hrScore = result.scoring_breakdown.find((s) => s.factor.includes('Heart Rate'));
      expect(hrScore).toBeDefined();
      expect(hrScore!.score).toBe(10);
    });

    it('applies pediatric respiratory rate thresholds for infants', () => {
      const result = triage({
        symptoms: [{ name: 'cough', severity: 'moderate' }],
        vitals: { respiratory_rate: 55 },
        age: 1,
      });
      const rrScore = result.scoring_breakdown.find((s) => s.factor.includes('Respiratory Rate'));
      expect(rrScore).toBeDefined();
      expect(rrScore!.score).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Triage Level Assignment
  // ---------------------------------------------------------------------------
  describe('Triage level assignment', () => {
    it('assigns level A for mild headache with normal vitals (non-urgent)', () => {
      const result = triage({
        symptoms: [{ name: 'headache', severity: 'mild' }],
        vitals: { temperature: 36.5, pulse: 72, spo2: 99, bp_systolic: 118 },
        age: 25,
      });
      expect(result.triage_level).toBe('A');
      expect(result.needs_immediate_attention).toBe(false);
      expect(result.recommended_wait_minutes).toBe(120);
    });

    it('assigns level B for moderate fever with body ache (urgent)', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'moderate', onset: 'sudden', frequency: 'constant' },
          { name: 'body ache', severity: 'moderate' },
          { name: 'headache', severity: 'moderate' },
        ],
        vitals: { temperature: 39.2, pulse: 98, bp_systolic: 110 },
        age: 45,
        medical_history: makeHistory({ conditions: ['diabetes'] }),
      });
      expect(result.triage_level).toBe('B');
      expect(result.recommended_wait_minutes).toBe(30);
    });

    it('assigns level C for critical red flag regardless of score', () => {
      const result = triage({
        symptoms: [{ name: 'seizure', severity: 'severe' }],
        vitals: { pulse: 80, bp_systolic: 115, spo2: 96 },
      });
      expect(result.triage_level).toBe('C');
      expect(result.needs_immediate_attention).toBe(true);
    });

    it('assigns level C when SpO2 < 88 even without red flag symptoms', () => {
      const result = triage({
        symptoms: [{ name: 'cough', severity: 'mild' }],
        vitals: { spo2: 85 },
      });
      expect(result.triage_level).toBe('C');
    });

    it('assigns level C when pulse > 160', () => {
      const result = triage({
        symptoms: [{ name: 'palpitations', severity: 'severe' }],
        vitals: { pulse: 165 },
        age: 40,
      });
      expect(result.triage_level).toBe('C');
    });
  });

  // ---------------------------------------------------------------------------
  // Comorbidity Risk Multipliers
  // ---------------------------------------------------------------------------
  describe('Comorbidity risk multipliers', () => {
    it('applies diabetes risk multiplier (1.3x)', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'moderate' },
          { name: 'cough', severity: 'moderate' },
        ],
        vitals: { temperature: 38.8 },
        medical_history: makeHistory({ conditions: ['Type 2 Diabetes'] }),
      });
      const comorbidityDetail = result.scoring_breakdown.find((s) => s.source === 'comorbidity');
      expect(comorbidityDetail).toBeDefined();
      expect(comorbidityDetail!.detail).toContain('1.3');
    });

    it('applies heart failure risk multiplier (1.6x)', () => {
      const result = triage({
        symptoms: [{ name: 'shortness of breath', severity: 'moderate' }],
        vitals: { spo2: 93 },
        medical_history: makeHistory({ conditions: ['heart failure'] }),
      });
      const comorbidityDetail = result.scoring_breakdown.find((s) => s.source === 'comorbidity');
      expect(comorbidityDetail).toBeDefined();
      expect(comorbidityDetail!.detail).toContain('1.6');
    });

    it('applies high-risk medication multiplier for warfarin', () => {
      const result = triage({
        symptoms: [{ name: 'blood in stool', severity: 'moderate' }],
        vitals: {},
        medical_history: makeHistory({ medications: ['Warfarin 5mg'] }),
      });
      const comorbidityDetail = result.scoring_breakdown.find((s) => s.source === 'comorbidity');
      expect(comorbidityDetail).toBeDefined();
      expect(comorbidityDetail!.detail).toContain('Warfarin');
    });

    it('uses max multiplier among multiple comorbidities', () => {
      const result = triage({
        symptoms: [{ name: 'fever', severity: 'moderate' }],
        vitals: { temperature: 38.5 },
        medical_history: makeHistory({
          conditions: ['diabetes', 'heart failure', 'hypertension'],
        }),
      });
      const comorbidityDetail = result.scoring_breakdown.find((s) => s.source === 'comorbidity');
      expect(comorbidityDetail).toBeDefined();
      expect(comorbidityDetail!.detail).toContain('1.6');
    });
  });

  // ---------------------------------------------------------------------------
  // Age Risk
  // ---------------------------------------------------------------------------
  describe('Age risk adjustment', () => {
    it('applies highest multiplier for neonates (age < 1)', () => {
      const result = triage({
        symptoms: [{ name: 'fever', severity: 'moderate' }],
        vitals: { temperature: 38.5 },
        age: 0,
      });
      const ageDetail = result.scoring_breakdown.find((s) => s.source === 'age');
      expect(ageDetail).toBeDefined();
      expect(ageDetail!.detail).toContain('Neonate');
    });

    it('applies under-5 risk multiplier', () => {
      const result = triage({
        symptoms: [{ name: 'diarrhea', severity: 'moderate' }],
        vitals: {},
        age: 3,
      });
      const ageDetail = result.scoring_breakdown.find((s) => s.source === 'age');
      expect(ageDetail).toBeDefined();
      expect(ageDetail!.detail).toContain('Under-5');
    });

    it('applies elderly risk for age >= 75', () => {
      const result = triage({
        symptoms: [{ name: 'chest pain', severity: 'moderate' }],
        vitals: {},
        age: 80,
      });
      const ageDetail = result.scoring_breakdown.find((s) => s.source === 'age');
      expect(ageDetail!.detail).toContain('Elderly');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('handles empty symptoms array', () => {
      const result = triage({
        symptoms: [],
        vitals: { temperature: 36.5, pulse: 72 },
      });
      expect(result.triage_level).toBe('A');
      expect(result.urgency_score).toBeLessThanOrEqual(100);
      expect(result.urgency_score).toBeGreaterThanOrEqual(0);
    });

    it('handles empty vitals object', () => {
      const result = triage({
        symptoms: [{ name: 'cough', severity: 'mild' }],
        vitals: {},
      });
      expect(result.triage_level).toBe('A');
      expect(result.urgency_score).toBeDefined();
    });

    it('handles empty symptoms AND empty vitals', () => {
      const result = triage({ symptoms: [], vitals: {} });
      expect(result.triage_level).toBe('A');
      expect(result.urgency_score).toBe(0);
    });

    it('clamps urgency score to 0-100 range', () => {
      const result = triage({
        symptoms: [
          { name: 'chest pain', severity: 'severe', onset: 'sudden', frequency: 'constant' },
          { name: 'shortness of breath', severity: 'severe', onset: 'sudden', frequency: 'constant' },
          { name: 'altered consciousness', severity: 'severe' },
        ],
        vitals: {
          spo2: 78,
          pulse: 155,
          bp_systolic: 65,
          temperature: 40.5,
          blood_glucose: 30,
          pain_score: 10,
        },
        age: 80,
        medical_history: makeHistory({ conditions: ['heart failure'], medications: ['Warfarin 5mg'] }),
      });
      expect(result.urgency_score).toBeLessThanOrEqual(100);
      expect(result.urgency_score).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Prosody Scoring
  // ---------------------------------------------------------------------------
  describe('Prosody scoring', () => {
    it('adds prosody score for high distress and pain indicators', () => {
      const result = triage({
        symptoms: [{ name: 'abdominal pain', severity: 'severe' }],
        vitals: {},
        prosody_scores: {
          distress: 0.9,
          pain: 0.85,
          breathlessness: 0.8,
          anxiety: 0.5,
          fatigue: 0.3,
          confidence: 0.6,
        },
      });
      const prosodyDetail = result.scoring_breakdown.find((s) => s.source === 'prosody');
      expect(prosodyDetail).toBeDefined();
      expect(prosodyDetail!.score).toBeGreaterThan(0);
    });

    it('adds no prosody score when indicators are low', () => {
      const result = triage({
        symptoms: [{ name: 'cough', severity: 'mild' }],
        vitals: {},
        prosody_scores: {
          distress: 0.1,
          pain: 0.1,
          breathlessness: 0.1,
          anxiety: 0.1,
          fatigue: 0.1,
          confidence: 0.9,
        },
      });
      const prosodyDetail = result.scoring_breakdown.find((s) => s.source === 'prosody');
      expect(prosodyDetail).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Full Pipeline: Realistic Clinical Scenarios
  // ---------------------------------------------------------------------------
  describe('Full triage pipeline - clinical scenarios', () => {
    it('Scenario: Rural patient with mild URTI (common cold) - Level A', () => {
      const result = triage({
        symptoms: [
          { name: 'cough', severity: 'mild', onset: 'gradual', frequency: 'intermittent' },
          { name: 'runny nose', severity: 'mild' },
        ],
        vitals: { temperature: 37.2, pulse: 76, spo2: 98, bp_systolic: 115 },
        age: 28,
        gender: 'female',
        chief_complaint: 'khansi aur nazla (cough and cold)',
      });
      expect(result.triage_level).toBe('A');
      expect(result.is_ai_assisted).toBe(true);
      expect(result.session_id).toBe('test-session-001');
      expect(result.clinical_impression).toContain('28-year-old female');
    });

    it('Scenario: Elderly diabetic with fever and UTI symptoms - Level B', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'moderate', onset: 'sudden', frequency: 'constant' },
          { name: 'burning urination', severity: 'moderate' },
          { name: 'lower abdominal pain', severity: 'moderate' },
        ],
        vitals: { temperature: 39.0, pulse: 96, bp_systolic: 135, spo2: 96 },
        age: 68,
        gender: 'female',
        medical_history: makeHistory({ conditions: ['Type 2 Diabetes', 'Hypertension'] }),
        chief_complaint: 'Tez bukhar aur peshab mein jalan (high fever and burning urination)',
      });
      expect(result.triage_level).toBe('B');
    });

    it('Scenario: Child with febrile seizure - Level C', () => {
      const result = triage({
        symptoms: [
          { name: 'seizure', severity: 'severe', onset: 'sudden' },
          { name: 'fever', severity: 'severe' },
        ],
        vitals: { temperature: 40.0, pulse: 160, respiratory_rate: 35 },
        age: 2,
        gender: 'male',
        chief_complaint: 'Bacche ko bukhar mein daure aa rahe hain (child having seizures with fever)',
      });
      expect(result.triage_level).toBe('C');
      expect(result.needs_immediate_attention).toBe(true);
      expect(result.recommended_wait_minutes).toBe(0);
      expect(result.red_flags.some((rf) => rf.flag.includes('Febrile Seizure'))).toBe(true);
    });

    it('Scenario: Severe malaria with altered consciousness - Level C', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'severe', onset: 'sudden', frequency: 'intermittent' },
          { name: 'altered consciousness', severity: 'severe' },
        ],
        vitals: { temperature: 40.2, pulse: 118, bp_systolic: 95, spo2: 93 },
        age: 22,
        gender: 'male',
        chief_complaint: 'Tez bukhar ke saath behoshi (high fever with unconsciousness)',
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Severe Malaria'))).toBe(true);
    });

    it('Scenario: Pregnant woman with Eclampsia - Level C', () => {
      const result = triage({
        symptoms: [
          { name: 'seizure', severity: 'severe' },
          { name: 'pregnancy', severity: 'moderate' },
        ],
        vitals: { bp_systolic: 175, bp_diastolic: 110, pulse: 105 },
        age: 24,
        gender: 'female',
        medical_history: makeHistory({ conditions: ['pregnancy'] }),
      });
      expect(result.triage_level).toBe('C');
      expect(result.red_flags.some((rf) => rf.flag.includes('Eclampsia'))).toBe(true);
    });

    it('produces valid result structure with all required fields', () => {
      const result = triage({
        symptoms: [{ name: 'headache', severity: 'mild' }],
        vitals: { temperature: 36.8 },
      });
      expect(result).toHaveProperty('session_id');
      expect(result).toHaveProperty('triage_level');
      expect(result).toHaveProperty('urgency_score');
      expect(result).toHaveProperty('needs_immediate_attention');
      expect(result).toHaveProperty('scoring_breakdown');
      expect(result).toHaveProperty('red_flags');
      expect(result).toHaveProperty('recommended_action');
      expect(result).toHaveProperty('recommended_wait_minutes');
      expect(result).toHaveProperty('clinical_impression');
      expect(result).toHaveProperty('assessed_at');
      expect(result).toHaveProperty('is_ai_assisted');
      expect(['A', 'B', 'C']).toContain(result.triage_level);
      expect(typeof result.assessed_at).toBe('string');
      expect(new Date(result.assessed_at).getTime()).not.toBeNaN();
    });

    it('includes chief complaint in clinical impression when provided', () => {
      const result = triage({
        symptoms: [{ name: 'abdominal pain', severity: 'moderate' }],
        vitals: {},
        age: 40,
        gender: 'male',
        chief_complaint: 'pet mein dard',
      });
      expect(result.clinical_impression).toContain('pet mein dard');
    });

    it('includes symptom names in clinical impression when no chief complaint', () => {
      const result = triage({
        symptoms: [
          { name: 'fever', severity: 'moderate' },
          { name: 'cough', severity: 'moderate' },
        ],
        vitals: {},
      });
      expect(result.clinical_impression).toContain('fever');
      expect(result.clinical_impression).toContain('cough');
    });
  });

  // ---------------------------------------------------------------------------
  // Symptom Severity Aggregation
  // ---------------------------------------------------------------------------
  describe('Symptom severity aggregation', () => {
    it('weights severe + sudden + constant symptoms higher', () => {
      const mild = triage({
        symptoms: [{ name: 'headache', severity: 'mild', onset: 'gradual', frequency: 'episodic' }],
        vitals: {},
      });
      const severe = triage({
        symptoms: [{ name: 'headache', severity: 'severe', onset: 'sudden', frequency: 'constant' }],
        vitals: {},
      });
      expect(severe.urgency_score).toBeGreaterThan(mild.urgency_score);
    });
  });
});
