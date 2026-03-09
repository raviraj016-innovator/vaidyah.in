import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLogger } from '../middleware/audit';
import { createStrictRateLimiter } from '../middleware/rateLimiter';
import {
  validate,
  uuidParam,
  uuidOrNctParam,
  createSessionRules,
  vitalsRules,
  emergencyAlertRules,
  trialSearchRules,
  paginationRules,
} from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { queryOne, queryRows, query as dbQuery } from '../services/db';
import { forwardRequest } from '../services/proxy';
import { cacheGet, cacheSet, cacheDel } from '../services/redis';
import {
  AuthenticatedRequest,
  ApiResponse,
  ConsultationSession,
  VitalsData,
} from '../types';

// ─── Session Routes ──────────────────────────────────────────────────────────

export const sessionRouter: Router = Router();

sessionRouter.use(authenticate as never);
sessionRouter.use(auditLogger as never);

sessionRouter.post(
  '/',
  validate(...createSessionRules),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { patientId, nurseId, facilityId, chiefComplaint, language } = req.body;

    // Authorization: patients can only create sessions for themselves
    if (authReq.user?.role === 'patient' && patientId !== authReq.user.sub) {
      throw AppError.forbidden('Patients can only create sessions for themselves');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const row = await queryOne<ConsultationSession>(
      `INSERT INTO consultation_sessions
         (id, patient_id, nurse_id, facility_id, chief_complaint, language, status, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7, $7)
       RETURNING
         id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
         facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
         language, triage_level AS "triageLevel",
         started_at AS "startedAt", completed_at AS "completedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, patientId, nurseId, facilityId, chiefComplaint ?? null, language ?? 'en', now],
    );

    await cacheDel(`session:${id}`);

    if (!row) {
      throw new AppError('Failed to create consultation session', 500, 'INTERNAL_ERROR');
    }
    const body: ApiResponse<ConsultationSession> = {
      success: true,
      data: row,
      meta: { requestId: authReq.requestId },
    };
    res.status(201).json(body);
  }),
);

sessionRouter.get(
  '/:id',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const cached = await cacheGet<ConsultationSession>(`session:${id}`);
    if (cached) {
      // Ownership check: patients can only view their own sessions
      if (authReq.user?.role === 'patient' && authReq.user.sub !== cached.patientId) {
        throw AppError.forbidden('Patients can only view their own sessions');
      }
      const body: ApiResponse<ConsultationSession> = {
        success: true,
        data: cached,
        meta: { requestId: authReq.requestId },
      };
      res.json(body);
      return;
    }

    const row = await queryOne<ConsultationSession>(
      `SELECT
         id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
         facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
         language, triage_level AS "triageLevel",
         started_at AS "startedAt", completed_at AS "completedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
       FROM consultation_sessions WHERE id = $1`,
      [id],
    );

    if (!row) {
      throw AppError.notFound('Session');
    }

    // Ownership check: patients can only view their own sessions
    if (authReq.user?.role === 'patient' && authReq.user.sub !== row.patientId) {
      throw AppError.forbidden('Patients can only view their own sessions');
    }

    await cacheSet(`session:${id}`, row, 300);

    const body: ApiResponse<ConsultationSession> = {
      success: true,
      data: row,
      meta: { requestId: authReq.requestId },
    };
    res.json(body);
  }),
);

sessionRouter.post(
  '/:id/voice',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const session = await queryOne<ConsultationSession>(
      `SELECT id, status, patient_id AS "patientId" FROM consultation_sessions WHERE id = $1`,
      [id],
    );
    if (!session) {
      throw AppError.notFound('Session');
    }
    if (session.status !== 'active') {
      throw AppError.badRequest('Session is not active');
    }
    // Ownership check: patients can only submit voice for their own sessions
    if (authReq.user?.role === 'patient' && authReq.user.sub !== session.patientId) {
      throw AppError.forbidden('Patients can only submit voice for their own sessions');
    }

    const upstream = await forwardRequest('voice', req, `/api/v1/voice/transcribe`);

    res.status(upstream.statusCode).json(upstream.body);
  }),
);

sessionRouter.post(
  '/:id/vitals',
  validate(...vitalsRules),
  requireRole('nurse', 'doctor', 'admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const id = req.params.id as string;
    const vitals: VitalsData = req.body;

    const session = await queryOne<{ id: string; patient_id: string; facility_id: string }>(
      `SELECT id, patient_id, facility_id FROM consultation_sessions WHERE id = $1`,
      [id],
    );
    if (!session) {
      throw AppError.notFound('Session');
    }

    const vitalsId = uuidv4();
    const now = new Date().toISOString();

    await dbQuery(
      `INSERT INTO session_vitals
         (id, session_id, heart_rate, systolic_bp, diastolic_bp, temperature,
          sp_o2, respiratory_rate, blood_glucose, weight, height, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        vitalsId, id,
        vitals.heartRate ?? null, vitals.systolicBp ?? null, vitals.diastolicBp ?? null,
        vitals.temperature ?? null, vitals.spO2 ?? null, vitals.respiratoryRate ?? null,
        vitals.bloodGlucose ?? null, vitals.weight ?? null, vitals.height ?? null,
        now,
      ],
    );

    await cacheDel(`session:${id}`);

    const body: ApiResponse<{ id: string; sessionId: string; recordedAt: string }> = {
      success: true,
      data: { id: vitalsId, sessionId: id, recordedAt: now },
      meta: { requestId: authReq.requestId },
    };
    res.status(201).json(body);
  }),
);

