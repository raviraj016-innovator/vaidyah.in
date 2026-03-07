import { describe, it, expect } from 'vitest';
import { runTriage, getAgeGroup } from '../triage-rules';
import type { TriageInput, AcuityLevel } from '../triage-rules';
import type { SymptomEntry } from '../symptoms';

function makeSymptom(overrides: Partial<SymptomEntry> = {}): SymptomEntry {
  return {
    id: 'TEST_SYMPTOM',
    name: 'Test symptom',
    nameHi: 'टेस्ट',
    bodySystem: 'systemic',
    category: 'constitutional',
    associatedConditions: [],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [],
    aliases: [],
    aliasesHi: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    symptoms: [],
    patient: { ageYears: 30, gender: 'male' },
    ...overrides,
  };
}

describe('getAgeGroup', () => {
  it('classifies neonates', () => {
    expect(getAgeGroup(0.01)).toBe('neonate_0_28d');
  });
  it('classifies infants', () => {
    expect(getAgeGroup(0.5)).toBe('infant_1_12m');
  });
  it('classifies toddlers', () => {
    expect(getAgeGroup(2)).toBe('toddler_1_3y');
  });
  it('classifies preschoolers', () => {
    expect(getAgeGroup(4)).toBe('preschool_3_5y');
  });
  it('classifies children', () => {
    expect(getAgeGroup(8)).toBe('child_5_12y');
  });
  it('classifies adolescents', () => {
    expect(getAgeGroup(15)).toBe('adolescent_12y');
  });
  it('classifies adults', () => {
    expect(getAgeGroup(30)).toBe('adult');
  });
});

describe('runTriage', () => {
  it('returns non-urgent / self-care for adult with normal vitals and no symptoms', () => {
    const result = runTriage(makeInput({
      vitals: { temperature: 36.6, heartRate: 75, systolicBP: 120, oxygenSaturation: 98 },
    }));
    expect(['non-urgent', 'self-care']).toContain(result.acuity);
  });

  it('returns at least semi-urgent for adult tachycardia (HR 130)', () => {
    const result = runTriage(makeInput({
      vitals: { heartRate: 130 },
    }));
    expect(['emergent', 'urgent', 'semi-urgent']).toContain(result.acuity);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('returns emergent for critical vitals (SpO2 85%, SBP 70)', () => {
    const result = runTriage(makeInput({
      vitals: { oxygenSaturation: 85, systolicBP: 70 },
    }));
    expect(result.acuity).toBe('emergent');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('detects infant bradycardia (HR 80 is low for infant)', () => {
    const result = runTriage(makeInput({
      patient: { ageYears: 0.5, gender: 'female' },
      vitals: { heartRate: 75 },
    }));
    // HR 75 is below normal infant range (80-160), should trigger bradycardia
    expect(result.redFlagsTriggered.join(',')).toContain('Bradycardia');
  });

  it('treats normal child vitals as non-urgent', () => {
    const result = runTriage(makeInput({
      patient: { ageYears: 2, gender: 'male' },
      vitals: { heartRate: 110, respiratoryRate: 28, systolicBP: 95 },
    }));
    // HR 110 and RR 28 are normal for a 2-year-old
    expect(result.redFlagsTriggered.filter(f => f.includes('Tachycardia'))).toHaveLength(0);
  });

  it('returns emergent for multiple red-flag symptoms', () => {
    const result = runTriage(makeInput({
      symptoms: [
        makeSymptom({ id: 'CHEST_PAIN', name: 'Chest pain', redFlag: true }),
        makeSymptom({ id: 'BREATHLESSNESS', name: 'Breathlessness', redFlag: true }),
        makeSymptom({ id: 'SEIZURE', name: 'Seizure', redFlag: true }),
      ],
    }));
    expect(result.acuity).toBe('emergent');
    expect(result.redFlagsTriggered.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty symptom list without crashing', () => {
    const result = runTriage(makeInput());
    expect(result).toBeDefined();
    expect(result.acuity).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('returns emergent for HR = 0 (cardiac arrest)', () => {
    const result = runTriage(makeInput({
      vitals: { heartRate: 0 },
    }));
    expect(result.acuity).toBe('emergent');
    expect(result.score).toBe(100);
    expect(result.redFlagsTriggered.join(',')).toContain('Cardiac arrest');
  });

  it('throws on invalid temperature (< 25)', () => {
    expect(() => runTriage(makeInput({
      vitals: { temperature: 15 },
    }))).toThrow(/Invalid temperature/);
  });

  it('throws on negative heart rate', () => {
    expect(() => runTriage(makeInput({
      vitals: { heartRate: -5 },
    }))).toThrow(/Invalid heart rate/);
  });

  it('all acuity levels are reachable', () => {
    const levels = new Set<AcuityLevel>();

    // self-care: no symptoms, no vitals
    levels.add(runTriage(makeInput()).acuity);

    // non-urgent: mild symptom
    levels.add(runTriage(makeInput({
      symptoms: [makeSymptom({ defaultSeverity: 'mild' })],
    })).acuity);

    // semi-urgent: moderate symptoms
    levels.add(runTriage(makeInput({
      symptoms: [
        makeSymptom({ defaultSeverity: 'severe' }),
        makeSymptom({ id: 'S2', defaultSeverity: 'severe' }),
        makeSymptom({ id: 'S3', defaultSeverity: 'severe' }),
      ],
      durationDays: 10,
    })).acuity);

    // urgent: abnormal vitals + symptoms
    levels.add(runTriage(makeInput({
      vitals: { heartRate: 130, oxygenSaturation: 91 },
      symptoms: [makeSymptom({ defaultSeverity: 'severe' })],
    })).acuity);

    // emergent: red flags + critical vitals
    levels.add(runTriage(makeInput({
      vitals: { heartRate: 0 },
    })).acuity);

    expect(levels.size).toBe(5);
  });

  it('assigns correct referral types per acuity', () => {
    const emergent = runTriage(makeInput({
      vitals: { heartRate: 0 },
    }));
    expect(emergent.referralNeeded).toBe(true);
    expect(emergent.referralType).toBe('district-hospital');

    const selfCare = runTriage(makeInput());
    expect(selfCare.referralNeeded).toBe(false);
    expect(selfCare.referralType).toBeUndefined();
  });

  it('adds vulnerability score for elderly patients', () => {
    const elderly = runTriage(makeInput({
      patient: { ageYears: 70, gender: 'male' },
      symptoms: [makeSymptom()],
    }));
    const young = runTriage(makeInput({
      patient: { ageYears: 30, gender: 'male' },
      symptoms: [makeSymptom()],
    }));
    expect(elderly.score).toBeGreaterThan(young.score);
  });

  it('adds vulnerability score for pregnant patients', () => {
    const pregnant = runTriage(makeInput({
      patient: { ageYears: 28, gender: 'female', pregnant: true },
      symptoms: [makeSymptom()],
    }));
    const notPregnant = runTriage(makeInput({
      patient: { ageYears: 28, gender: 'female' },
      symptoms: [makeSymptom()],
    }));
    expect(pregnant.score).toBeGreaterThan(notPregnant.score);
  });

  it('escalates score for known comorbidities', () => {
    const withDiabetes = runTriage(makeInput({
      patient: { ageYears: 50, gender: 'male', knownConditions: ['E11.9'] },
      symptoms: [makeSymptom()],
    }));
    const withoutComorb = runTriage(makeInput({
      patient: { ageYears: 50, gender: 'male' },
      symptoms: [makeSymptom()],
    }));
    expect(withDiabetes.score).toBeGreaterThan(withoutComorb.score);
  });
});
