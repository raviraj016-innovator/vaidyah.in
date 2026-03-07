/**
 * Symptom taxonomy for the Vaidyah triage engine.
 *
 * Maps common patient-reported symptoms (in English and Hindi) to body systems,
 * severity indicators, and associated ICD-10 condition codes.
 */

export type SymptomSeverity = 'mild' | 'moderate' | 'severe' | 'critical';

export interface SymptomEntry {
  id: string;
  name: string;
  nameHi: string;
  bodySystem: string;
  category: string;
  /** ICD-10 codes commonly associated with this symptom */
  associatedConditions: string[];
  /** Red-flag: if true, escalate urgency automatically */
  redFlag: boolean;
  /** Typical severity when reported in isolation */
  defaultSeverity: SymptomSeverity;
  /** Common follow-up questions the triage engine should ask */
  followUpQuestions: string[];
  /** Aliases / alternate patient descriptions */
  aliases: string[];
  aliasesHi: string[];
}

/**
 * Master symptom catalogue used by the NLU and triage services.
 */
export const SYMPTOMS: Record<string, SymptomEntry> = {
  // ─── General / Constitutional ────────────────────────────────────────
  FEVER: {
    id: 'FEVER',
    name: 'Fever',
    nameHi: 'बुखार',
    bodySystem: 'systemic',
    category: 'constitutional',
    associatedConditions: ['A01.0', 'A09', 'A90', 'B50.9', 'J06.9'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'How high is the temperature?',
      'How many days have you had fever?',
      'Any chills or rigors?',
    ],
    aliases: ['high temperature', 'pyrexia', 'febrile'],
    aliasesHi: ['तापमान', 'ज्वर', 'गर्मी लगना'],
  },
  FATIGUE: {
    id: 'FATIGUE',
    name: 'Fatigue',
    nameHi: 'थकान',
    bodySystem: 'systemic',
    category: 'constitutional',
    associatedConditions: ['D50.9', 'E11.9', 'F32.9'],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [
      'How long have you felt tired?',
      'Does rest improve it?',
      'Any weight loss?',
    ],
    aliases: ['tiredness', 'weakness', 'lethargy', 'exhaustion'],
    aliasesHi: ['कमजोरी', 'सुस्ती', 'थकावट'],
  },
  WEIGHT_LOSS: {
    id: 'WEIGHT_LOSS',
    name: 'Unexplained weight loss',
    nameHi: 'अकारण वजन कम होना',
    bodySystem: 'systemic',
    category: 'constitutional',
    associatedConditions: ['E11.9', 'C80.1', 'A15.0'],
    redFlag: true,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'How much weight lost and over what period?',
      'Any appetite changes?',
      'Any night sweats?',
    ],
    aliases: ['losing weight', 'weight reduction'],
    aliasesHi: ['वज़न घटना', 'पतले होना'],
  },

  // ─── Respiratory ─────────────────────────────────────────────────────
  COUGH: {
    id: 'COUGH',
    name: 'Cough',
    nameHi: 'खांसी',
    bodySystem: 'respiratory',
    category: 'respiratory',
    associatedConditions: ['J06.9', 'J20.9', 'J45.9', 'A15.0'],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [
      'Dry or productive cough?',
      'Any blood in sputum?',
      'Duration of cough?',
    ],
    aliases: ['coughing', 'persistent cough'],
    aliasesHi: ['खाँसी', 'कफ'],
  },
  BREATHLESSNESS: {
    id: 'BREATHLESSNESS',
    name: 'Breathlessness',
    nameHi: 'सांस फूलना',
    bodySystem: 'respiratory',
    category: 'respiratory',
    associatedConditions: ['J45.9', 'I50.9', 'J44.1'],
    redFlag: true,
    defaultSeverity: 'severe',
    followUpQuestions: [
      'At rest or on exertion?',
      'Sudden onset or gradual?',
      'Any chest pain?',
    ],
    aliases: ['shortness of breath', 'dyspnea', 'difficulty breathing'],
    aliasesHi: ['साँस लेने में तकलीफ', 'दम फूलना'],
  },

  // ─── Gastrointestinal ────────────────────────────────────────────────
  ABDOMINAL_PAIN: {
    id: 'ABDOMINAL_PAIN',
    name: 'Abdominal pain',
    nameHi: 'पेट दर्द',
    bodySystem: 'gastrointestinal',
    category: 'gastrointestinal',
    associatedConditions: ['K29.7', 'K35.8', 'A09'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'Where exactly in the abdomen?',
      'Constant or comes and goes?',
      'Associated with eating?',
    ],
    aliases: ['stomach pain', 'belly ache', 'stomach ache'],
    aliasesHi: ['पेट में दर्द', 'पेट में ऐंठन'],
  },
  DIARRHEA: {
    id: 'DIARRHEA',
    name: 'Diarrhea',
    nameHi: 'दस्त',
    bodySystem: 'gastrointestinal',
    category: 'gastrointestinal',
    associatedConditions: ['A09', 'A01.0'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'How many episodes per day?',
      'Any blood or mucus in stool?',
      'Signs of dehydration?',
    ],
    aliases: ['loose stools', 'loose motions', 'watery stool'],
    aliasesHi: ['पतले दस्त', 'लूज मोशन'],
  },
  VOMITING: {
    id: 'VOMITING',
    name: 'Vomiting',
    nameHi: 'उल्टी',
    bodySystem: 'gastrointestinal',
    category: 'gastrointestinal',
    associatedConditions: ['A09', 'K29.7', 'R11.1'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'How many times?',
      'Any blood in vomit?',
      'Able to keep fluids down?',
    ],
    aliases: ['throwing up', 'emesis', 'nausea with vomiting'],
    aliasesHi: ['कै', 'मतली', 'जी मिचलाना'],
  },

  // ─── Cardiovascular ──────────────────────────────────────────────────
  CHEST_PAIN: {
    id: 'CHEST_PAIN',
    name: 'Chest pain',
    nameHi: 'सीने में दर्द',
    bodySystem: 'cardiovascular',
    category: 'cardiovascular',
    associatedConditions: ['I20.9', 'I21.9', 'R07.9'],
    redFlag: true,
    defaultSeverity: 'severe',
    followUpQuestions: [
      'Sharp or dull pain?',
      'Radiating to arm or jaw?',
      'Associated with exertion?',
    ],
    aliases: ['chest tightness', 'angina', 'heart pain'],
    aliasesHi: ['छाती में दर्द', 'सीने में जकड़न'],
  },
  PALPITATIONS: {
    id: 'PALPITATIONS',
    name: 'Palpitations',
    nameHi: 'धड़कन बढ़ना',
    bodySystem: 'cardiovascular',
    category: 'cardiovascular',
    associatedConditions: ['I49.9', 'I48.9', 'R00.2'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'Regular or irregular?',
      'Duration of episodes?',
      'Any dizziness or fainting?',
    ],
    aliases: ['racing heart', 'heart flutter', 'rapid heartbeat'],
    aliasesHi: ['दिल की धड़कन तेज़', 'घबराहट'],
  },

  // ─── Neurological ────────────────────────────────────────────────────
  HEADACHE: {
    id: 'HEADACHE',
    name: 'Headache',
    nameHi: 'सिरदर्द',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['G43.9', 'R51', 'I10'],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [
      'Location of the headache?',
      'Sudden or gradual onset?',
      'Any visual disturbances?',
    ],
    aliases: ['head pain', 'migraine', 'tension headache'],
    aliasesHi: ['सर दर्द', 'माइग्रेन'],
  },
  DIZZINESS: {
    id: 'DIZZINESS',
    name: 'Dizziness',
    nameHi: 'चक्कर आना',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['R42', 'H81.1', 'I10'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'Room-spinning or light-headed?',
      'Worse with position changes?',
      'Any hearing changes?',
    ],
    aliases: ['vertigo', 'light-headedness', 'unsteadiness'],
    aliasesHi: ['सिर घूमना', 'बेहोशी जैसा'],
  },
  SEIZURE: {
    id: 'SEIZURE',
    name: 'Seizure',
    nameHi: 'दौरे',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['G40.9', 'R56.9'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'First episode or recurrent?',
      'Duration of seizure?',
      'Any known triggers?',
    ],
    aliases: ['convulsion', 'fit', 'epileptic episode'],
    aliasesHi: ['मिर्गी', 'आक्षेप', 'फिट आना'],
  },

  // ─── Musculoskeletal ─────────────────────────────────────────────────
  JOINT_PAIN: {
    id: 'JOINT_PAIN',
    name: 'Joint pain',
    nameHi: 'जोड़ों में दर्द',
    bodySystem: 'musculoskeletal',
    category: 'musculoskeletal',
    associatedConditions: ['M25.5', 'M06.9', 'M15.9'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'Which joints are affected?',
      'Any swelling or redness?',
      'Worse in morning or evening?',
    ],
    aliases: ['arthralgia', 'aching joints'],
    aliasesHi: ['जोड़ दर्द', 'गठिया का दर्द'],
  },
  BACK_PAIN: {
    id: 'BACK_PAIN',
    name: 'Back pain',
    nameHi: 'कमर दर्द',
    bodySystem: 'musculoskeletal',
    category: 'musculoskeletal',
    associatedConditions: ['M54.5', 'M51.1'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'Upper or lower back?',
      'Radiating to legs?',
      'Any numbness or tingling?',
    ],
    aliases: ['backache', 'lower back pain', 'lumbar pain'],
    aliasesHi: ['पीठ दर्द', 'कमर में दर्द'],
  },

  // ─── Dermatological ──────────────────────────────────────────────────
  RASH: {
    id: 'RASH',
    name: 'Skin rash',
    nameHi: 'त्वचा पर चकत्ते',
    bodySystem: 'skin',
    category: 'dermatological',
    associatedConditions: ['L30.9', 'B02.9', 'A90'],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [
      'Where on the body?',
      'Itchy or painful?',
      'Any recent new medications?',
    ],
    aliases: ['skin eruption', 'hives', 'dermatitis'],
    aliasesHi: ['दाने', 'खुजली वाले दाने', 'चर्म रोग'],
  },

  // ─── Urinary ─────────────────────────────────────────────────────────
  PAINFUL_URINATION: {
    id: 'PAINFUL_URINATION',
    name: 'Painful urination',
    nameHi: 'पेशाब में जलन',
    bodySystem: 'genitourinary',
    category: 'urinary',
    associatedConditions: ['N39.0', 'N30.9'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'Any blood in urine?',
      'Increased frequency?',
      'Any fever?',
    ],
    aliases: ['dysuria', 'burning urination', 'UTI symptoms'],
    aliasesHi: ['पेशाब में दर्द', 'जलन'],
  },

  // ─── ENT ─────────────────────────────────────────────────────────────
  SORE_THROAT: {
    id: 'SORE_THROAT',
    name: 'Sore throat',
    nameHi: 'गले में खराश',
    bodySystem: 'ent',
    category: 'ENT',
    associatedConditions: ['J02.9', 'J06.9'],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [
      'Difficulty swallowing?',
      'Any voice changes?',
      'Associated with cough or cold?',
    ],
    aliases: ['throat pain', 'pharyngitis'],
    aliasesHi: ['गला दर्द', 'गला पकना'],
  },
  EAR_PAIN: {
    id: 'EAR_PAIN',
    name: 'Ear pain',
    nameHi: 'कान में दर्द',
    bodySystem: 'ent',
    category: 'ENT',
    associatedConditions: ['H66.9', 'H60.9'],
    redFlag: false,
    defaultSeverity: 'moderate',
    followUpQuestions: [
      'One or both ears?',
      'Any discharge?',
      'Any hearing loss?',
    ],
    aliases: ['earache', 'otalgia'],
    aliasesHi: ['कान दर्द', 'कान बहना'],
  },

  // ─── Ophthalmological ────────────────────────────────────────────────
  EYE_REDNESS: {
    id: 'EYE_REDNESS',
    name: 'Eye redness',
    nameHi: 'आँख लाल होना',
    bodySystem: 'eye',
    category: 'ophthalmological',
    associatedConditions: ['H10.9', 'H16.9'],
    redFlag: false,
    defaultSeverity: 'mild',
    followUpQuestions: [
      'One or both eyes?',
      'Any discharge or pain?',
      'Any vision changes?',
    ],
    aliases: ['red eye', 'conjunctivitis', 'pink eye'],
    aliasesHi: ['आँख आना', 'आँख में जलन'],
  },

  // ─── Red-flag symptoms ─────────────────────────────────────────────
  HEMOPTYSIS: {
    id: 'HEMOPTYSIS',
    name: 'Hemoptysis',
    nameHi: 'खून वाली खांसी',
    bodySystem: 'respiratory',
    category: 'respiratory',
    associatedConditions: ['A15.0', 'C80.1', 'J18.9'],
    redFlag: true,
    defaultSeverity: 'severe',
    followUpQuestions: [
      'How much blood?',
      'Bright red or dark?',
      'Any recent cough or chest pain?',
    ],
    aliases: ['coughing blood', 'blood in sputum', 'bloody cough'],
    aliasesHi: ['खून की खांसी', 'थूक में खून'],
  },
  BLOOD_IN_STOOL: {
    id: 'BLOOD_IN_STOOL',
    name: 'Blood in stool',
    nameHi: 'मल में खून',
    bodySystem: 'gastrointestinal',
    category: 'gastrointestinal',
    associatedConditions: ['K25.9', 'K35.8', 'A06.0'],
    redFlag: true,
    defaultSeverity: 'severe',
    followUpQuestions: [
      'Bright red or dark/tarry stool?',
      'How many episodes?',
      'Any abdominal pain?',
    ],
    aliases: ['bloody stool', 'rectal bleeding', 'melena', 'hematochezia'],
    aliasesHi: ['पाखाने में खून', 'खूनी दस्त'],
  },
  THUNDERCLAP_HEADACHE: {
    id: 'THUNDERCLAP_HEADACHE',
    name: 'Thunderclap headache',
    nameHi: 'अचानक तीव्र सिरदर्द',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['I63.9', 'G43.9'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'Did it reach peak intensity within seconds?',
      'Any neck stiffness?',
      'Any loss of consciousness?',
    ],
    aliases: ['worst headache of life', 'sudden severe headache'],
    aliasesHi: ['जीवन का सबसे तेज सिरदर्द', 'अचानक भयंकर सिरदर्द'],
  },
  NECK_STIFFNESS_WITH_FEVER: {
    id: 'NECK_STIFFNESS_WITH_FEVER',
    name: 'Neck stiffness with fever',
    nameHi: 'बुखार के साथ गर्दन में अकड़न',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['A83.0', 'G43.9'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'Can you touch chin to chest?',
      'Any rash?',
      'Any sensitivity to light?',
    ],
    aliases: ['meningism', 'stiff neck with fever', 'nuchal rigidity'],
    aliasesHi: ['गर्दन अकड़ना बुखार के साथ', 'मेनिनजाइटिस के लक्षण'],
  },
  SYNCOPE: {
    id: 'SYNCOPE',
    name: 'Syncope',
    nameHi: 'बेहोशी',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['R42', 'I49.9', 'I48.9'],
    redFlag: true,
    defaultSeverity: 'severe',
    followUpQuestions: [
      'Did you lose consciousness completely?',
      'Any warning signs before fainting?',
      'Any chest pain or palpitations?',
    ],
    aliases: ['fainting', 'loss of consciousness', 'blackout', 'passed out'],
    aliasesHi: ['बेहोश होना', 'चक्कर आकर गिरना'],
  },
  ACUTE_LIMB_WEAKNESS: {
    id: 'ACUTE_LIMB_WEAKNESS',
    name: 'Acute limb weakness',
    nameHi: 'अचानक हाथ-पैर में कमजोरी',
    bodySystem: 'neurological',
    category: 'neurological',
    associatedConditions: ['I63.9', 'G40.9'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'Which side is affected?',
      'Any speech difficulty?',
      'When did it start?',
    ],
    aliases: ['sudden weakness', 'hemiparesis', 'paralysis', 'stroke symptoms'],
    aliasesHi: ['लकवा', 'एक तरफ कमजोरी', 'स्ट्रोक के लक्षण'],
  },
  SUDDEN_VISION_LOSS: {
    id: 'SUDDEN_VISION_LOSS',
    name: 'Sudden vision loss',
    nameHi: 'अचानक दृष्टि हानि',
    bodySystem: 'eye',
    category: 'ophthalmological',
    associatedConditions: ['H16.9', 'I63.9'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'One eye or both?',
      'Partial or complete loss?',
      'Any pain?',
    ],
    aliases: ['vision loss', 'sudden blindness', 'amaurosis'],
    aliasesHi: ['आँख की रोशनी जाना', 'अचानक अंधापन'],
  },
  HEMATEMESIS: {
    id: 'HEMATEMESIS',
    name: 'Hematemesis',
    nameHi: 'खून की उल्टी',
    bodySystem: 'gastrointestinal',
    category: 'gastrointestinal',
    associatedConditions: ['K25.9', 'K21.0'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'How much blood?',
      'Bright red or coffee-ground appearance?',
      'Any dizziness or lightheadedness?',
    ],
    aliases: ['vomiting blood', 'blood vomit', 'coffee-ground emesis'],
    aliasesHi: ['खून की कै', 'उल्टी में खून'],
  },
  SUICIDAL_IDEATION: {
    id: 'SUICIDAL_IDEATION',
    name: 'Suicidal ideation',
    nameHi: 'आत्महत्या के विचार',
    bodySystem: 'psychiatric',
    category: 'psychiatric',
    associatedConditions: ['F32.9', 'F41.9'],
    redFlag: true,
    defaultSeverity: 'critical',
    followUpQuestions: [
      'Do you have a plan?',
      'Do you have access to means?',
      'Is there someone with you right now?',
    ],
    aliases: ['wanting to die', 'self-harm thoughts', 'suicidal thoughts'],
    aliasesHi: ['मरने की इच्छा', 'आत्महत्या का विचार'],
  },
  SEVERE_DEHYDRATION: {
    id: 'SEVERE_DEHYDRATION',
    name: 'Severe dehydration',
    nameHi: 'गंभीर निर्जलीकरण',
    bodySystem: 'systemic',
    category: 'constitutional',
    associatedConditions: ['A09', 'A00.9'],
    redFlag: true,
    defaultSeverity: 'severe',
    followUpQuestions: [
      'How many times have you vomited or had diarrhea?',
      'When did you last urinate?',
      'Are you able to drink fluids?',
    ],
    aliases: ['dehydration', 'severe fluid loss', 'no urine output'],
    aliasesHi: ['पानी की कमी', 'शरीर में पानी कम होना'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a symptom by any of its aliases (case-insensitive). */
export function findSymptomByAlias(text: string): SymptomEntry | undefined {
  const lower = text.toLowerCase();
  return Object.values(SYMPTOMS).find(
    (s) =>
      s.name.toLowerCase() === lower ||
      s.nameHi?.toLowerCase() === lower ||
      s.aliases.some((a) => a.toLowerCase() === lower) ||
      s.aliasesHi.some((a) => a.toLowerCase() === lower),
  );
}

/** Return all red-flag symptoms. */
export function getRedFlagSymptoms(): SymptomEntry[] {
  return Object.values(SYMPTOMS).filter((s) => s.redFlag);
}

/** Return symptoms for a given body system. */
export function getSymptomsByBodySystem(system: string): SymptomEntry[] {
  return Object.values(SYMPTOMS).filter(
    (s) => s.bodySystem.toLowerCase() === system.toLowerCase(),
  );
}
