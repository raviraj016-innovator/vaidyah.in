import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { auditLogger } from '../middleware/audit';
import { createRoleBasedRateLimiter } from '../middleware/rateLimiter';
import { queryOne, queryRows } from '../services/db';
import { cacheGet, cacheSet } from '../services/redis';
import { AuthenticatedRequest } from '../types';
import { getCircuitStatus } from '../services/proxy';
import { getAwsServicesSummary } from '../services/aws-init';

const roleRateLimiter = createRoleBasedRateLimiter();

// ─── Dashboard Routes ──────────────────────────────────────────────────────

export const dashboardRouter: Router = Router();
dashboardRouter.use(authenticate as never);
dashboardRouter.use(roleRateLimiter as never);
dashboardRouter.use(auditLogger as never);

// GET /dashboard/kpis
dashboardRouter.get(
  '/kpis',
  asyncHandler(async (_req: Request, res: Response) => {
    const cached = await cacheGet('dashboard:kpis');
    if (cached) { res.json(cached); return; }

    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM consultations)::int AS total_consultations,
        (SELECT COUNT(*) FROM consultations WHERE created_at >= CURRENT_DATE - INTERVAL '1 day')::int AS today_consultations,
        (SELECT COUNT(*) FROM patients)::int AS total_patients,
        (SELECT COUNT(*) FROM patients WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS new_patients_week,
        (SELECT COUNT(*) FROM consultations WHERE urgency IN ('high','critical'))::int AS emergency_count,
        (SELECT COUNT(*) FROM consultations WHERE status = 'in_progress')::int AS active_sessions,
        (SELECT ROUND(AVG(duration_secs)::numeric / 60, 1) FROM consultations WHERE duration_secs > 0) AS avg_consultation_mins,
        (SELECT COUNT(DISTINCT center_id) FROM consultations WHERE created_at >= CURRENT_DATE)::int AS active_centers_today
    `, []);

    const data = {
      totalConsultations: stats?.total_consultations ?? 0,
      todayConsultations: stats?.today_consultations ?? 0,
      totalPatients: stats?.total_patients ?? 0,
      newPatientsWeek: stats?.new_patients_week ?? 0,
      emergencyCount: stats?.emergency_count ?? 0,
      activeSessions: stats?.active_sessions ?? 0,
      avgConsultationMins: parseFloat(stats?.avg_consultation_mins ?? '0'),
      activeCentersToday: stats?.active_centers_today ?? 0,
    };

    await cacheSet('dashboard:kpis', data, 60);
    res.json(data);
  }),
);

// GET /dashboard/consultations/trend
dashboardRouter.get(
  '/consultations/trend',
  asyncHandler(async (req: Request, res: Response) => {
    const days = Math.min(parseInt(req.query.days as string, 10) || 30, 90);
    const rows = await queryRows(`
      SELECT DATE(created_at) AS date, COUNT(*)::int AS count
      FROM consultations
      WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [days]);
    res.json(rows);
  }),
);

// GET /dashboard/triage/summary
dashboardRouter.get(
  '/triage/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        COALESCE(triage_level::text, 'unassigned') AS level,
        COUNT(*)::int AS count
      FROM consultations
      GROUP BY triage_level
      ORDER BY triage_level
    `, []);
    res.json(rows);
  }),
);

// GET /dashboard/conditions/top
dashboardRouter.get(
  '/conditions/top',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);
    const rows = await queryRows(`
      SELECT
        d.value::text AS condition,
        COUNT(*)::int AS count
      FROM consultations,
           jsonb_array_elements(CASE WHEN jsonb_typeof(diagnosis) = 'array' THEN diagnosis ELSE '[]'::jsonb END) AS d(value)
      GROUP BY d.value::text
      ORDER BY count DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  }),
);

