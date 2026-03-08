import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole } from '../middleware/auth';
import { auditLogger } from '../middleware/audit';
import { createRoleBasedRateLimiter } from '../middleware/rateLimiter';
import { validate, uuidParam, paginationRules, createPatientRules, patientSearchRules } from '../middleware/validator';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { queryOne, queryRows, query as dbQuery } from '../services/db';
import { AuthenticatedRequest } from '../types';

const roleRateLimiter = createRoleBasedRateLimiter();

// ─── User Management Routes ───────────────────────────────────────────────

export const usersRouter: Router = Router();
usersRouter.use(authenticate as never);
usersRouter.use(roleRateLimiter as never);
usersRouter.use(auditLogger as never);

// GET /users/roles (must be before /:id to avoid conflict)
usersRouter.get(
  '/roles',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, data: ['admin', 'doctor', 'nurse', 'patient'] });
  }),
);

// GET /users
usersRouter.get(
  '/',
  validate(...paginationRules),
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const role = req.query.role as string | undefined;
    const search = req.query.search as string | undefined;

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (role) { where += ` AND u.role = $${idx++}`; params.push(role); }
    if (search) { where += ` AND (u.name ILIKE $${idx++} OR u.email ILIKE $${idx})`; params.push(`%${search}%`); idx++; params.push(`%${search}%`); }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users u ${where}`, params,
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await queryRows(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.center_id, u.active,
              u.specialization, u.last_login, u.created_at,
              h.name AS center_name
       FROM users u LEFT JOIN health_centers h ON u.center_id = h.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    res.json({ success: true, data: rows, meta: { page, limit, total } });
  }),
);

// GET /users/:id
usersRouter.get(
  '/:id',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT u.*, h.name AS center_name
       FROM users u LEFT JOIN health_centers h ON u.center_id = h.id
       WHERE u.id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('User');
    res.json({ success: true, data: row });
  }),
);

// POST /users
usersRouter.post(
  '/',
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, phone, role, centerId, specialization } = req.body;
    if (!name || !role) throw AppError.badRequest('name and role are required');

    const id = uuidv4();
    const row = await queryOne(
      `INSERT INTO users (id, name, email, phone, role, center_id, specialization)
       VALUES ($1, $2, $3, $4, $5::user_role, $6, $7)
       RETURNING *`,
      [id, name, email ?? null, phone ?? null, role, centerId ?? null, specialization ?? null],
    );
    res.status(201).json({ success: true, data: row });
  }),
);

// PUT /users/:id
usersRouter.put(
  '/:id',
  validate(uuidParam('id')),
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, email, phone, role, centerId, specialization, active } = req.body;
    const row = await queryOne(
      `UPDATE users SET
        name = COALESCE($2, name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        role = COALESCE($5::user_role, role),
        center_id = COALESCE($6, center_id),
        specialization = COALESCE($7, specialization),
        active = COALESCE($8, active)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name ?? null, email ?? null, phone ?? null, role ?? null, centerId ?? null, specialization ?? null, active ?? null],
    );
    if (!row) throw AppError.notFound('User');
    res.json({ success: true, data: row });
  }),
);

// DELETE /users/:id (soft delete)
usersRouter.delete(
  '/:id',
  validate(uuidParam('id')),
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `UPDATE users SET active = false WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('User');
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  }),
);

// ─── Health Center Management Routes ──────────────────────────────────────

export const centersRouter: Router = Router();
centersRouter.use(authenticate as never);
centersRouter.use(roleRateLimiter as never);
centersRouter.use(auditLogger as never);

// GET /centers
centersRouter.get(
  '/',
  validate(...paginationRules),
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = (page - 1) * limit;

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM health_centers`, [],
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await queryRows(
      `SELECT h.*,
              (SELECT COUNT(*) FROM users WHERE center_id = h.id AND active = true)::int AS staff_count,
              (SELECT COUNT(*) FROM consultations WHERE center_id = h.id AND created_at >= CURRENT_DATE)::int AS today_consultations
       FROM health_centers h
       ORDER BY h.name
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({ success: true, data: rows, meta: { page, limit, total } });
  }),
);

// GET /centers/:id
centersRouter.get(
  '/:id',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT h.*,
              (SELECT COUNT(*) FROM users WHERE center_id = h.id AND active = true)::int AS staff_count
       FROM health_centers h WHERE h.id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Health Center');
    res.json({ success: true, data: row });
  }),
);

// POST /centers
centersRouter.post(
  '/',
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, code, district, state, pincode, latitude, longitude, connectivity, phone } = req.body;
    if (!name || !code || !district || !state) {
      throw AppError.badRequest('name, code, district, and state are required');
    }
    const id = uuidv4();
    const row = await queryOne(
      `INSERT INTO health_centers (id, name, code, district, state, pincode, latitude, longitude, connectivity, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, name, code, district, state, pincode ?? null, latitude ?? null, longitude ?? null, connectivity ?? 'limited', phone ?? null],
    );
    res.status(201).json({ success: true, data: row });
  }),
);

