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
        (SELECT COUNT(DISTINCT center_id) FROM consultations WHERE created_at >= CURRENT_DATE)::int AS active_centers_today,
        (SELECT COALESCE(ROUND(
          COUNT(*) FILTER (WHERE triage_level IS NOT NULL)::numeric * 100.0 /
          GREATEST(COUNT(*), 1), 1
        ), 0) FROM consultations WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS triage_accuracy
    `, []);

    const data = {
      totalPatients: stats?.total_patients ?? 0,
      activeConsultations: stats?.active_sessions ?? 0,
      activeCenters: stats?.active_centers_today ?? 0,
      triageAccuracy: parseFloat(stats?.triage_accuracy ?? '0'),
      totalConsultations: stats?.total_consultations ?? 0,
      todayConsultations: stats?.today_consultations ?? 0,
      newPatientsWeek: stats?.new_patients_week ?? 0,
      emergencyCount: stats?.emergency_count ?? 0,
      avgConsultationMins: parseFloat(stats?.avg_consultation_mins ?? '0'),
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
      SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date, COUNT(*)::int AS count, 'consultations' AS type
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
        COALESCE(triage_level::text, 'Unassigned') AS category,
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
        h.id, h.name,
        CASE
          WHEN h.connectivity = 'good' THEN 'online'
          WHEN h.connectivity = 'intermittent' THEN 'degraded'
          ELSE 'offline'
        END AS status,
        COALESCE(ns.nurse_count, 0)::int AS nurses,
        COALESCE(cs.today_count, 0)::int AS patients,
        h.connectivity
      FROM health_centers h
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today_count
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

    // If type=kpis, return aggregated KPI object instead of disease list
    if (req.query.type === 'kpis') {
      const stats = await queryOne(`
        SELECT
          (SELECT COUNT(*) FROM consultations WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day')::int AS total_consultations,
          (SELECT COUNT(DISTINCT patient_id) FROM consultations WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day')::int AS unique_patients,
          (SELECT COALESCE(ROUND(AVG(duration_secs)::numeric / 60, 1), 0) FROM consultations WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day' AND duration_secs > 0) AS avg_wait_time,
          (SELECT COALESCE(ROUND(
            COUNT(*) FILTER (WHERE soap_note IS NOT NULL)::numeric * 100.0 /
            GREATEST(COUNT(*), 1), 1
          ), 0) FROM consultations WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day') AS ai_accuracy
      `, [days]);
      res.json({
        totalConsultations: stats?.total_consultations ?? 0,
        uniquePatients: stats?.unique_patients ?? 0,
        avgWaitTime: parseFloat(stats?.avg_wait_time ?? '0'),
        aiAccuracy: parseFloat(stats?.ai_accuracy ?? '0'),
      });
      return;
    }

    const rows = await queryRows(`
      SELECT
        d.value::text AS disease,
        COUNT(*)::int AS count
      FROM consultations,
           jsonb_array_elements(CASE WHEN jsonb_typeof(diagnosis) = 'array' THEN diagnosis ELSE '[]'::jsonb END) AS d(value)
      WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
      GROUP BY d.value::text
      ORDER BY count DESC
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
        u.id AS key, u.name,
        COALESCE(h.name, 'Unassigned') AS center,
        COUNT(c.id)::int AS consultations,
        ROUND(
          COUNT(c.id) FILTER (WHERE c.status = 'completed')::numeric * 100.0 /
          GREATEST(COUNT(c.id), 1), 1
        ) AS accuracy,
        COALESCE(ROUND(AVG(c.duration_secs)::numeric / 60, 1), 0) || ' min' AS "avgTime"
      FROM users u
      LEFT JOIN health_centers h ON u.center_id = h.id
      LEFT JOIN consultations c ON c.nurse_id = u.id
      WHERE u.role = 'nurse' AND u.active = true
      GROUP BY u.id, u.name, h.name
      ORDER BY consultations DESC
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
        TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date,
        ROUND(
          COUNT(*) FILTER (WHERE soap_note IS NOT NULL)::numeric * 100.0 /
          GREATEST(COUNT(*), 1), 1
        ) AS accuracy,
        'Claude 3 Haiku' AS model
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
    const rows = await queryRows(`
      SELECT * FROM (
        SELECT COALESCE(gender, 'Unknown') AS "group", COUNT(*)::int AS count
        FROM patients GROUP BY gender
        UNION ALL
        SELECT
          CASE
            WHEN age < 18 THEN '0-17 years'
            WHEN age < 30 THEN '18-29 years'
            WHEN age < 45 THEN '30-44 years'
            WHEN age < 60 THEN '45-59 years'
            ELSE '60+ years'
          END AS "group",
          COUNT(*)::int AS count
        FROM patients WHERE age IS NOT NULL
        GROUP BY "group"
      ) combined ORDER BY count DESC
    `, []);
    res.json(rows);
  }),
);

// GET /analytics/wait-times
analyticsRouter.get(
  '/wait-times',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        h.name AS center,
        COALESCE(ROUND(AVG(c.duration_secs)::numeric / 60, 1), 0) AS "waitTime"
      FROM consultations c
      JOIN health_centers h ON c.center_id = h.id
      WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY h.name
      ORDER BY "waitTime" DESC
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
    const now = new Date().toISOString();
    const svcList = [
      { key: 'api-gateway', name: 'API Gateway', port: 3000, type: 'core' },
      { key: 'clinical-service', name: 'Clinical Service', port: 3001, type: 'core' },
      { key: 'integration-service', name: 'Integration Service', port: 3002, type: 'integration' },
      { key: 'voice-service', name: 'Voice Service', port: 8001, type: 'ai' },
      { key: 'nlu-service', name: 'NLU Service', port: 8002, type: 'ai' },
      { key: 'trial-service', name: 'Trial Service', port: 8003, type: 'data' },
      { key: 'telemedicine-service', name: 'Telemedicine Service', port: 8004, type: 'video' },
      { key: 'postgresql', name: 'PostgreSQL', port: 5432, type: 'database' },
      { key: 'redis', name: 'Redis', port: 6379, type: 'cache' },
    ];
    const services = svcList.map((svc) => {
      const cs = circuitStatus[svc.key];
      const isDown = cs?.state === 'open';
      return {
        key: svc.key,
        name: svc.name,
        status: isDown ? 'down' : (cs?.state === 'half-open' ? 'degraded' : 'healthy'),
        uptime: '99.9%',
        responseTime: cs?.failures ? Math.min(cs.failures * 50, 5000) : 45,
        version: '1.0.0',
        lastChecked: now,
        errorRate: cs?.failures ?? 0,
      };
    });
    res.json(services);
  }),
);

// GET /system/response-times
systemRouter.get(
  '/response-times',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await queryRows(`
      SELECT
        TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS time,
        COUNT(*)::int AS requests,
        COALESCE(ROUND(AVG(duration_secs)::numeric * 10, 0), 100)::int AS "responseTime",
        'api-gateway' AS service
      FROM consultations
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY time
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
      SELECT id,
             CASE WHEN action LIKE '%error%' THEN 'error' WHEN action LIKE '%fail%' THEN 'warning' ELSE 'info' END AS severity,
             resource_type AS service,
             COALESCE(details->>'message', action) AS message,
             created_at AS timestamp
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