// GET /dashboard/centers/status
dashboardRouter.get(
  '/centers/status',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        h.id, h.name, h.code, h.district, h.state, h.latitude, h.longitude,
        h.connectivity, h.active,
        COALESCE(cs.today_count, 0)::int AS today_consultations,
        COALESCE(cs.active_count, 0)::int AS active_sessions,
        COALESCE(ns.nurse_count, 0)::int AS nurse_count
      FROM health_centers h
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today_count,
               COUNT(*) FILTER (WHERE status = 'in_progress') AS active_count
        FROM consultations WHERE center_id = h.id
      ) cs ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS nurse_count FROM users WHERE center_id = h.id AND role = 'nurse' AND active = true
      ) ns ON true
      WHERE h.active = true
      ORDER BY h.name
    `, []);
    res.json(rows);
  }),
);

// ─── Analytics Routes ──────────────────────────────────────────────────────

export const analyticsRouter: Router = Router();
analyticsRouter.use(authenticate as never);
analyticsRouter.use(roleRateLimiter as never);
analyticsRouter.use(auditLogger as never);

// GET /analytics/diseases/prevalence
analyticsRouter.get(
  '/diseases/prevalence',
  asyncHandler(async (req: Request, res: Response) => {
    const period = (req.query.period as string) || '30d';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const rows = await queryRows(`
      SELECT
        d.value::text AS disease,
        COUNT(*)::int AS cases,
        ROUND(COUNT(*)::numeric * 100.0 / GREATEST(
          (SELECT COUNT(*) FROM consultations WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'), 1
        ), 1) AS percentage
      FROM consultations,
           jsonb_array_elements(CASE WHEN jsonb_typeof(diagnosis) = 'array' THEN diagnosis ELSE '[]'::jsonb END) AS d(value)
      WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
      GROUP BY d.value::text
      ORDER BY cases DESC
      LIMIT 15
    `, [days]);
    res.json(rows);
  }),
);

// GET /analytics/nurses/performance
analyticsRouter.get(
  '/nurses/performance',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        u.id, u.name,
        COUNT(c.id)::int AS consultations_count,
        ROUND(AVG(c.duration_secs)::numeric / 60, 1) AS avg_duration_mins,
        COUNT(c.id) FILTER (WHERE c.urgency IN ('high','critical'))::int AS emergency_count,
        ROUND(
          COUNT(c.id) FILTER (WHERE c.status = 'completed')::numeric * 100.0 /
          GREATEST(COUNT(c.id), 1), 1
        ) AS completion_rate
      FROM users u
      LEFT JOIN consultations c ON c.nurse_id = u.id
      WHERE u.role = 'nurse' AND u.active = true
      GROUP BY u.id, u.name
      ORDER BY consultations_count DESC
    `, []);
    res.json(rows);
  }),
);

// GET /analytics/ai/accuracy
analyticsRouter.get(
  '/ai/accuracy',
  asyncHandler(async (req: Request, res: Response) => {
    const period = (req.query.period as string) || '30d';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const rows = await queryRows(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE soap_note IS NOT NULL)::int AS ai_generated,
        COUNT(*) FILTER (WHERE triage_level IS NOT NULL)::int AS ai_triaged
      FROM consultations
      WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [days]);
    res.json(rows);
  }),
);

// GET /analytics/patients/demographics
analyticsRouter.get(
  '/patients/demographics',
  asyncHandler(async (_req: Request, res: Response) => {
    const gender = await queryRows(`
      SELECT COALESCE(gender, 'unknown') AS gender, COUNT(*)::int AS count
      FROM patients GROUP BY gender
    `, []);
    const age = await queryRows(`
      SELECT
        CASE
          WHEN age < 18 THEN '0-17'
          WHEN age < 30 THEN '18-29'
          WHEN age < 45 THEN '30-44'
          WHEN age < 60 THEN '45-59'
          ELSE '60+'
        END AS age_group,
        COUNT(*)::int AS count
      FROM patients WHERE age IS NOT NULL
      GROUP BY age_group ORDER BY age_group
    `, []);
    res.json({ gender, age });
  }),
);

