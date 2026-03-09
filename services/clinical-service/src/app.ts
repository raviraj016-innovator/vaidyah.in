import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { config } from './config';
import { getPool, query, closePool } from './db';
import { authenticate, authorize } from './middleware/auth';
import {
  globalErrorHandler,
  asyncHandler,
  ValidationError,
  ServiceUnavailableError,
  ClinicalDataError,
} from './middleware/errorHandler';
import { triageEngine } from './services/triage-engine';
import {
  AuthenticatedRequest,
  ApiResponse,
  TriageInput,
  TriageResult,
  SymptomCheckInput,
  SymptomCheckResult,
  SOAPNote,
  DifferentialDiagnosisResult,
} from './types';

// ─── Audit & Tracing ────────────────────────────────────────────────────────

const _auditLog = async (event: Record<string, unknown>) => {
  console.log('[AUDIT]', JSON.stringify(event));
};
console.log('[clinical-service] Audit logging initialized');

async function audit(action: string, resource: string, resourceId: string, userId: string, details: Record<string, unknown> = {}) {
  await _auditLog({ action, resource, resourceId, userId, details }).catch((err) =>
    console.error('[AUDIT] Failed:', (err as Error).message)
  );
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const VitalsSchema = z.object({
  temperature: z.number().min(25).max(45).optional(),
  bp_systolic: z.number().min(30).max(300).optional(),
  bp_diastolic: z.number().min(20).max(200).optional(),
  spo2: z.number().min(0).max(100).optional(),
  pulse: z.number().min(10).max(300).optional(),
  respiratory_rate: z.number().min(2).max(80).optional(),
  weight: z.number().min(0.3).max(500).optional(),
  height: z.number().min(20).max(280).optional(),
  blood_glucose: z.number().min(10).max(1000).optional(),
  pain_score: z.number().min(0).max(10).optional(),
});

const SymptomInputSchema = z.object({
  name: z.string().min(1).max(200),
  body_system: z.string().optional(),
  severity: z.enum(['mild', 'moderate', 'severe']),
  duration: z.string().optional(),
  onset: z.enum(['sudden', 'gradual']).optional(),
  frequency: z.enum(['constant', 'intermittent', 'episodic']).optional(),
  aggravating_factors: z.array(z.string().max(200)).max(10).optional(),
  relieving_factors: z.array(z.string().max(200)).max(10).optional(),
  associated_symptoms: z.array(z.string().max(200)).max(10).optional(),
});

const MedicalHistorySchema = z.object({
  conditions: z.array(z.string().max(500)).max(50),
  allergies: z.array(z.string().max(200)).max(30),
  medications: z.array(z.string().max(200)).max(30),
  surgeries: z.array(z.string().max(200)).max(30),
  family_history: z.array(z.string().max(200)).max(30),
  smoking_status: z.enum(['never', 'former', 'current']).optional(),
  alcohol_use: z.enum(['never', 'occasional', 'moderate', 'heavy']).optional(),
  tobacco_chewing: z.enum(['never', 'former', 'current']).optional(),
});

const ProsodyScoresSchema = z.object({
  distress: z.number().min(0).max(1),
  pain: z.number().min(0).max(1),
  anxiety: z.number().min(0).max(1),
  breathlessness: z.number().min(0).max(1),
  fatigue: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

const TriageInputSchema = z.object({
  symptoms: z.array(SymptomInputSchema).min(1).max(config.limits.maxSymptomsPerCheck),
  vitals: VitalsSchema,
  age: z.number().min(0).max(150),
  gender: z.enum(['male', 'female', 'other']),
  medical_history: MedicalHistorySchema,
  chief_complaint: z.string().max(500).optional(),
  prosody_scores: ProsodyScoresSchema.optional(),
});

const EmergencyAssessmentSchema = z.object({
  symptoms: z.array(SymptomInputSchema).min(1),
  vitals: VitalsSchema,
  age: z.number().min(0).max(150),
  gender: z.enum(['male', 'female', 'other']),
  chief_complaint: z.string().max(500).optional(),
});

const SOAPRequestSchema = z.object({
  session_id: z.string().uuid(),
  symptoms: z.array(SymptomInputSchema),
  vitals: VitalsSchema,
  chief_complaint: z.string().min(1).max(500),
  medical_history: MedicalHistorySchema,
  transcript: z.string().max(50000).optional(),
  language: z.string().max(10).default('en'),
  prosody_scores: ProsodyScoresSchema.optional(),
  patient_narrative: z.string().max(10000).optional(),
  age: z.number().min(0).max(150),
  gender: z.enum(['male', 'female', 'other']),
});

const DiagnosisSuggestSchema = z.object({
  symptoms: z.array(SymptomInputSchema).min(1),
  vitals: VitalsSchema,
  age: z.number().min(0).max(150),
  gender: z.enum(['male', 'female', 'other']),
  medical_history: MedicalHistorySchema.optional(),
});

const SymptomCheckSchema = z.object({
  symptoms: z.array(z.string().min(1)).min(1).max(config.limits.maxSymptomsPerCheck),
  age: z.number().min(0).max(150),
  gender: z.enum(['male', 'female', 'other']),
  medical_history: MedicalHistorySchema.optional(),
});

const SymptomFollowUpQuerySchema = z.object({
  symptoms: z.string().min(1),
  age: z.coerce.number().min(0).max(150).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

// ─── Express App ────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
app.use(cors({
  origin: config.isProd
    ? [config.services?.apiGatewayUrl ?? 'https://api.vaidyah.in'].filter(Boolean)
    : (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.isProd ? 'combined' : 'dev'));

app.use((req: Request, _res: Response, next) => {
  const authReq = req as AuthenticatedRequest;
  authReq.requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  next();
});

// ─── Health Check ───────────────────────────────────────────────────────────

app.get('/health', asyncHandler(async (_req: Request, res: Response) => {
  let dbHealthy = false;
  try {
    await query('SELECT 1');
    dbHealthy = true;
  } catch {
    // db unreachable
  }

  const status = dbHealthy ? 'healthy' : 'degraded';
  const statusCode = dbHealthy ? 200 : 503;

  res.status(statusCode).json({
    status,
    service: 'clinical-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? 'connected' : 'disconnected',
    },
  });
}));

// ─── Authenticated Routes ───────────────────────────────────────────────────

const router = express.Router();
router.use(authenticate);

// POST /api/v1/triage
router.post('/triage', authorize('nurse', 'doctor', 'admin', 'system'), asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parseResult = TriageInputSchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid triage input', parseResult.error.flatten());
  }

  const input: TriageInput = parseResult.data;
  const sessionId = uuidv4();
  const result: TriageResult = triageEngine.runTriage(sessionId, input);

  try {
    await query(
      `INSERT INTO triage_results (id, session_id, triage_level, urgency_score, needs_immediate_attention,
        scoring_breakdown, red_flags, recommended_action, recommended_wait_minutes,
        clinical_impression, assessed_at, is_ai_assisted, input_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        uuidv4(),
        result.session_id,
        result.triage_level,
        result.urgency_score,
        result.needs_immediate_attention,
        JSON.stringify(result.scoring_breakdown),
        JSON.stringify(result.red_flags),
        result.recommended_action,
        result.recommended_wait_minutes,
        result.clinical_impression,
        result.assessed_at,
        result.is_ai_assisted,
        JSON.stringify(input),
      ]
    );
  } catch (err) {
    console.error('[TRIAGE] Failed to persist triage result:', (err as Error).message);
    // Still return the triage result but flag persistence failure
    const response: ApiResponse<TriageResult> = {
      success: true,
      data: result,
      meta: {
        requestId: authReq.requestId,
        timestamp: new Date().toISOString(),
        warning: 'Triage result computed but failed to persist. Please retry or contact support.',
      },
    };
    res.status(207).json(response);
    return;
  }

  // Audit: triage decision is a clinical action
  await audit('TRIAGE_ASSESSMENT', 'triage_result', result.session_id, authReq.user?.sub ?? 'system', {
    triage_level: result.triage_level,
    urgency_score: result.urgency_score,
    needs_immediate_attention: result.needs_immediate_attention,
    red_flags_count: result.red_flags.length,
  });

  const response: ApiResponse<TriageResult> = {
    success: true,
    data: result,
    meta: {
      requestId: authReq.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}));

// POST /api/v1/triage/emergency
router.post('/triage/emergency', authorize('nurse', 'doctor', 'admin', 'system'), asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parseResult = EmergencyAssessmentSchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid emergency assessment input', parseResult.error.flatten());
  }

  const { symptoms, vitals, age, gender, chief_complaint } = parseResult.data;

  const input: TriageInput = {
    symptoms,
    vitals,
    age,
    gender,
    medical_history: {
      conditions: [],
      allergies: [],
      medications: [],
      surgeries: [],
      family_history: [],
    },
    chief_complaint,
  };

  const sessionId = uuidv4();
  const result: TriageResult = triageEngine.runTriage(sessionId, input);

  // Persist emergency triage result (non-blocking -- still return result on failure)
  try {
    await query(
      `INSERT INTO triage_results (id, session_id, triage_level, urgency_score, needs_immediate_attention,
        scoring_breakdown, red_flags, recommended_action, recommended_wait_minutes,
        clinical_impression, assessed_at, is_ai_assisted, input_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        uuidv4(),
        result.session_id,
        result.triage_level,
        result.urgency_score,
        result.needs_immediate_attention,
        JSON.stringify(result.scoring_breakdown),
        JSON.stringify(result.red_flags),
        result.recommended_action,
        result.recommended_wait_minutes,
        result.clinical_impression,
        result.assessed_at,
        result.is_ai_assisted,
        JSON.stringify(input),
      ]
    );
  } catch (err) {
    console.error('[EMERGENCY TRIAGE] Failed to persist emergency triage result:', (err as Error).message);
    const response: ApiResponse<TriageResult> = {
      success: true,
      data: result,
      meta: {
        requestId: authReq.requestId,
        timestamp: new Date().toISOString(),
        warning: 'Emergency triage result computed but failed to persist. Please retry or contact support.',
      },
    };
    res.status(207).json(response);
    return;
  }

  const response: ApiResponse<TriageResult> = {
    success: true,
    data: result,
    meta: {
      requestId: authReq.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}));

// POST /api/v1/soap
router.post('/soap', authorize('doctor', 'admin', 'system'), asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parseResult = SOAPRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid SOAP note request', parseResult.error.flatten());
  }

  const input = parseResult.data;

  const nluPayload = {
    prompt: 'generate_soap_note',
    context: {
      session_id: input.session_id,
      chief_complaint: input.chief_complaint,
      symptoms: input.symptoms,
      vitals: input.vitals,
      medical_history: input.medical_history,
      transcript: input.transcript,
      language: input.language,
      prosody_scores: input.prosody_scores,
      patient_narrative: input.patient_narrative,
      age: input.age,
      gender: input.gender,
    },
    max_tokens: 4096,
    temperature: 0.3,
  };

  let soapNote: SOAPNote;

  try {
    const nluResponse = await axios.post(
      `${config.services.nluServiceUrl}/api/v1/generate`,
      nluPayload,
      { timeout: config.limits.nluTimeoutMs }
    );

    const generated = nluResponse.data;

    soapNote = {
      id: uuidv4(),
      session_id: input.session_id,
      subjective: generated.subjective ?? {
        chief_complaint: input.chief_complaint,
        history_of_present_illness: '',
        patient_narrative: input.patient_narrative ?? '',
        review_of_systems: {},
        reported_symptoms: input.symptoms,
      },
      objective: generated.objective ?? {
        vitals: input.vitals,
        general_appearance: '',
        physical_examination: {},
        prosody_analysis: input.prosody_scores,
      },
      assessment: generated.assessment ?? {
        primary_diagnosis: { condition_name: '', icd10_code: '', confidence: 0, type: 'primary', severity: 'mild', supporting_evidence: [], contradicting_evidence: [], recommended_tests: [], basis: '' },
        differential_diagnoses: [],
        clinical_reasoning: '',
        contradiction_flags: [],
        risk_factors: [],
      },
      plan: generated.plan ?? {
        treatment_recommendations: [],
        prescriptions: [],
        investigations: [],
        follow_up_instructions: '',
        patient_education: [],
        warning_signs: [],
      },
      generated_at: new Date().toISOString(),
      generated_by: authReq.user?.sub ?? 'system',
      is_ai_generated: true,
      is_reviewed: false,
      version: 1,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        throw new ServiceUnavailableError('NLU Service');
      }
      throw new ClinicalDataError('Failed to generate SOAP note', {
        status: err.response.status,
        detail: err.response.data?.detail ?? err.response.data?.message ?? err.message,
      });
    }
    throw new ClinicalDataError('Failed to generate SOAP note', undefined);
  }

  try {
    await query(
      `INSERT INTO soap_notes (id, session_id, subjective, objective, assessment, plan,
        generated_at, generated_by, is_ai_generated, is_reviewed, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        soapNote.id,
        soapNote.session_id,
        JSON.stringify(soapNote.subjective),
        JSON.stringify(soapNote.objective),
        JSON.stringify(soapNote.assessment),
        JSON.stringify(soapNote.plan),
        soapNote.generated_at,
        soapNote.generated_by,
        soapNote.is_ai_generated,
        soapNote.is_reviewed,
        soapNote.version,
      ]
    );
  } catch (err) {
    console.error('[SOAP] Failed to persist SOAP note:', (err as Error).message);
    const response = {
      success: false,
      data: soapNote,
      error: 'SOAP note generated but failed to persist. Please retry or contact support.',
      meta: {
        requestId: authReq.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(207).json(response);
    return;
  }

  // Audit: SOAP note generation accesses PHI
  await audit('SOAP_NOTE_GENERATED', 'soap_note', soapNote.id, authReq.user?.sub ?? 'system', {
    session_id: soapNote.session_id,
    is_ai_generated: soapNote.is_ai_generated,
    has_contradictions: (soapNote.assessment?.contradiction_flags?.length ?? 0) > 0,
  });

  const response: ApiResponse<SOAPNote> = {
    success: true,
    data: soapNote,
    meta: {
      requestId: authReq.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(201).json(response);
}));

// POST /api/v1/diagnosis/suggest
router.post('/diagnosis/suggest', authorize('nurse', 'doctor', 'admin', 'system'), asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parseResult = DiagnosisSuggestSchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid diagnosis suggestion input', parseResult.error.flatten());
  }

  const input = parseResult.data;
  const sessionId = uuidv4();

  const nluPayload = {
    prompt: 'differential_diagnosis',
    context: {
      symptoms: input.symptoms,
      vitals: input.vitals,
      age: input.age,
      gender: input.gender,
      medical_history: input.medical_history,
    },
    max_tokens: 4096,
    temperature: 0.2,
  };

  let diagnosisResult: DifferentialDiagnosisResult;

  try {
    const nluResponse = await axios.post(
      `${config.services.nluServiceUrl}/api/v1/generate`,
      nluPayload,
      { timeout: config.limits.nluTimeoutMs }
    );

    const generated = nluResponse.data;

    diagnosisResult = {
      session_id: sessionId,
      diagnoses: generated.diagnoses ?? [],
      clinical_summary: generated.clinical_summary ?? '',
      data_quality_notes: generated.data_quality_notes ?? [],
      generated_at: new Date().toISOString(),
      is_ai_assisted: true,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        throw new ServiceUnavailableError('NLU Service');
      }
      throw new ClinicalDataError('Failed to generate differential diagnosis', {
        status: err.response.status,
        detail: err.response.data?.detail ?? err.response.data?.message ?? err.message,
      });
    }
    throw new ClinicalDataError('Failed to generate differential diagnosis', undefined);
  }

  const response: ApiResponse<DifferentialDiagnosisResult> = {
    success: true,
    data: diagnosisResult,
    meta: {
      requestId: authReq.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}));

// POST /api/v1/symptoms/check
router.post('/symptoms/check', authorize('nurse', 'doctor', 'admin', 'system'), asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parseResult = SymptomCheckSchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid symptom check input', parseResult.error.flatten());
  }

  const input: SymptomCheckInput = parseResult.data;

  const nluPayload = {
    prompt: 'symptom_check',
    context: {
      symptoms: input.symptoms,
      age: input.age,
      gender: input.gender,
      medical_history: input.medical_history,
    },
    max_tokens: 4096,
    temperature: 0.2,
  };

  let checkResult: SymptomCheckResult;

  try {
    const nluResponse = await axios.post(
      `${config.services.nluServiceUrl}/api/v1/generate`,
      nluPayload,
      { timeout: config.limits.nluTimeoutMs }
    );

    const generated = nluResponse.data;

    checkResult = {
      possible_conditions: generated.possible_conditions ?? [],
      red_flags_detected: generated.red_flags_detected ?? [],
      recommendations: generated.recommendations ?? [],
      disclaimer: 'This symptom assessment is AI-assisted and for informational purposes only. It does not replace professional medical diagnosis. Please consult a qualified healthcare provider for medical advice.',
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        throw new ServiceUnavailableError('NLU Service');
      }
      throw new ClinicalDataError('Failed to perform symptom check', {
        status: err.response.status,
        detail: err.response.data?.detail ?? err.response.data?.message ?? err.message,
      });
    }
    throw new ClinicalDataError('Failed to perform symptom check', undefined);
  }

  const response: ApiResponse<SymptomCheckResult> = {
    success: true,
    data: checkResult,
    meta: {
      requestId: authReq.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}));

// GET /api/v1/symptoms/followup
router.get('/symptoms/followup', authorize('nurse', 'doctor', 'admin', 'system'), asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const parseResult = SymptomFollowUpQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    throw new ValidationError('Invalid follow-up query parameters', parseResult.error.flatten());
  }

  const { symptoms, age, gender } = parseResult.data;
  const symptomList = symptoms.split(',').map((s) => s.trim()).filter(Boolean);

  if (symptomList.length === 0) {
    throw new ValidationError('At least one symptom is required');
  }

  const nluPayload = {
    prompt: 'symptom_followup_questions',
    context: {
      symptoms: symptomList,
      age,
      gender,
    },
    max_tokens: 2048,
    temperature: 0.3,
  };

  let followUpQuestions: { symptom: string; questions: string[] }[];

  try {
    const nluResponse = await axios.post(
      `${config.services.nluServiceUrl}/api/v1/generate`,
      nluPayload,
      { timeout: config.limits.nluTimeoutMs }
    );

    followUpQuestions = nluResponse.data.followup_questions ?? [];
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        throw new ServiceUnavailableError('NLU Service');
      }
      throw new ClinicalDataError('Failed to generate follow-up questions', {
        status: err.response.status,
        detail: err.response.data?.detail ?? err.response.data?.message ?? err.message,
      });
    }
    throw new ClinicalDataError('Failed to generate follow-up questions', undefined);
  }

  const response: ApiResponse<{ followup_questions: typeof followUpQuestions }> = {
    success: true,
    data: { followup_questions: followUpQuestions },
    meta: {
      requestId: authReq.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(response);
}));

// ─── Mount Router ───────────────────────────────────────────────────────────

app.use('/api/v1', router);

// ─── Global Error Handler ───────────────────────────────────────────────────

app.use(globalErrorHandler);

// ─── Server Bootstrap ───────────────────────────────────────────────────────

const server = app.listen(config.port, config.host, () => {
  console.log(`[clinical-service] Running on ${config.host}:${config.port} (${config.env})`);
  getPool();
});

server.setTimeout(config.limits.requestTimeoutMs);

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`[clinical-service] Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    console.log('[clinical-service] HTTP server closed');
    try {
      await closePool();
    } catch (err) {
      console.error('[clinical-service] Error closing DB pool:', (err as Error).message);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[clinical-service] Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[clinical-service] Unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err: Error) => {
  console.error('[clinical-service] Uncaught exception:', err.message);
  shutdown('uncaughtException');
});

export default app;