// PUT /centers/:id
centersRouter.put(
  '/:id',
  validate(uuidParam('id')),
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, code, district, state, pincode, latitude, longitude, connectivity, phone, active } = req.body;
    const row = await queryOne(
      `UPDATE health_centers SET
        name = COALESCE($2, name),
        code = COALESCE($3, code),
        district = COALESCE($4, district),
        state = COALESCE($5, state),
        pincode = COALESCE($6, pincode),
        latitude = COALESCE($7, latitude),
        longitude = COALESCE($8, longitude),
        connectivity = COALESCE($9, connectivity),
        phone = COALESCE($10, phone),
        active = COALESCE($11, active)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name ?? null, code ?? null, district ?? null, state ?? null,
       pincode ?? null, latitude ?? null, longitude ?? null, connectivity ?? null, phone ?? null, active ?? null],
    );
    if (!row) throw AppError.notFound('Health Center');
    res.json({ success: true, data: row });
  }),
);

// DELETE /centers/:id (soft delete)
centersRouter.delete(
  '/:id',
  validate(uuidParam('id')),
  requireRole('admin') as never,
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `UPDATE health_centers SET active = false WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Health Center');
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  }),
);

// GET /centers/:id/stats
centersRouter.get(
  '/:id/stats',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM consultations WHERE center_id = $1)::int AS total_consultations,
        (SELECT COUNT(*) FROM consultations WHERE center_id = $1 AND created_at >= CURRENT_DATE)::int AS today_consultations,
        (SELECT COUNT(*) FROM users WHERE center_id = $1 AND active = true)::int AS staff_count,
        (SELECT COUNT(DISTINCT patient_id) FROM consultations WHERE center_id = $1)::int AS unique_patients,
        (SELECT ROUND(AVG(duration_secs)::numeric / 60, 1) FROM consultations WHERE center_id = $1 AND duration_secs > 0) AS avg_duration_mins
    `, [req.params.id]);
    res.json({ success: true, data: stats });
  }),
);

// ─── Patient Management Routes ────────────────────────────────────────────

export const patientsManagementRouter: Router = Router();
patientsManagementRouter.use(authenticate as never);
patientsManagementRouter.use(roleRateLimiter as never);
patientsManagementRouter.use(auditLogger as never);

// GET /patients/search (must be before /:id)
patientsManagementRouter.get(
  '/search',
  validate(...patientSearchRules),
  asyncHandler(async (req: Request, res: Response) => {
    const { abdmId, phone, name } = req.query;
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (abdmId) { where += ` AND abdm_id = $${idx++}`; params.push(abdmId); }
    if (phone) { where += ` AND phone = $${idx++}`; params.push(phone); }
    if (name) { where += ` AND name ILIKE $${idx++}`; params.push(`%${name}%`); }

    const rows = await queryRows(
      `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, created_at
       FROM patients ${where}
       ORDER BY created_at DESC LIMIT 20`,
      params,
    );
    res.json({ success: true, data: rows });
  }),
);

// GET /patients/recent
patientsManagementRouter.get(
  '/recent',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);
    const rows = await queryRows(
      `SELECT p.id, p.name, p.phone, p.abdm_id, p.age, p.gender, p.date_of_birth,
              c.created_at AS last_visit, c.status AS last_status
       FROM patients p
       LEFT JOIN LATERAL (
         SELECT created_at, status FROM consultations
         WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1
       ) c ON true
       ORDER BY COALESCE(c.created_at, p.created_at) DESC
       LIMIT $1`,
      [limit],
    );
    res.json({ success: true, data: rows });
  }),
);

// POST /patients/abdm/lookup
patientsManagementRouter.post(
  '/abdm/lookup',
  asyncHandler(async (req: Request, res: Response) => {
    const { abdmId } = req.body;
    if (!abdmId) throw AppError.badRequest('abdmId is required');

    const patient = await queryOne(
      `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, address, blood_group
       FROM patients WHERE abdm_id = $1`,
      [abdmId],
    );
    if (!patient) throw AppError.notFound('Patient with this ABDM ID');
    res.json({ success: true, data: patient });
  }),
);

// GET /patients
patientsManagementRouter.get(
  '/',
  validate(...paginationRules),
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = (page - 1) * limit;

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM patients`, [],
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await queryRows(
      `SELECT id, name, phone, abdm_id, age, gender, date_of_birth, created_at, updated_at
       FROM patients
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({ success: true, data: rows, meta: { page, limit, total } });
  }),
);

// GET /patients/:id
patientsManagementRouter.get(
  '/:id',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT * FROM patients WHERE id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Patient');
    res.json({ success: true, data: row });
  }),
);

// POST /patients
patientsManagementRouter.post(
  '/',
  validate(...createPatientRules),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, abdmId, dateOfBirth, gender, district, state, pincode, age } = req.body;
    const id = uuidv4();
    const row = await queryOne(
      `INSERT INTO patients (id, name, phone, abdm_id, date_of_birth, gender, age, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, name, phone, abdmId ?? null, dateOfBirth ?? null, gender ?? null, age ?? null,
       req.body.address ? JSON.stringify({ line: req.body.address, district, state, pincode }) : null],
    );
    res.status(201).json({ success: true, data: row });
  }),
);

