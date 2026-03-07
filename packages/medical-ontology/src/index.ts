/**
 * @vaidyah/medical-ontology
 *
 * Shared medical data models for the Vaidyah healthcare platform:
 *  - ICD-10 code catalogue (common Indian primary-care conditions)
 *  - Symptom taxonomy with Hindi translations
 *  - Triage rules engine
 */

// ICD-10
export {
  ICD10_CODES,
  getICD10Entry,
  searchICD10,
  getICD10ByCategory,
  getICD10ByBodySystem,
  getNotifiableDiseases,
  getConditionsRequiringReferral,
  getCategories,
  getBodySystems,
} from './icd10';
export type { ICD10Entry } from './icd10';

// Symptoms
export {
  SYMPTOMS,
  findSymptomByAlias,
  getRedFlagSymptoms,
  getSymptomsByBodySystem,
} from './symptoms';
export type { SymptomEntry, SymptomSeverity } from './symptoms';

// Triage
export { runTriage, TRIAGE_RULES } from './triage-rules';
export type {
  AcuityLevel,
  VitalSigns,
  PatientDemographics,
  TriageInput,
  TriageRuleResult,
  TriageRule,
  RuleResult,
} from './triage-rules';