sessionRouter.post(
  '/:id/summary',
  validate(uuidParam('id')),
  requireRole('nurse', 'doctor', 'admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const session = await queryOne(
      `SELECT id, status FROM consultation_sessions WHERE id = $1`,
      [id],
    );
    if (!session) {
      throw AppError.notFound('Session');
    }

    const upstream = await forwardRequest('clinical', req, `/api/v1/soap`);

    res.status(upstream.statusCode).json(upstream.body);
  }),
);

// ─── Patient Routes ──────────────────────────────────────────────────────────

export const patientRouter: Router = Router();

patientRouter.use(authenticate as never);
patientRouter.use(auditLogger as never);

patientRouter.get(
  '/:id/history',
  validate(uuidParam('id'), ...paginationRules),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    // Authorization: patients can only view their own history
    if (authReq.user?.role === 'patient' && authReq.user.sub !== id) {
      throw AppError.forbidden('Patients can only view their own history');
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = (page - 1) * limit;

    const cacheKey = `patient:${id}:history:p${page}:l${limit}`;
    const cached = await cacheGet<{ sessions: ConsultationSession[]; total: number }>(cacheKey);
    if (cached) {
      const body: ApiResponse<ConsultationSession[]> = {
        success: true,
        data: cached.sessions,
        meta: { page, limit, total: cached.total, requestId: authReq.requestId },
      };
      res.json(body);
      return;
    }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM consultation_sessions WHERE patient_id = $1`,
      [id],
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const sessions = await queryRows<ConsultationSession>(
      `SELECT
         id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
         facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
         language, triage_level AS "triageLevel",
         started_at AS "startedAt", completed_at AS "completedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
       FROM consultation_sessions
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset],
    );

    await cacheSet(cacheKey, { sessions, total }, 120);

    const body: ApiResponse<ConsultationSession[]> = {
      success: true,
      data: sessions,
      meta: { page, limit, total, requestId: authReq.requestId },
    };
    res.json(body);
  }),
);

// ─── Triage Routes ───────────────────────────────────────────────────────────

export const triageRouter: Router = Router();

triageRouter.use(authenticate as never);
triageRouter.use(auditLogger as never);