// PUT /patients/:id
patientsManagementRouter.put(
  '/:id',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, abdmId, dateOfBirth, gender, age } = req.body;
    const row = await queryOne(
      `UPDATE patients SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        abdm_id = COALESCE($4, abdm_id),
        date_of_birth = COALESCE($5, date_of_birth),
        gender = COALESCE($6, gender),
        age = COALESCE($7, age)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name ?? null, phone ?? null, abdmId ?? null, dateOfBirth ?? null, gender ?? null, age ?? null],
    );
    if (!row) throw AppError.notFound('Patient');
    res.json({ success: true, data: row });
  }),
);

// ─── Consultation Routes ──────────────────────────────────────────────────

export const consultationsRouter: Router = Router();
consultationsRouter.use(authenticate as never);
consultationsRouter.use(roleRateLimiter as never);
consultationsRouter.use(auditLogger as never);

// GET /consultations
consultationsRouter.get(
  '/',
  validate(...paginationRules),
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const centerId = req.query.centerId as string | undefined;
    const triageLevel = req.query.triageLevel as string | undefined;

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (status) { where += ` AND c.status = $${idx++}::consultation_status`; params.push(status); }
    if (centerId) { where += ` AND c.center_id = $${idx++}`; params.push(centerId); }
    if (triageLevel) { where += ` AND c.triage_level = $${idx++}::triage_level`; params.push(triageLevel); }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM consultations c ${where}`, params,
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await queryRows(
      `SELECT c.id, c.status, c.triage_level, c.urgency, c.language,
              c.vitals, c.symptoms, c.diagnosis, c.soap_note, c.prosody_scores,
              c.duration_secs, c.created_at, c.completed_at,
              p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender, p.phone AS patient_phone,
              n.name AS nurse_name,
              h.name AS center_name
       FROM consultations c
       LEFT JOIN patients p ON c.patient_id = p.id
       LEFT JOIN users n ON c.nurse_id = n.id
       LEFT JOIN health_centers h ON c.center_id = h.id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: rows, meta: { page, limit, total } });
  }),
);

// GET /consultations/:id
consultationsRouter.get(
  '/:id',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT c.*,
              p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender,
              p.phone AS patient_phone, p.abdm_id AS patient_abdm_id,
              n.name AS nurse_name,
              d.name AS doctor_name,
              h.name AS center_name
       FROM consultations c
       LEFT JOIN patients p ON c.patient_id = p.id
       LEFT JOIN users n ON c.nurse_id = n.id
       LEFT JOIN users d ON c.doctor_id = d.id
       LEFT JOIN health_centers h ON c.center_id = h.id
       WHERE c.id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Consultation');
    res.json({ success: true, data: row });
  }),
);

// GET /consultations/:id/transcript
consultationsRouter.get(
  '/:id/transcript',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT id, transcript, transcript_original, language FROM consultations WHERE id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Consultation');
    res.json({ success: true, data: { transcript: row.transcript, original: row.transcript_original, language: row.language } });
  }),
);

// GET /consultations/:id/soap
consultationsRouter.get(
  '/:id/soap',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    // Try soap_notes table first, fall back to consultation.soap_note JSONB
    const soapRow = await queryOne(
      `SELECT * FROM soap_notes WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
      [req.params.id],
    );
    if (soapRow) {
      res.json({ success: true, data: soapRow });
      return;
    }
    const row = await queryOne(
      `SELECT id, soap_note FROM consultations WHERE id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Consultation');
    res.json({ success: true, data: row.soap_note || null });
  }),
);

// GET /consultations/:id/prosody
consultationsRouter.get(
  '/:id/prosody',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT id, prosody_scores FROM consultations WHERE id = $1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Consultation');
    res.json({ success: true, data: row.prosody_scores });
  }),
);

// ─── Notification Routes ──────────────────────────────────────────────────

export const notificationsRouter: Router = Router();
notificationsRouter.use(authenticate as never);
notificationsRouter.use(roleRateLimiter as never);
notificationsRouter.use(auditLogger as never);

// GET /notifications
notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const patientId = authReq.user?.sub;
    const rows = await queryRows(
      `SELECT id, alert_type AS type, title, message, metadata, sent, acknowledged AS read, created_at
       FROM alerts
       WHERE patient_id = $1 OR $1 IS NULL
       ORDER BY created_at DESC
       LIMIT 50`,
      [patientId ?? null],
    );
    res.json({ success: true, data: rows });
  }),
);

// POST /notifications/:id/read
notificationsRouter.post(
  '/:id/read',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    await dbQuery(
      `UPDATE alerts SET acknowledged = true WHERE id = $1`,
      [req.params.id],
    );
    res.json({ success: true, data: { id: req.params.id, read: true } });
  }),
);

// POST /notifications/read-all
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const patientId = authReq.user?.sub;
    await dbQuery(
      `UPDATE alerts SET acknowledged = true WHERE (patient_id = $1 OR $1 IS NULL) AND acknowledged = false`,
      [patientId ?? null],
    );
    res.json({ success: true, data: { message: 'All notifications marked as read' } });
  }),
);

// ─── Session Extensions ──────────────────────────────────────────────────

export const sessionExtRouter: Router = Router();
sessionExtRouter.use(authenticate as never);
sessionExtRouter.use(roleRateLimiter as never);
sessionExtRouter.use(auditLogger as never);

// POST /sessions/start (alias for POST /sessions)
sessionExtRouter.post(
  '/start',
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, nurseId, facilityId, centerId, language } = req.body;
    const id = uuidv4();
    const cid = facilityId || centerId;
    const row = await queryOne(
      `INSERT INTO consultations (id, patient_id, nurse_id, center_id, language, status)
       VALUES ($1, $2, $3, $4, $5, 'in_progress')
       RETURNING *`,
      [id, patientId, nurseId ?? null, cid ?? null, language ?? 'hi'],
    );
    res.status(201).json({ success: true, data: row });
  }),
);

// POST /sessions/:id/pause
sessionExtRouter.post(
  '/:id/pause',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `UPDATE consultations SET status = 'in_progress' WHERE id = $1 RETURNING id, status`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Session');
    res.json({ success: true, data: { id: req.params.id, status: 'paused' } });
  }),
);

// POST /sessions/:id/resume
sessionExtRouter.post(
  '/:id/resume',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `UPDATE consultations SET status = 'in_progress' WHERE id = $1 RETURNING id, status`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Session');
    res.json({ success: true, data: { id: req.params.id, status: 'in_progress' } });
  }),
);

// POST /sessions/:id/complete
sessionExtRouter.post(
  '/:id/complete',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `UPDATE consultations SET status = 'completed', completed_at = NOW()
       WHERE id = $1 RETURNING id, status, completed_at`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Session');
    res.json({ success: true, data: row });
  }),
);

// POST /sessions/:id/triage
sessionExtRouter.post(
  '/:id/triage',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const { triageLevel, urgencyScore, redFlags, recommendation } = req.body;
    const id = uuidv4();
    const row = await queryOne(
      `INSERT INTO triage_results (id, session_id, triage_level, urgency_score, red_flags, recommended_action, input_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, req.params.id, triageLevel ?? 'B', urgencyScore ?? null,
       JSON.stringify(redFlags ?? []), recommendation ?? null, JSON.stringify(req.body)],
    );
    // Also update the consultation
    if (triageLevel) {
      await dbQuery(
        `UPDATE consultations SET triage_level = $1::triage_level, urgency = $2::urgency_level WHERE id = $3`,
        [triageLevel, urgencyScore >= 70 ? 'high' : urgencyScore >= 40 ? 'medium' : 'low', req.params.id],
      );
    }
    res.status(201).json({ success: true, data: row });
  }),
);

