/**
 * Comprehensive unit tests for the ICD-10 medical ontology module.
 *
 * Covers:
 *  1. ICD-10 code lookup (by code, by description, partial match)
 *  2. Symptom-to-ICD mapping (common symptoms map to correct ICD codes)
 *  3. Triage rule validation (required fields, severity levels are valid)
 *  4. Symptom database integrity (no duplicates, all required fields present)
 *  5. Category filtering (body system, severity, etc.)
 *  6. Edge cases (empty inputs, invalid codes, special characters)
 */

import {
  ICD10Entry,
  ICD10_CODES,
  getICD10Entry,
  searchICD10,
  getICD10ByCategory,
  getICD10ByBodySystem,
  getNotifiableDiseases,
  getConditionsRequiringReferral,
  getCategories,
  getBodySystems,
} from '../icd10';

// ===========================================================================
// 1. ICD-10 Code Lookup
// ===========================================================================
describe('ICD-10 Code Lookup', () => {
  // ---- Exact code lookup ----
  describe('getICD10Entry - exact code lookup', () => {
    it('returns the correct entry for a valid dotted code (A01.0)', () => {
      const entry = getICD10Entry('A01.0');
      expect(entry).toBeDefined();
      expect(entry!.code).toBe('A01.0');
      expect(entry!.name).toBe('Typhoid fever');
      expect(entry!.category).toBe('Infectious');
      expect(entry!.commonInIndia).toBe(true);
      expect(entry!.notifiableDisease).toBe(true);
    });

    it('returns the correct entry for Dengue fever (A90)', () => {
      const entry = getICD10Entry('A90');
      expect(entry).toBeDefined();
      expect(entry!.name).toBe('Dengue fever');
      expect(entry!.aliases).toContain('dengue');
      expect(entry!.notifiableDisease).toBe(true);
    });

    it('returns the correct entry for Pulmonary TB (A15.0)', () => {
      const entry = getICD10Entry('A15.0');
      expect(entry).toBeDefined();
      expect(entry!.name).toContain('Tuberculosis');
      expect(entry!.requiresReferral).toBe(true);
      expect(entry!.notifiableDisease).toBe(true);
    });

    it('returns the correct entry for Type 2 Diabetes (E11.9)', () => {
      const entry = getICD10Entry('E11.9');
      expect(entry).toBeDefined();
      expect(entry!.name).toContain('Type 2 diabetes');
      expect(entry!.aliases).toContain('sugar disease');
      expect(entry!.bodySystem).toBe('endocrine');
    });

    it('returns the correct entry for Snakebite (T63.0)', () => {
      const entry = getICD10Entry('T63.0');
      expect(entry).toBeDefined();
      expect(entry!.name).toContain('snake venom');
      expect(entry!.requiresReferral).toBe(true);
      expect(entry!.commonInIndia).toBe(true);
    });

    it('returns the correct entry for Malaria (B50.9)', () => {
      const entry = getICD10Entry('B50.9');
      expect(entry).toBeDefined();
      expect(entry!.aliases).toContain('malaria');
      expect(entry!.notifiableDisease).toBe(true);
    });

    it('retrieves codes without a dot separator (e.g. A09, I10, R51)', () => {
      const a09 = getICD10Entry('A09');
      expect(a09).toBeDefined();
      expect(a09!.name).toContain('gastroenteritis');

      const i10 = getICD10Entry('I10');
      expect(i10).toBeDefined();
      expect(i10!.name).toContain('hypertension');

      const r51 = getICD10Entry('R51');
      expect(r51).toBeDefined();
      expect(r51!.name).toBe('Headache');
    });

    it('returns undefined for a nonexistent code', () => {
      expect(getICD10Entry('Z99.99')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
      expect(getICD10Entry('')).toBeUndefined();
    });

    it('is case-sensitive (ICD-10 codes use uppercase letters)', () => {
      expect(getICD10Entry('a01.0')).toBeUndefined();
      expect(getICD10Entry('A01.0')).toBeDefined();
    });

    it('retrieves every code listed in ICD10_CODES via getICD10Entry', () => {
      for (const code of Object.keys(ICD10_CODES)) {
        const entry = getICD10Entry(code);
        expect(entry).toBeDefined();
        expect(entry!.code).toBe(code);
      }
    });
  });

  // ---- Search by description / keyword ----
  describe('searchICD10 - search by description and keyword', () => {
    it('finds entries by exact name match', () => {
      const results = searchICD10('Typhoid fever');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((e) => e.code === 'A01.0')).toBe(true);
    });

    it('finds entries by partial name match', () => {
      const results = searchICD10('diabetes');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const codes = results.map((e) => e.code);
      expect(codes).toContain('E11.9');
      expect(codes).toContain('E10.9');
    });

    it('finds entries by alias (sugar disease)', () => {
      const results = searchICD10('sugar disease');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].code).toBe('E11.9');
    });

    it('finds entries by alias (common cold)', () => {
      const results = searchICD10('common cold');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((e) => e.code === 'J06.9')).toBe(true);
    });

    it('finds entries by alias (heart attack)', () => {
      const results = searchICD10('heart attack');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].code).toBe('I21.9');
    });

    it('performs case-insensitive search', () => {
      const upper = searchICD10('PNEUMONIA');
      const lower = searchICD10('pneumonia');
      const mixed = searchICD10('Pneumonia');
      expect(upper.length).toBe(lower.length);
      expect(lower.length).toBe(mixed.length);
      expect(upper.length).toBeGreaterThanOrEqual(1);
    });

    it('finds entries by ICD code substring (A01)', () => {
      const results = searchICD10('A01');
      expect(results.some((e) => e.code === 'A01.0')).toBe(true);
    });

    it('finds multiple dengue results (dengue + DHF)', () => {
      const results = searchICD10('dengue');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const codes = results.map((e) => e.code);
      expect(codes).toContain('A90');
      expect(codes).toContain('A91');
    });

    it('finds URTI alias', () => {
      const results = searchICD10('URTI');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].code).toBe('J06.9');
    });

    it('returns empty array for nonsense query', () => {
      const results = searchICD10('xyznonexistent123');
      expect(results).toHaveLength(0);
    });

    it('returns all entries for empty query (empty string is substring of everything)', () => {
      const results = searchICD10('');
      expect(results.length).toBe(Object.keys(ICD10_CODES).length);
    });
  });
});