// GET /analytics/wait-times
analyticsRouter.get(
  '/wait-times',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        h.name AS center,
        ROUND(AVG(c.duration_secs)::numeric / 60, 1) AS avg_duration_mins,
        COUNT(c.id)::int AS total_consultations
      FROM consultations c
      JOIN health_centers h ON c.center_id = h.id
      WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY h.name
      ORDER BY avg_duration_mins DESC
    `, []);
    res.json(rows);
  }),
);

// ─── System Routes ──────────────────────────────────────────────────────────

export const systemRouter: Router = Router();
systemRouter.use(authenticate as never);
systemRouter.use(roleRateLimiter as never);
systemRouter.use(auditLogger as never);

// GET /system/services
systemRouter.get(
  '/services',
  asyncHandler(async (_req: Request, res: Response) => {
    const circuitStatus = getCircuitStatus();
    const services = [
      { name: 'api-gateway', port: 3000, status: 'healthy', type: 'core' },
      { name: 'clinical-service', port: 3001, status: circuitStatus['clinical-service']?.state === 'open' ? 'unhealthy' : 'healthy', type: 'core' },
      { name: 'integration-service', port: 3002, status: circuitStatus['integration-service']?.state === 'open' ? 'unhealthy' : 'healthy', type: 'integration' },
      { name: 'voice-service', port: 8001, status: circuitStatus['voice-service']?.state === 'open' ? 'unhealthy' : 'healthy', type: 'ai' },
      { name: 'nlu-service', port: 8002, status: circuitStatus['nlu-service']?.state === 'open' ? 'unhealthy' : 'healthy', type: 'ai' },
      { name: 'trial-service', port: 8003, status: circuitStatus['trial-service']?.state === 'open' ? 'unhealthy' : 'healthy', type: 'data' },
      { name: 'telemedicine-service', port: 8004, status: circuitStatus['telemedicine-service']?.state === 'open' ? 'unhealthy' : 'healthy', type: 'video' },
      { name: 'postgresql', port: 5432, status: 'healthy', type: 'database' },
      { name: 'redis', port: 6379, status: 'healthy', type: 'cache' },
    ];
    res.json(services);
  }),
);

// GET /system/response-times
systemRouter.get(
  '/response-times',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*)::int AS requests,
        ROUND(AVG(duration_secs)::numeric, 2) AS avg_response_secs
      FROM consultations
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, []);
    res.json(rows);
  }),
);

// GET /system/error-rates
systemRouter.get(
  '/error-rates',
  asyncHandler(async (_req: Request, res: Response) => {
    const circuitStatus = getCircuitStatus();
    const data = Object.entries(circuitStatus).map(([service, status]) => ({
      service,
      failures: status.failures,
      state: status.state,
    }));
    res.json(data);
  }),
);

// GET /system/alerts
systemRouter.get(
  '/alerts',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT id, action AS type, resource_type, details, created_at
      FROM audit_log
      WHERE action LIKE '%error%' OR action LIKE '%fail%' OR action LIKE '%alert%'
      ORDER BY created_at DESC
      LIMIT 20
    `, []);
    res.json(rows);
  }),
);

// GET /system/metrics
systemRouter.get(
  '/metrics',
  asyncHandler(async (__req: Request, res: Response) => {
    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM consultations)::int AS total_consultations,
        (SELECT COUNT(*) FROM patients)::int AS total_patients,
        (SELECT COUNT(*) FROM users WHERE active = true)::int AS active_users,
        (SELECT COUNT(*) FROM health_centers WHERE active = true)::int AS active_centers,
        (SELECT COUNT(*) FROM alerts)::int AS total_alerts,
        (SELECT COUNT(*) FROM audit_log)::int AS audit_entries
    `, []);
    res.json(stats);
  }),
);

// GET /system/aws
systemRouter.get(
  '/aws',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getAwsServicesSummary());
  }),
);

// ─── Nurse Dashboard Routes ─────────────────────────────────────────────────

export const nurseDashboardRouter: Router = Router();
nurseDashboardRouter.use(authenticate as never);
nurseDashboardRouter.use(roleRateLimiter as never);
nurseDashboardRouter.use(auditLogger as never);

// GET /nurse/dashboard/stats
nurseDashboardRouter.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const nurseId = authReq.user?.sub;

    const stats = await queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND status = 'completed')::int AS patients_seen,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS pending_triage,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND urgency IN ('high','critical'))::int AS emergencies
      FROM consultations
      WHERE nurse_id = $1 OR $1 IS NULL
    `, [nurseId ?? null]);

    res.json({
      patientsSeen: stats?.patients_seen ?? 0,
      pendingTriage: stats?.pending_triage ?? 0,
      emergencies: stats?.emergencies ?? 0,
    });
  }),
);