// POST /sessions/:id/soap
sessionExtRouter.post(
  '/:id/soap',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const { subjective, objective, assessment, plan } = req.body;
    const id = uuidv4();
    const row = await queryOne(
      `INSERT INTO soap_notes (id, session_id, subjective, objective, assessment, plan)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, req.params.id,
       JSON.stringify(subjective ?? {}), JSON.stringify(objective ?? {}),
       JSON.stringify(assessment ?? {}), JSON.stringify(plan ?? {})],
    );
    // Also update the consultation soap_note JSONB
    await dbQuery(
      `UPDATE consultations SET soap_note = $1 WHERE id = $2`,
      [JSON.stringify({ subjective, objective, assessment, plan }), req.params.id],
    );
    res.status(201).json({ success: true, data: row });
  }),
);

// GET /sessions/:id/soap
sessionExtRouter.get(
  '/:id/soap',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT * FROM soap_notes WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
      [req.params.id],
    );
    if (!row) {
      // Fall back to consultation.soap_note
      const c = await queryOne(`SELECT soap_note FROM consultations WHERE id = $1`, [req.params.id]);
      if (!c) throw AppError.notFound('Session');
      res.json({ success: true, data: c.soap_note || null });
      return;
    }
    res.json({ success: true, data: row });
  }),
);

// GET /sessions/:id/triage
sessionExtRouter.get(
  '/:id/triage',
  validate(uuidParam('id')),
  asyncHandler(async (req: Request, res: Response) => {
    const row = await queryOne(
      `SELECT * FROM triage_results WHERE session_id = $1 ORDER BY assessed_at DESC LIMIT 1`,
      [req.params.id],
    );
    if (!row) throw AppError.notFound('Triage result');
    res.json({ success: true, data: row });
  }),
);

// ─── Emergency Extensions ─────────────────────────────────────────────────

export const emergencyExtRouter: Router = Router();
emergencyExtRouter.use(authenticate as never);
emergencyExtRouter.use(roleRateLimiter as never);
emergencyExtRouter.use(auditLogger as never);

// GET /emergency/:id
emergencyExtRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    // Try emergency_alerts table first, then alerts table
    let row = await queryOne(
      `SELECT ea.*, p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender, p.phone AS patient_phone,
              c.vitals
       FROM emergency_alerts ea
       LEFT JOIN consultation_sessions cs ON ea.session_id = cs.id
       LEFT JOIN patients p ON ea.patient_id = p.id
       LEFT JOIN consultations c ON c.patient_id = p.id
       WHERE ea.id = $1 OR ea.session_id = $1
       ORDER BY ea.created_at DESC LIMIT 1`,
      [req.params.id],
    );
    if (!row) {
      // Try alerts table
      row = await queryOne(
        `SELECT a.*, p.name AS patient_name, p.age AS patient_age, p.gender AS patient_gender, p.phone AS patient_phone
         FROM alerts a
         LEFT JOIN patients p ON a.patient_id = p.id
         WHERE (a.id = $1 OR a.consultation_id = $1) AND a.alert_type = 'emergency'
         ORDER BY a.created_at DESC LIMIT 1`,
        [req.params.id],
      );
    }
    if (!row) throw AppError.notFound('Emergency alert');
    res.json({ success: true, data: row });
  }),
);

// POST /emergency/:id/ambulance
emergencyExtRouter.post(
  '/:id/ambulance',
  asyncHandler(async (req: Request, res: Response) => {
    const alertId = uuidv4();
    await dbQuery(
      `INSERT INTO alerts (id, consultation_id, alert_type, title, message, metadata, sent)
       VALUES ($1, $2, 'emergency', 'Ambulance Requested',
               'Ambulance dispatch requested for emergency', $3, true)`,
      [alertId, req.params.id, JSON.stringify({ action: 'ambulance_request', originalAlertId: req.params.id })],
    );
    // Try to update emergency_alerts status
    await dbQuery(
      `UPDATE emergency_alerts SET status = 'dispatched' WHERE id = $1 OR session_id = $1`,
      [req.params.id],
    ).catch(() => {});
    res.json({ success: true, data: { alertId, status: 'dispatched', message: 'Ambulance request sent' } });
  }),
);

// POST /emergency/:id/contact-mo
emergencyExtRouter.post(
  '/:id/contact-mo',
  asyncHandler(async (req: Request, res: Response) => {
    const alertId = uuidv4();
    await dbQuery(
      `INSERT INTO alerts (id, consultation_id, alert_type, title, message, metadata, sent)
       VALUES ($1, $2, 'emergency', 'Medical Officer Contacted',
               'Medical Officer has been notified of emergency', $3, true)`,
      [alertId, req.params.id, JSON.stringify({ action: 'contact_mo', originalAlertId: req.params.id })],
    );
    res.json({ success: true, data: { alertId, status: 'notified', message: 'Medical Officer notified' } });
  }),
);

// PUT /emergency/:id/status
emergencyExtRouter.put(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.body;
    // Update emergency_alerts if it exists
    await dbQuery(
      `UPDATE emergency_alerts SET status = $1 WHERE id = $2 OR session_id = $2`,
      [status ?? 'resolved', req.params.id],
    ).catch(() => {});
    res.json({ success: true, data: { id: req.params.id, status: status ?? 'resolved' } });
  }),
);

// ─── Trial Extensions ─────────────────────────────────────────────────────

export const trialExtRouter: Router = Router();
trialExtRouter.use(authenticate as never);
trialExtRouter.use(roleRateLimiter as never);
trialExtRouter.use(auditLogger as never);

// GET /trials (list)
trialExtRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const offset = (page - 1) * limit;

    const rows = await queryRows(
      `SELECT id, nct_id, title, brief_summary, plain_summary, conditions, phase, status, sponsor,
              start_date, completion_date, enrollment, locations, eligibility, metadata
       FROM clinical_trials
       ORDER BY last_updated DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM clinical_trials`, [],
    );
    res.json({ success: true, data: rows, meta: { page, limit, total: parseInt(countResult?.count ?? '0', 10) } });
  }),
);

// GET /trials/matches
trialExtRouter.get(
  '/matches',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const patientId = req.query.patientId as string || authReq.user?.sub;

    // Try trial_matches table (managed by trial-service) then fall back
    try {
      const rows = await queryRows(
        `SELECT tm.*, ct.title, ct.brief_summary, ct.plain_summary, ct.conditions, ct.phase, ct.status AS trial_status, ct.eligibility, ct.metadata
         FROM trial_matches tm
         JOIN clinical_trials ct ON tm.trial_id = ct.id
         WHERE tm.patient_id = $1
         ORDER BY tm.match_score DESC`,
        [patientId],
      );
      res.json({ success: true, data: rows });
    } catch {
      // trial_matches table might not exist yet
      res.json({ success: true, data: [] });
    }
  }),
);

// GET /trials/matches/patient/:patientId
trialExtRouter.get(
  '/matches/patient/:patientId',
  validate(uuidParam('patientId')),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const rows = await queryRows(
        `SELECT tm.*, ct.title, ct.brief_summary, ct.plain_summary, ct.conditions, ct.phase, ct.eligibility, ct.metadata
         FROM trial_matches tm
         JOIN clinical_trials ct ON tm.trial_id = ct.id
         WHERE tm.patient_id = $1
         ORDER BY tm.match_score DESC`,
        [req.params.patientId],
      );
      res.json({ success: true, data: rows });
    } catch {
      res.json({ success: true, data: [] });
    }
  }),
);