// ===========================================================================
// 2. Symptom-to-ICD Mapping
// ===========================================================================
describe('Symptom-to-ICD Mapping', () => {
  const symptomMappings: { symptom: string; expectedCodes: string[] }[] = [
    { symptom: 'fever', expectedCodes: ['R50.9'] },
    { symptom: 'headache', expectedCodes: ['R51'] },
    { symptom: 'cough', expectedCodes: ['R05'] },
    { symptom: 'diarrhea', expectedCodes: ['A09'] },
    { symptom: 'vomiting', expectedCodes: ['R11'] },
    { symptom: 'back pain', expectedCodes: ['M54.5'] },
    { symptom: 'sore throat', expectedCodes: ['J02.9'] },
    { symptom: 'UTI', expectedCodes: ['N39.0'] },
    { symptom: 'heart attack', expectedCodes: ['I21.9'] },
    { symptom: 'depression', expectedCodes: ['F32.9'] },
    { symptom: 'anxiety', expectedCodes: ['F41.9'] },
    { symptom: 'anemia', expectedCodes: ['D50.9'] },
    { symptom: 'malaria', expectedCodes: ['B50.9', 'B51.9', 'B54'] },
    { symptom: 'dengue', expectedCodes: ['A90', 'A91'] },
    { symptom: 'snake bite', expectedCodes: ['T63.0'] },
    { symptom: 'burn', expectedCodes: ['T30.0'] },
    { symptom: 'asthma', expectedCodes: ['J45.9'] },
    { symptom: 'high blood pressure', expectedCodes: ['I10'] },
    { symptom: 'diabetes', expectedCodes: ['E11.9', 'E10.9'] },
    { symptom: 'TB', expectedCodes: ['A15.0'] },
    { symptom: 'chickenpox', expectedCodes: ['B01.9'] },
    { symptom: 'scabies', expectedCodes: ['B86'] },
    { symptom: 'kidney stone', expectedCodes: ['N20.0'] },
    { symptom: 'migraine', expectedCodes: ['G43.9'] },
    { symptom: 'epilepsy', expectedCodes: ['G40.9'] },
    { symptom: 'fatigue', expectedCodes: ['R53'] },
    { symptom: 'dizziness', expectedCodes: ['R42'] },
    { symptom: 'constipation', expectedCodes: ['K59.0'] },
    { symptom: 'acid reflux', expectedCodes: ['K21.0'] },
    { symptom: 'food poisoning', expectedCodes: ['A05.9'] },
  ];

  it.each(symptomMappings)(
    'maps "$symptom" to ICD code(s) $expectedCodes',
    ({ symptom, expectedCodes }) => {
      const results = searchICD10(symptom);
      const foundCodes = results.map((e) => e.code);
      for (const expected of expectedCodes) {
        expect(foundCodes).toContain(expected);
      }
    }
  );

  it('maps colloquial Indian terms (aliases) to the right codes', () => {
    const sugarDisease = searchICD10('sugar disease');
    expect(sugarDisease.some((e) => e.code === 'E11.9')).toBe(true);

    const fits = searchICD10('fits');
    expect(fits.some((e) => e.code === 'G40.9')).toBe(true);

    const yellowBaby = searchICD10('yellow baby');
    expect(yellowBaby.some((e) => e.code === 'P59.9')).toBe(true);
  });

  it('maps medical abbreviations to the right codes', () => {
    const abbreviations: { abbr: string; expectedCode: string }[] = [
      { abbr: 'URTI', expectedCode: 'J06.9' },
      { abbr: 'COPD', expectedCode: 'J44.1' },
      { abbr: 'CHF', expectedCode: 'I50.9' },
      { abbr: 'CVA', expectedCode: 'I63.9' },
      { abbr: 'GAD', expectedCode: 'F41.9' },
      { abbr: 'MI', expectedCode: 'I21.9' },
      { abbr: 'HTN', expectedCode: 'I10' },
      { abbr: 'DM2', expectedCode: 'E11.9' },
      { abbr: 'DM1', expectedCode: 'E10.9' },
      { abbr: 'PTB', expectedCode: 'A15.0' },
      { abbr: 'DHF', expectedCode: 'A91' },
      { abbr: 'PUO', expectedCode: 'R50.9' },
      { abbr: 'IHD', expectedCode: 'I25.1' },
      { abbr: 'PEM', expectedCode: 'E46' },
    ];

    for (const { abbr, expectedCode } of abbreviations) {
      const results = searchICD10(abbr);
      const codes = results.map((e) => e.code);
      expect(codes).toContain(expectedCode);
    }
  });
});

