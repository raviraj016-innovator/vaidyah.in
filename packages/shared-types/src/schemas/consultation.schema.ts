import { z } from 'zod';

export const VitalSignsSchema = z.object({
  temperature: z.object({
    value: z.number().min(25).max(45),
    unit: z.literal('celsius'),
    method: z.enum(['oral', 'axillary', 'tympanic', 'rectal', 'temporal']),
  }).optional(),
  bloodPressure: z.object({
    systolic: z.number().int().min(40).max(300),
    diastolic: z.number().int().min(20).max(200),
    position: z.enum(['sitting', 'standing', 'supine']),
    arm: z.enum(['left', 'right']),
  }).optional(),
  heartRate: z.object({
    value: z.number().int().min(0).max(250),
    rhythm: z.enum(['regular', 'irregular']),
    method: z.enum(['manual', 'pulse_oximeter', 'ecg']),
  }).optional(),
  respiratoryRate: z.object({
    value: z.number().int().min(4).max(60),
  }).optional(),
  spO2: z.object({
    value: z.number().min(0).max(100),
    isOnSupplementalOxygen: z.boolean(),
    oxygenFlowRate: z.number().min(0).max(15).optional(),
  }).optional(),
  bloodGlucose: z.object({
    value: z.number().min(10).max(2000),
    type: z.enum(['fasting', 'random', 'postprandial']),
  }).optional(),
  weight: z.object({
    value: z.number().min(0.2).max(500),
    unit: z.literal('kg'),
  }).optional(),
  height: z.object({
    value: z.number().min(20).max(300),
    unit: z.literal('cm'),
  }).optional(),
  painScore: z.object({
    value: z.number().int().min(0).max(10),
    location: z.string().max(100).optional(),
    type: z.enum(['sharp', 'dull', 'burning', 'throbbing', 'cramping', 'aching']).optional(),
  }).optional(),
  gcs: z.object({
    eye: z.number().int().min(1).max(4),
    verbal: z.number().int().min(1).max(5),
    motor: z.number().int().min(1).max(6),
    total: z.number().int().min(3).max(15),
  }).refine(
    (data) => data.total === data.eye + data.verbal + data.motor,
    { message: 'GCS total must equal eye + verbal + motor' }
  ).optional(),
  notes: z.string().max(1000).optional(),
});

export const SymptomSchema = z.object({
  name: z.string().min(1).max(200),
  bodySystem: z.string().min(1).max(50),
  severity: z.enum(['mild', 'moderate', 'severe', 'critical']),
  duration: z.string().max(100).optional(),
  onset: z.enum(['sudden', 'gradual']).optional(),
  frequency: z.enum(['constant', 'intermittent', 'episodic']).optional(),
  aggravatingFactors: z.array(z.string().max(200)).optional(),
  relievingFactors: z.array(z.string().max(200)).optional(),
  associatedSymptoms: z.array(z.string().max(200)).optional(),
  isRedFlag: z.boolean(),
  icdCode: z.string().max(10).optional(),
});

export const PerformTriageRequestSchema = z.object({
  consultationId: z.string().uuid(),
  patientId: z.string().uuid(),
  vitals: VitalSignsSchema,
  reportedSymptoms: z.array(SymptomSchema),
  chiefComplaint: z.string().min(1).max(1000),
  chiefComplaintLanguage: z.string().min(2).max(10),
  audioRecordingUrl: z.string().url().optional(),
  useAiAssist: z.boolean(),
});

export const CreateConsultationRequestSchema = z.object({
  patientId: z.string().uuid(),
  healthCenterId: z.string().uuid(),
  mode: z.enum(['in_person', 'teleconsultation', 'home_visit', 'camp']),
  scheduledAt: z.string().optional(),
  primaryClinician: z.string().uuid(),
  consultationLanguage: z.string().min(2).max(10),
  chiefComplaint: z.string().max(1000).optional(),
});

export const DiagnosisSuggestionRequestSchema = z.object({
  symptoms: z.array(SymptomSchema),
  vitals: VitalSignsSchema,
  patientAge: z.number().min(0).max(150),
  patientSex: z.enum(['male', 'female', 'intersex', 'unknown']),
  medicalHistory: z.array(z.string().max(200)).optional(),
});