triageRouter.post(
  '/:sessionId',
  validate(uuidParam('sessionId')),
  requireRole('nurse', 'doctor', 'admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    const session = await queryOne(
      `SELECT id, status FROM consultation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (!session) {
      throw AppError.notFound('Session');
    }

    const upstream = await forwardRequest(
      'clinical',
      req,
      `/api/v1/triage`,
    );

    if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
      const triageData = upstream.body;
      const dataObj = typeof triageData === 'object' && triageData !== null
        && 'data' in triageData && typeof (triageData as any).data === 'object'
        ? (triageData as any).data
        : undefined;

      // Extract triage_level from clinical-service response (enum: 'A'-'E')
      // or derive from urgency_score if triage_level not present
      const VALID_TRIAGE_LEVELS = new Set(['A', 'B', 'C', 'D', 'E']);
      let triageLevel: string | undefined;
      if (dataObj) {
        if (typeof dataObj.triage_level === 'string' && VALID_TRIAGE_LEVELS.has(dataObj.triage_level)) {
          triageLevel = dataObj.triage_level;
        } else if (typeof dataObj.urgency_score === 'number' && Number.isFinite(dataObj.urgency_score)) {
          const score = dataObj.urgency_score;
          if (score >= 80) triageLevel = 'A';
          else if (score >= 60) triageLevel = 'B';
          else if (score >= 40) triageLevel = 'C';
          else if (score >= 20) triageLevel = 'D';
          else triageLevel = 'E';
        }
      }

      if (triageLevel) {
        await dbQuery(
          `UPDATE consultation_sessions SET triage_level = $1::triage_level, updated_at = $2 WHERE id = $3`,
          [triageLevel, new Date().toISOString(), sessionId],
        );
        await cacheDel(`session:${sessionId}`);
      }
    }

    res.status(upstream.statusCode).json(upstream.body);
  }),
);

// ─── Emergency Routes ────────────────────────────────────────────────────────

export const emergencyRouter: Router = Router();

emergencyRouter.use(authenticate as never);
emergencyRouter.use(auditLogger as never);

emergencyRouter.post(
  '/alert',
  createStrictRateLimiter(10, 'emergency') as never,
  validate(...emergencyAlertRules),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { patientId, sessionId, alertType, severity, location } = req.body;

    // Authorization: patients can only create alerts for themselves
    if (authReq.user?.role === 'patient' && authReq.user.sub !== patientId) {
      throw AppError.forbidden('Patients can only create emergency alerts for themselves');
    }

    const alertId = uuidv4();
    const now = new Date().toISOString();

    await dbQuery(
      `INSERT INTO emergency_alerts
         (id, session_id, patient_id, alert_type, severity, latitude, longitude, address, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)`,
      [
        alertId, sessionId ?? null, patientId, alertType, severity,
        location.latitude, location.longitude, location.address ?? null,
        now,
      ],
    );

    const upstream = await forwardRequest('clinical', req, '/api/v1/triage/emergency', {
      body: { ...req.body, alertId },
    });

    // Verify the upstream clinical service acknowledged the alert
    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      console.error(
        `[Emergency] Clinical service returned ${upstream.statusCode} for alert ${alertId}`,
      );
      // Alert was saved locally but upstream failed — return 207 Multi-Status
      const body: ApiResponse<{ alertId: string; status: string; createdAt: string; upstreamStatus: number }> = {
        success: false,
        data: { alertId, status: 'active', createdAt: now, upstreamStatus: upstream.statusCode },
        meta: { requestId: authReq.requestId, warning: 'Alert saved but clinical service notification failed' },
      };
      res.status(207).json(body);
      return;
    }

    const body: ApiResponse<{ alertId: string; status: string; createdAt: string }> = {
      success: true,
      data: { alertId, status: 'active', createdAt: now },
      meta: { requestId: authReq.requestId },
    };
    res.status(201).json(body);
  }),
);

// ─── Clinical Trials Routes ──────────────────────────────────────────────────

export const trialsRouter: Router = Router();

trialsRouter.use(authenticate as never);
trialsRouter.use(auditLogger as never);

trialsRouter.get(
  '/search',
  validate(...trialSearchRules),
  asyncHandler(async (req: Request, res: Response) => {
    const upstream = await forwardRequest('trial', req, '/api/v1/search');
    res.status(upstream.statusCode).json(upstream.body);
  }),
);

trialsRouter.get(
  '/:id',
  validate(uuidOrNctParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const upstream = await forwardRequest('trial', req, `/api/v1/search/${id}`);
    res.status(upstream.statusCode).json(upstream.body);
  }),
);

trialsRouter.post(
  '/match',
  validate(
    ...paginationRules,
  ),
  requireRole('doctor', 'admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const upstream = await forwardRequest('trial', req, '/api/v1/match');
    res.status(upstream.statusCode).json(upstream.body);
  }),
);

// CSV upload -- pipe multipart form to trial-service
trialsRouter.post(
  '/csv/upload',
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    // Validate content type (must be multipart/form-data or text/csv)
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data') && !contentType.includes('text/csv')) {
      res.status(400).json({ success: false, error: 'Content-Type must be multipart/form-data or text/csv' });
      return;
    }

    // Enforce max file size (50 MB)
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 50 * 1024 * 1024) {
      res.status(413).json({ success: false, error: 'File size exceeds 50 MB limit' });
      return;
    }

    const http = await import('http');
    const { URL } = await import('url');
    const config = (await import('../config')).default;

    const target = new URL(config.services.trialService);
    const proxyReq = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: '/api/v1/ingest/csv/upload',
        method: 'POST',
        headers: {
          ...req.headers,
          host: `${target.hostname}:${target.port || 80}`,
        },
        timeout: 120000,
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode ?? 502);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ success: false, error: 'Trial service unavailable' });
      }
    });
    req.pipe(proxyReq);
  }),
);

// Express interest in a trial — handled locally (no downstream service endpoint)
trialsRouter.post(
  '/:id/interest',
  validate(uuidOrNctParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const patientId = authReq.user?.sub;
    if (!patientId) throw AppError.unauthorized('Authentication required');

    await queryOne(
      `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, NULL, 'trial_interest', 'trial', NULL, $2)`,
      [uuidv4(), JSON.stringify({ source: 'patient_portal', trialId: id, patientId })],
    );

    res.json({ success: true, data: { trialId: id, patientId, status: 'interest_recorded' } });
  }),
);

// CSV import status
trialsRouter.get(
  '/csv/status',
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const upstream = await forwardRequest('trial', req, '/api/v1/ingest/csv/status');
    res.status(upstream.statusCode).json(upstream.body);
  }),
);