// ===========================================================================
// 3. Triage Rule Validation
// ===========================================================================
describe('Triage Rule Validation', () => {
  const validSeverityLevels: readonly string[] = ['mild', 'moderate', 'severe'];

  describe('every entry has all required ICD10Entry fields', () => {
    const requiredStringFields: (keyof ICD10Entry)[] = [
      'code',
      'name',
      'category',
      'bodySystem',
    ];
    const requiredBooleanFields: (keyof ICD10Entry)[] = [
      'commonInIndia',
      'requiresReferral',
      'notifiableDisease',
    ];

    it('all entries have non-empty string fields (code, name, category, bodySystem)', () => {
      for (const [code, entry] of Object.entries(ICD10_CODES)) {
        for (const field of requiredStringFields) {
          expect(typeof entry[field]).toBe('string');
          expect((entry[field] as string).length).toBeGreaterThan(0);
        }
        // Code must match its record key
        expect(entry.code).toBe(code);
      }
    });

    it('all entries have boolean fields (commonInIndia, requiresReferral, notifiableDisease)', () => {
      for (const entry of Object.values(ICD10_CODES)) {
        for (const field of requiredBooleanFields) {
          expect(typeof entry[field]).toBe('boolean');
        }
      }
    });

    it('all entries have a non-empty aliases array with non-empty strings', () => {
      for (const entry of Object.values(ICD10_CODES)) {
        expect(Array.isArray(entry.aliases)).toBe(true);
        expect(entry.aliases.length).toBeGreaterThan(0);
        for (const alias of entry.aliases) {
          expect(typeof alias).toBe('string');
          expect(alias.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('severity levels are valid', () => {
    it('every entry has a non-empty severityRange with valid levels only', () => {
      for (const entry of Object.values(ICD10_CODES)) {
        expect(Array.isArray(entry.severityRange)).toBe(true);
        expect(entry.severityRange.length).toBeGreaterThan(0);
        for (const level of entry.severityRange) {
          expect(validSeverityLevels).toContain(level);
        }
      }
    });

    it('every severity-only-severe condition requires referral or is notifiable', () => {
      const severeOnly = Object.values(ICD10_CODES).filter(
        (e) => e.severityRange.length === 1 && e.severityRange[0] === 'severe'
      );
      expect(severeOnly.length).toBeGreaterThan(0); // there should be at least one
      for (const entry of severeOnly) {
        expect(entry.requiresReferral || entry.notifiableDisease).toBe(true);
      }
    });

    it('severity ranges do not contain duplicate levels', () => {
      for (const entry of Object.values(ICD10_CODES)) {
        const uniqueLevels = new Set(entry.severityRange);
        expect(entry.severityRange.length).toBe(uniqueLevels.size);
      }
    });
  });

  describe('code field consistency', () => {
    it('every entry code field matches its record key', () => {
      for (const [key, entry] of Object.entries(ICD10_CODES)) {
        expect(entry.code).toBe(key);
      }
    });
  });

  describe('referral conditions include critical emergencies', () => {
    const criticalCodes = ['I21.9', 'I63.9', 'T63.0', 'O14.1', 'A91'];

    it.each(criticalCodes)(
      'critical code %s requires referral',
      (code) => {
        const entry = getICD10Entry(code);
        expect(entry).toBeDefined();
        expect(entry!.requiresReferral).toBe(true);
      }
    );
  });

  describe('notifiable diseases include mandatory reportable conditions', () => {
    const notifiableCodes = ['A01.0', 'A15.0', 'A90', 'A91', 'B50.9', 'B51.9', 'B54', 'B05.9'];

    it.each(notifiableCodes)(
      'code %s is flagged as notifiable',
      (code) => {
        const entry = getICD10Entry(code);
        expect(entry).toBeDefined();
        expect(entry!.notifiableDisease).toBe(true);
      }
    );
  });
});

// ===========================================================================
// 4. Symptom Database Integrity
// ===========================================================================
describe('Symptom Database Integrity', () => {
  it('has no duplicate ICD-10 codes (keys)', () => {
    const codes = Object.keys(ICD10_CODES);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
  });

  it('has no duplicate names across entries', () => {
    const names = Object.values(ICD10_CODES).map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('contains a meaningful number of entries (at least 50)', () => {
    const count = Object.keys(ICD10_CODES).length;
    expect(count).toBeGreaterThanOrEqual(50);
  });

  it('has all entries marked as commonInIndia (dataset is India-specific)', () => {
    const allCommon = Object.values(ICD10_CODES).every((e) => e.commonInIndia);
    expect(allCommon).toBe(true);
  });

  it('every code follows the ICD-10 format (letter followed by digits, optional dot + digits)', () => {
    const icd10Pattern = /^[A-Z]\d{2}(\.\d{1,2})?$/;
    for (const code of Object.keys(ICD10_CODES)) {
      expect(code).toMatch(icd10Pattern);
    }
  });

  it('no alias is an empty or whitespace-only string', () => {
    for (const entry of Object.values(ICD10_CODES)) {
      for (const alias of entry.aliases) {
        expect(alias.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('body system values are lowercase', () => {
    for (const entry of Object.values(ICD10_CODES)) {
      expect(entry.bodySystem).toBe(entry.bodySystem.toLowerCase());
    }
  });

  it('every entry has at least one alias', () => {
    for (const entry of Object.values(ICD10_CODES)) {
      expect(entry.aliases.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all infectious/parasitic codes (A/B prefix) are categorized as Infectious or Dermatological', () => {
    const abCodes = Object.values(ICD10_CODES).filter(
      (e) => e.code.startsWith('A') || e.code.startsWith('B')
    );
    for (const entry of abCodes) {
      expect(['Infectious', 'Dermatological']).toContain(entry.category);
    }
  });

  it('mental health conditions (F prefix) are in the psychiatric body system', () => {
    const fCodes = Object.values(ICD10_CODES).filter((e) => e.code.startsWith('F'));
    expect(fCodes.length).toBeGreaterThan(0);
    for (const entry of fCodes) {
      expect(entry.bodySystem).toBe('psychiatric');
    }
  });

  it('injury codes (S/T prefix) are in the Injury category', () => {
    const injuryCodes = Object.values(ICD10_CODES).filter(
      (e) => e.code.startsWith('S') || e.code.startsWith('T')
    );
    expect(injuryCodes.length).toBeGreaterThan(0);
    for (const entry of injuryCodes) {
      expect(entry.category).toBe('Injury');
    }
  });
});

// ===========================================================================
// 5. Category & Body System Filtering
// ===========================================================================
describe('Category Filtering', () => {
  // ---- getICD10ByCategory ----
  describe('getICD10ByCategory', () => {
    it('returns all Infectious disease entries', () => {
      const results = getICD10ByCategory('Infectious');
      expect(results.length).toBeGreaterThanOrEqual(5);
      results.forEach((e) => expect(e.category).toBe('Infectious'));
    });

    it('returns all Respiratory entries', () => {
      const results = getICD10ByCategory('Respiratory');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.category).toBe('Respiratory'));
    });

    it('returns all Cardiovascular entries', () => {
      const results = getICD10ByCategory('Cardiovascular');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.category).toBe('Cardiovascular'));
    });

    it('returns all Endocrine entries', () => {
      const results = getICD10ByCategory('Endocrine');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.category).toBe('Endocrine'));
    });

    it('returns all Musculoskeletal entries', () => {
      const results = getICD10ByCategory('Musculoskeletal');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.category).toBe('Musculoskeletal'));
    });

    it('returns all Mental Health entries', () => {
      const results = getICD10ByCategory('Mental Health');
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach((e) => expect(e.category).toBe('Mental Health'));
    });

    it('is case-insensitive', () => {
      const lower = getICD10ByCategory('infectious');
      const upper = getICD10ByCategory('INFECTIOUS');
      const mixed = getICD10ByCategory('Infectious');
      expect(lower.length).toBe(upper.length);
      expect(upper.length).toBe(mixed.length);
      expect(lower.length).toBeGreaterThan(0);
    });

    it('returns empty array for nonexistent category', () => {
      expect(getICD10ByCategory('Nonexistent')).toEqual([]);
    });

    it('partitions all entries when iterated over all categories (no entry left out)', () => {
      const categories = getCategories();
      let total = 0;
      for (const cat of categories) {
        total += getICD10ByCategory(cat).length;
      }
      expect(total).toBe(Object.keys(ICD10_CODES).length);
    });

    it('includes all expected categories', () => {
      const categories = getCategories();
      const expectedCategories = [
        'Infectious',
        'Respiratory',
        'Cardiovascular',
        'Endocrine',
        'Musculoskeletal',
        'Gastrointestinal',
        'Dermatological',
        'Neurological',
        'Mental Health',
        'Injury',
        'Obstetric',
        'Nutritional',
        'Pediatric',
        'General',
      ];
      for (const expected of expectedCategories) {
        expect(categories).toContain(expected);
      }
    });
  });

  // ---- getICD10ByBodySystem ----
  describe('getICD10ByBodySystem', () => {
    it('returns gastrointestinal entries', () => {
      const results = getICD10ByBodySystem('gastrointestinal');
      expect(results.length).toBeGreaterThanOrEqual(5);
      results.forEach((e) => expect(e.bodySystem).toBe('gastrointestinal'));
    });

    it('returns respiratory entries', () => {
      const results = getICD10ByBodySystem('respiratory');
      expect(results.length).toBeGreaterThanOrEqual(4);
      results.forEach((e) => expect(e.bodySystem).toBe('respiratory'));
    });

    it('returns cardiovascular entries', () => {
      const results = getICD10ByBodySystem('cardiovascular');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.bodySystem).toBe('cardiovascular'));
    });

    it('returns skin entries', () => {
      const results = getICD10ByBodySystem('skin');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.bodySystem).toBe('skin'));
    });

    it('returns neurological entries', () => {
      const results = getICD10ByBodySystem('neurological');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.bodySystem).toBe('neurological'));
    });

    it('returns psychiatric entries', () => {
      const results = getICD10ByBodySystem('psychiatric');
      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach((e) => expect(e.bodySystem).toBe('psychiatric'));
    });

    it('returns systemic entries', () => {
      const results = getICD10ByBodySystem('systemic');
      expect(results.length).toBeGreaterThanOrEqual(3);
      results.forEach((e) => expect(e.bodySystem).toBe('systemic'));
    });

    it('is case-insensitive', () => {
      const upper = getICD10ByBodySystem('CARDIOVASCULAR');
      const lower = getICD10ByBodySystem('cardiovascular');
      expect(upper.length).toBe(lower.length);
      expect(upper.length).toBeGreaterThan(0);
    });

    it('returns empty array for nonexistent body system', () => {
      expect(getICD10ByBodySystem('imaginarySystem')).toEqual([]);
    });

    it('includes all expected body systems', () => {
      const systems = getBodySystems();
      const expectedSystems = [
        'gastrointestinal',
        'respiratory',
        'cardiovascular',
        'endocrine',
        'musculoskeletal',
        'skin',
        'neurological',
        'psychiatric',
        'systemic',
        'genitourinary',
        'eye',
        'ear',
        'reproductive',
        'hematologic',
        'hepatic',
      ];
      for (const expected of expectedSystems) {
        expect(systems).toContain(expected);
      }
    });

    it('partitions all entries when iterated over all body systems', () => {
      const systems = getBodySystems();
      let total = 0;
      for (const sys of systems) {
        total += getICD10ByBodySystem(sys).length;
      }
      expect(total).toBe(Object.keys(ICD10_CODES).length);
    });
  });

  // ---- getNotifiableDiseases ----
  describe('getNotifiableDiseases', () => {
    it('returns only entries with notifiableDisease === true', () => {
      const results = getNotifiableDiseases();
      expect(results.length).toBeGreaterThanOrEqual(5);
      results.forEach((e) => expect(e.notifiableDisease).toBe(true));
    });

    it('includes typhoid, TB, dengue, malaria, and measles', () => {
      const codes = getNotifiableDiseases().map((e) => e.code);
      expect(codes).toContain('A01.0'); // Typhoid
      expect(codes).toContain('A15.0'); // TB
      expect(codes).toContain('A90');   // Dengue
      expect(codes).toContain('B50.9'); // Malaria
      expect(codes).toContain('B05.9'); // Measles
    });

    it('does not include non-notifiable conditions', () => {
      const codes = getNotifiableDiseases().map((e) => e.code);
      expect(codes).not.toContain('J06.9'); // URTI
      expect(codes).not.toContain('M54.5'); // Low back pain
      expect(codes).not.toContain('R51');   // Headache
      expect(codes).not.toContain('E11.9'); // Diabetes
    });
  });

  // ---- getConditionsRequiringReferral ----
  describe('getConditionsRequiringReferral', () => {
    it('returns only entries with requiresReferral === true', () => {
      const results = getConditionsRequiringReferral();
      expect(results.length).toBeGreaterThanOrEqual(5);
      results.forEach((e) => expect(e.requiresReferral).toBe(true));
    });

    it('includes life-threatening emergencies', () => {
      const codes = getConditionsRequiringReferral().map((e) => e.code);
      expect(codes).toContain('I21.9'); // Heart attack
      expect(codes).toContain('I63.9'); // Stroke
      expect(codes).toContain('T63.0'); // Snake bite
      expect(codes).toContain('A15.0'); // TB
      expect(codes).toContain('A91');   // DHF
      expect(codes).toContain('O14.1'); // Pre-eclampsia
    });

    it('does not include self-limiting or PHC-manageable conditions', () => {
      const codes = getConditionsRequiringReferral().map((e) => e.code);
      expect(codes).not.toContain('J06.9'); // Common cold
      expect(codes).not.toContain('A09');   // Gastroenteritis
      expect(codes).not.toContain('L30.9'); // Dermatitis
      expect(codes).not.toContain('R50.9'); // Fever
      expect(codes).not.toContain('K59.0'); // Constipation
    });
  });

  // ---- getCategories ----
  describe('getCategories', () => {
    it('returns a non-empty array of unique strings', () => {
      const categories = getCategories();
      expect(categories.length).toBeGreaterThanOrEqual(5);
      const unique = new Set(categories);
      expect(categories.length).toBe(unique.size);
    });

    it('returns only strings', () => {
      for (const cat of getCategories()) {
        expect(typeof cat).toBe('string');
      }
    });
  });

  // ---- getBodySystems ----
  describe('getBodySystems', () => {
    it('returns a non-empty array of unique strings', () => {
      const systems = getBodySystems();
      expect(systems.length).toBeGreaterThanOrEqual(5);
      const unique = new Set(systems);
      expect(systems.length).toBe(unique.size);
    });

    it('returns only strings', () => {
      for (const sys of getBodySystems()) {
        expect(typeof sys).toBe('string');
      }
    });
  });
});

// ===========================================================================
// 6. Edge Cases
// ===========================================================================
describe('Edge Cases', () => {
  // ---- Empty and whitespace inputs ----
  describe('empty and whitespace inputs', () => {
    it('getICD10Entry with empty string returns undefined', () => {
      expect(getICD10Entry('')).toBeUndefined();
    });

    it('getICD10Entry with whitespace returns undefined', () => {
      expect(getICD10Entry('   ')).toBeUndefined();
      expect(getICD10Entry('\t')).toBeUndefined();
      expect(getICD10Entry('\n')).toBeUndefined();
    });

    it('searchICD10 with whitespace-only string returns results (space is substring of names)', () => {
      const results = searchICD10(' ');
      expect(results.length).toBeGreaterThan(0);
    });

    it('getICD10ByCategory with empty string returns empty array', () => {
      expect(getICD10ByCategory('')).toEqual([]);
    });

    it('getICD10ByBodySystem with empty string returns empty array', () => {
      expect(getICD10ByBodySystem('')).toEqual([]);
    });
  });

  // ---- Invalid ICD-10 codes ----
  describe('invalid ICD-10 codes', () => {
    it('returns undefined for a purely numeric code', () => {
      expect(getICD10Entry('12345')).toBeUndefined();
    });

    it('returns undefined for a code with an invalid prefix', () => {
      expect(getICD10Entry('ZZ9.9')).toBeUndefined();
    });

    it('returns undefined for a code with extra dot segments', () => {
      expect(getICD10Entry('A01.0.0')).toBeUndefined();
    });

    it('returns undefined for null-like string values', () => {
      expect(getICD10Entry('null')).toBeUndefined();
      expect(getICD10Entry('undefined')).toBeUndefined();
      expect(getICD10Entry('NaN')).toBeUndefined();
    });

    it('returns undefined for a code with leading/trailing spaces', () => {
      expect(getICD10Entry(' A01.0')).toBeUndefined();
      expect(getICD10Entry('A01.0 ')).toBeUndefined();
    });
  });

  // ---- Special characters in search ----
  describe('special characters in search', () => {
    it('handles special regex characters gracefully (uses string includes, not regex)', () => {
      expect(() => searchICD10('.*')).not.toThrow();
      expect(() => searchICD10('[abc]')).not.toThrow();
      expect(() => searchICD10('(test)')).not.toThrow();
      expect(() => searchICD10('a+b')).not.toThrow();
      expect(() => searchICD10('$^')).not.toThrow();
      expect(() => searchICD10('\\d+')).not.toThrow();
    });

    it('returns empty array for special characters that match nothing', () => {
      expect(searchICD10('$$$')).toEqual([]);
      expect(searchICD10('###')).toEqual([]);
      expect(searchICD10('@@@')).toEqual([]);
      expect(searchICD10('<<<>>>')).toEqual([]);
    });

    it('handles unicode characters without throwing', () => {
      expect(() => searchICD10('\u00e9')).not.toThrow();         // accented e
      expect(() => searchICD10('\u0939\u093f\u0928\u094d\u0926\u0940')).not.toThrow(); // Hindi
      expect(() => searchICD10('\u{1F600}')).not.toThrow();      // emoji
    });

    it('handles very long search strings without errors', () => {
      const longQuery = 'a'.repeat(10000);
      expect(() => searchICD10(longQuery)).not.toThrow();
      expect(searchICD10(longQuery)).toEqual([]);
    });

    it('handles the hyphen character correctly (present in names like break-bone fever)', () => {
      const results = searchICD10('break-bone');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((e) => e.code === 'A90')).toBe(true);
    });
  });

  // ---- Return type guarantees ----
  describe('return type guarantees', () => {
    it('searchICD10 always returns an array', () => {
      expect(Array.isArray(searchICD10('anything'))).toBe(true);
      expect(Array.isArray(searchICD10(''))).toBe(true);
      expect(Array.isArray(searchICD10('!!!'))).toBe(true);
    });

    it('getICD10ByCategory always returns an array', () => {
      expect(Array.isArray(getICD10ByCategory('Infectious'))).toBe(true);
      expect(Array.isArray(getICD10ByCategory('nonexistent'))).toBe(true);
      expect(Array.isArray(getICD10ByCategory(''))).toBe(true);
    });

    it('getICD10ByBodySystem always returns an array', () => {
      expect(Array.isArray(getICD10ByBodySystem('respiratory'))).toBe(true);
      expect(Array.isArray(getICD10ByBodySystem('nonexistent'))).toBe(true);
      expect(Array.isArray(getICD10ByBodySystem(''))).toBe(true);
    });

    it('getNotifiableDiseases always returns an array', () => {
      expect(Array.isArray(getNotifiableDiseases())).toBe(true);
    });

    it('getConditionsRequiringReferral always returns an array', () => {
      expect(Array.isArray(getConditionsRequiringReferral())).toBe(true);
    });

    it('getCategories always returns an array of strings', () => {
      const cats = getCategories();
      expect(Array.isArray(cats)).toBe(true);
      for (const cat of cats) {
        expect(typeof cat).toBe('string');
      }
    });

    it('getBodySystems always returns an array of strings', () => {
      const systems = getBodySystems();
      expect(Array.isArray(systems)).toBe(true);
      for (const sys of systems) {
        expect(typeof sys).toBe('string');
      }
    });
  });

  // ---- Reference behaviour ----
  describe('reference behaviour', () => {
    it('searchICD10 returns entries that reference the original objects', () => {
      const results = searchICD10('Typhoid');
      expect(results.length).toBeGreaterThan(0);
      const found = results.find((e) => e.code === 'A01.0');
      expect(found).toBe(ICD10_CODES['A01.0']);
    });

    it('getICD10Entry returns a direct reference to the record entry', () => {
      const entry = getICD10Entry('I10');
      expect(entry).toBe(ICD10_CODES['I10']);
    });
  });

  // ---- Cross-field consistency ----
  describe('cross-field consistency', () => {
    it('conditions with only severe severity and no referral flag should not exist', () => {
      const severeOnlyNoReferral = Object.values(ICD10_CODES).filter(
        (e) =>
          e.severityRange.length === 1 &&
          e.severityRange[0] === 'severe' &&
          !e.requiresReferral
      );
      expect(severeOnlyNoReferral.length).toBe(0);
    });

    it('every category returned by getCategories is non-empty when queried', () => {
      for (const cat of getCategories()) {
        expect(getICD10ByCategory(cat).length).toBeGreaterThan(0);
      }
    });

    it('every body system returned by getBodySystems is non-empty when queried', () => {
      for (const sys of getBodySystems()) {
        expect(getICD10ByBodySystem(sys).length).toBeGreaterThan(0);
      }
    });

    it('notifiable disease count is a subset of total entries', () => {
      const notifiable = getNotifiableDiseases();
      const total = Object.keys(ICD10_CODES).length;
      expect(notifiable.length).toBeGreaterThan(0);
      expect(notifiable.length).toBeLessThan(total);
    });

    it('referral condition count is a subset of total entries', () => {
      const referrals = getConditionsRequiringReferral();
      const total = Object.keys(ICD10_CODES).length;
      expect(referrals.length).toBeGreaterThan(0);
      expect(referrals.length).toBeLessThan(total);
    });
  });
});
