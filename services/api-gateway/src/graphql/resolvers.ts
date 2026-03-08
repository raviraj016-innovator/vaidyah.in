/**
 * GraphQL Resolvers for the Vaidyah Healthcare Platform.
 *
 * Each resolver proxies to existing REST microservices via the proxy service,
 * preserving the circuit-breaker, retry, and timeout behaviour already in place.
 */

import { GraphQLScalarType, Kind } from 'graphql';
import { PubSub, withFilter } from 'graphql-subscriptions';
import { proxyRequest, ProxyResponse } from '../services/proxy';
import { queryOne, queryRows, query as dbQuery } from '../services/db';

// ─── PubSub (in-process for dev; replaced by AppSync in production) ─────────

export const pubsub = new PubSub();

// Subscription event names
export const EVENTS = {
  CONSULTATION_UPDATED: 'CONSULTATION_UPDATED',
  TRIAGE_ALERT: 'TRIAGE_ALERT',
  TRIAL_MATCH_NOTIFICATION: 'TRIAL_MATCH_NOTIFICATION',
  VITAL_SIGNS_UPDATED: 'VITAL_SIGNS_UPDATED',
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Make a proxy call and return the parsed body, unwrapping the standard
 * `{ success, data }` envelope used by all Vaidyah REST services.
 */
async function proxyCall<T = unknown>(
  service: string,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<T> {
  const response: ProxyResponse = await proxyRequest(service, {
    method,
    path,
    body,
    query,
  });

  if (response.statusCode >= 400) {
    const errBody = response.body as Record<string, unknown> | undefined;
    const message =
      (errBody?.error as Record<string, unknown>)?.message ??
      `Upstream ${service} returned ${response.statusCode}`;
    throw new Error(String(message));
  }

  // Unwrap the standard `{ success, data }` envelope
  const envelope = response.body as Record<string, unknown> | undefined;
  if (envelope && typeof envelope === 'object' && 'data' in envelope) {
    return envelope.data as T;
  }
  return response.body as T;
}

function pageInfo(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  };
}

function paginationQuery(args: { page?: number; limit?: number }): { page: number; limit: number; offset: number } {
  const page = Math.max(args.page ?? 1, 1);
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

// ── Enum mapping helpers ────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

function toDbStatus(gqlStatus: string | undefined): string | undefined {
  if (!gqlStatus) return undefined;
  return STATUS_MAP[gqlStatus] ?? gqlStatus.toLowerCase();
}

// ─── Custom Scalars ──────────────────────────────────────────────────────────

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time string',
  serialize(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    throw new Error('DateTime must be a Date instance or ISO string');
  },
  parseValue(value: unknown): string {
    if (typeof value !== 'string') throw new Error('DateTime must be an ISO string');
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new Error('Invalid DateTime');
    return d.toISOString();
  },
  parseLiteral(ast): string {
    if (ast.kind === Kind.STRING) {
      const d = new Date(ast.value);
      if (isNaN(d.getTime())) throw new Error('Invalid DateTime literal');
      return d.toISOString();
    }
    throw new Error('DateTime must be a string');
  },
});

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value: unknown) { return value; },
  parseValue(value: unknown) { return value; },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      try { return JSON.parse(ast.value); } catch { return ast.value; }
    }
    if (ast.kind === Kind.INT) return parseInt(ast.value, 10);
    if (ast.kind === Kind.FLOAT) return parseFloat(ast.value);
    if (ast.kind === Kind.BOOLEAN) return ast.value;
    if (ast.kind === Kind.NULL) return null;
    return undefined;
  },
});

// ─── Resolvers ───────────────────────────────────────────────────────────────

export const resolvers = {
  // Custom scalars
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  // ── Queries ──────────────────────────────────────────────────────────────

  Query: {
    // -- Consultation queries --

    async consultation(_: unknown, { id }: { id: string }) {
      const row = await queryOne(
        `SELECT
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM consultation_sessions WHERE id = $1`,
        [id],
      );
      return row ?? null;
    },

    async consultations(
      _: unknown,
      args: { patientId?: string; nurseId?: string; status?: string; page?: number; limit?: number },
    ) {
      const { page, limit, offset } = paginationQuery(args);
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (args.patientId) { conditions.push(`patient_id = $${idx++}`); params.push(args.patientId); }
      if (args.nurseId) { conditions.push(`nurse_id = $${idx++}`); params.push(args.nurseId); }
      if (args.status) { conditions.push(`status = $${idx++}`); params.push(toDbStatus(args.status)); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM consultation_sessions ${where}`,
        params,
      );
      const total = parseInt(countResult?.count ?? '0', 10);

      const items = await queryRows(
        `SELECT
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM consultation_sessions ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },

    async consultationsByFacility(
      _: unknown,
      args: { facilityId: string; status?: string; page?: number; limit?: number },
    ) {
      const { page, limit, offset } = paginationQuery(args);
      const conditions: string[] = ['facility_id = $1'];
      const params: unknown[] = [args.facilityId];
      let idx = 2;

      if (args.status) { conditions.push(`status = $${idx++}`); params.push(toDbStatus(args.status)); }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM consultation_sessions ${where}`,
        params,
      );
      const total = parseInt(countResult?.count ?? '0', 10);

      const items = await queryRows(
        `SELECT
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM consultation_sessions ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      );

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },

    // -- Patient queries --

    async patient(_: unknown, { id }: { id: string }) {
      const row = await queryOne(
        `SELECT
           id, abdm_id AS "abdmId", name, phone,
           date_of_birth AS "dateOfBirth", gender, address, district, state, pincode,
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM patients WHERE id = $1`,
        [id],
      );
      return row ?? null;
    },

    async patients(_: unknown, args: { page?: number; limit?: number }) {
      const { page, limit, offset } = paginationQuery(args);

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM patients`,
      );
      const total = parseInt(countResult?.count ?? '0', 10);

      const items = await queryRows(
        `SELECT
           id, abdm_id AS "abdmId", name, phone,
           date_of_birth AS "dateOfBirth", gender, address, district, state, pincode,
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM patients ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },

    async patientByAbdmId(_: unknown, { abdmId }: { abdmId: string }) {
      const row = await queryOne(
        `SELECT
           id, abdm_id AS "abdmId", name, phone,
           date_of_birth AS "dateOfBirth", gender, address, district, state, pincode,
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM patients WHERE abdm_id = $1`,
        [abdmId],
      );
      return row ?? null;
    },

    async patientHistory(
      _: unknown,
      args: { patientId: string; page?: number; limit?: number },
    ) {
      const { page, limit, offset } = paginationQuery(args);

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM consultation_sessions WHERE patient_id = $1`,
        [args.patientId],
      );
      const total = parseInt(countResult?.count ?? '0', 10);

      const items = await queryRows(
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
        [args.patientId, limit, offset],
      );

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },

    // -- Triage queries --

    async triageResult(_: unknown, { sessionId }: { sessionId: string }) {
      return proxyCall('clinical', 'GET', `/api/v1/triage/${sessionId}`);
    },

    // -- Clinical trial queries --

    async trialSearch(
      _: unknown,
      { input }: { input: { condition?: string; location?: string; phase?: string; status?: string; page?: number; limit?: number } },
    ) {
      const query: Record<string, string> = {};
      if (input.condition) query.condition = input.condition;
      if (input.location) query.location = input.location;
      if (input.phase) query.phase = input.phase;
      if (input.status) query.status = input.status;
      if (input.page) query.page = String(input.page);
      if (input.limit) query.limit = String(input.limit);

      const data = await proxyCall<{ trials?: unknown[]; total?: number }>(
        'trial', 'GET', '/api/v1/trials/search', undefined, query,
      );

      const items = Array.isArray(data) ? data : (data?.trials ?? []);
      const total = typeof data === 'object' && data && 'total' in data ? Number(data.total) : items.length;
      const page = input.page ?? 1;
      const limit = input.limit ?? 20;

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },

    async trial(_: unknown, { id }: { id: string }) {
      return proxyCall('trial', 'GET', `/api/v1/trials/${id}`);
    },

    async trialMatches(
      _: unknown,
      { input }: { input: { patientId: string; conditions?: string[]; medications?: string[]; page?: number; limit?: number } },
    ) {
      const data = await proxyCall<{ matches?: unknown[]; total?: number }>(
        'trial', 'POST', '/api/v1/trials/match', {
          patientId: input.patientId,
          conditions: input.conditions,
          medications: input.medications,
        },
      );

      const items = Array.isArray(data) ? data : (data?.matches ?? []);
      const total = typeof data === 'object' && data && 'total' in data ? Number(data.total) : items.length;
      const page = input.page ?? 1;
      const limit = input.limit ?? 20;

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },

    // -- Vitals --

    async sessionVitals(_: unknown, { sessionId }: { sessionId: string }) {
      const rows = await queryRows(
        `SELECT
           id, session_id AS "sessionId",
           heart_rate AS "heartRate", systolic_bp AS "systolicBp", diastolic_bp AS "diastolicBp",
           temperature, sp_o2 AS "spO2", respiratory_rate AS "respiratoryRate",
           blood_glucose AS "bloodGlucose", weight, height,
           recorded_at AS "recordedAt"
         FROM session_vitals WHERE session_id = $1 ORDER BY recorded_at DESC`,
        [sessionId],
      );
      return rows;
    },

    // -- Emergency --

    async activeAlerts(_: unknown, { facilityId }: { facilityId?: string }) {
      if (facilityId) {
        return queryRows(
          `SELECT
             ea.id, ea.session_id AS "sessionId", ea.patient_id AS "patientId",
             ea.alert_type AS "alertType", ea.severity,
             ea.latitude, ea.longitude, ea.address,
             ea.status, ea.created_at AS "createdAt"
           FROM emergency_alerts ea
           JOIN consultation_sessions cs ON ea.session_id = cs.id
           WHERE ea.status = 'active' AND cs.facility_id = $1
           ORDER BY ea.created_at DESC`,
          [facilityId],
        );
      }
      return queryRows(
        `SELECT
           id, session_id AS "sessionId", patient_id AS "patientId",
           alert_type AS "alertType", severity,
           latitude, longitude, address,
           status, created_at AS "createdAt"
         FROM emergency_alerts
         WHERE status = 'active'
         ORDER BY created_at DESC`,
      );
    },
  },

  // ── Mutations ────────────────────────────────────────────────────────────

  Mutation: {
    async createConsultation(
      _: unknown,
      { input }: { input: { patientId: string; nurseId: string; facilityId: string; chiefComplaint?: string; language?: string } },
    ) {
      const { v4: uuidv4 } = await import('uuid');
      const id = uuidv4();
      const now = new Date().toISOString();

      const row = await queryOne(
        `INSERT INTO consultation_sessions
           (id, patient_id, nurse_id, facility_id, chief_complaint, language, status, started_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7, $7)
         RETURNING
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, input.patientId, input.nurseId, input.facilityId, input.chiefComplaint ?? null, input.language ?? 'en', now],
      );

      if (!row) throw new Error('Failed to create consultation session');

      pubsub.publish(EVENTS.CONSULTATION_UPDATED, {
        consultationUpdated: {
          sessionId: id,
          status: 'ACTIVE',
          triageLevel: null,
          updatedAt: now,
          updatedFields: ['status'],
        },
      });

      return row;
    },

    async updateConsultation(
      _: unknown,
      { id, input }: { id: string; input: { status?: string; doctorId?: string; chiefComplaint?: string; triageLevel?: number } },
    ) {
      const setClauses: string[] = ['updated_at = $1'];
      const params: unknown[] = [new Date().toISOString()];
      const updatedFields: string[] = [];
      let idx = 2;

      if (input.status !== undefined) {
        setClauses.push(`status = $${idx++}`);
        params.push(toDbStatus(input.status));
        updatedFields.push('status');
      }
      if (input.doctorId !== undefined) {
        setClauses.push(`doctor_id = $${idx++}`);
        params.push(input.doctorId);
        updatedFields.push('doctorId');
      }
      if (input.chiefComplaint !== undefined) {
        setClauses.push(`chief_complaint = $${idx++}`);
        params.push(input.chiefComplaint);
        updatedFields.push('chiefComplaint');
      }
      if (input.triageLevel !== undefined) {
        setClauses.push(`triage_level = $${idx++}`);
        params.push(input.triageLevel);
        updatedFields.push('triageLevel');
      }

      params.push(id);

      const row = await queryOne(
        `UPDATE consultation_sessions
         SET ${setClauses.join(', ')}
         WHERE id = $${idx}
         RETURNING
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        params,
      );

      if (!row) throw new Error('Consultation not found');

      const session = row as Record<string, unknown>;
      pubsub.publish(EVENTS.CONSULTATION_UPDATED, {
        consultationUpdated: {
          sessionId: id,
          status: String(session.status).toUpperCase(),
          triageLevel: session.triageLevel ?? null,
          updatedAt: session.updatedAt,
          updatedFields,
        },
      });

      return row;
    },

    async completeConsultation(_: unknown, { id }: { id: string }) {
      const now = new Date().toISOString();
      const row = await queryOne(
        `UPDATE consultation_sessions
         SET status = 'completed', completed_at = $1, updated_at = $1
         WHERE id = $2
         RETURNING
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [now, id],
      );

      if (!row) throw new Error('Consultation not found');

      pubsub.publish(EVENTS.CONSULTATION_UPDATED, {
        consultationUpdated: {
          sessionId: id,
          status: 'COMPLETED',
          triageLevel: (row as Record<string, unknown>).triageLevel ?? null,
          updatedAt: now,
          updatedFields: ['status', 'completedAt'],
        },
      });

      return row;
    },

    async cancelConsultation(_: unknown, { id }: { id: string }) {
      const now = new Date().toISOString();
      const row = await queryOne(
        `UPDATE consultation_sessions
         SET status = 'cancelled', updated_at = $1
         WHERE id = $2
         RETURNING
           id, patient_id AS "patientId", nurse_id AS "nurseId", doctor_id AS "doctorId",
           facility_id AS "facilityId", status, chief_complaint AS "chiefComplaint",
           language, triage_level AS "triageLevel",
           started_at AS "startedAt", completed_at AS "completedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [now, id],
      );

      if (!row) throw new Error('Consultation not found');

      pubsub.publish(EVENTS.CONSULTATION_UPDATED, {
        consultationUpdated: {
          sessionId: id,
          status: 'CANCELLED',
          triageLevel: (row as Record<string, unknown>).triageLevel ?? null,
          updatedAt: now,
          updatedFields: ['status'],
        },
      });

      return row;
    },

    // -- Patients --

    async createPatient(
      _: unknown,
      { input }: { input: Record<string, unknown> },
    ) {
      const { v4: uuidv4 } = await import('uuid');
      const id = uuidv4();
      const now = new Date().toISOString();

      const row = await queryOne(
        `INSERT INTO patients
           (id, name, phone, abdm_id, date_of_birth, gender, address, district, state, pincode, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
         RETURNING
           id, abdm_id AS "abdmId", name, phone,
           date_of_birth AS "dateOfBirth", gender, address, district, state, pincode,
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          id, input.name, input.phone, input.abdmId ?? null,
          input.dateOfBirth ?? null, input.gender ? String(input.gender).toLowerCase() : null,
          input.address ?? null, input.district ?? null, input.state ?? null, input.pincode ?? null,
          now,
        ],
      );

      if (!row) throw new Error('Failed to create patient');
      return row;
    },

    async updatePatient(
      _: unknown,
      { id, input }: { id: string; input: Record<string, unknown> },
    ) {
      const setClauses: string[] = ['updated_at = $1'];
      const params: unknown[] = [new Date().toISOString()];
      let idx = 2;

      const fieldMap: Record<string, string> = {
        name: 'name', phone: 'phone', abdmId: 'abdm_id',
        dateOfBirth: 'date_of_birth', gender: 'gender', address: 'address',
        district: 'district', state: 'state', pincode: 'pincode',
      };

      for (const [gqlField, dbCol] of Object.entries(fieldMap)) {
        if (input[gqlField] !== undefined) {
          const value = gqlField === 'gender' ? String(input[gqlField]).toLowerCase() : input[gqlField];
          setClauses.push(`${dbCol} = $${idx++}`);
          params.push(value);
        }
      }

      params.push(id);

      const row = await queryOne(
        `UPDATE patients
         SET ${setClauses.join(', ')}
         WHERE id = $${idx}
         RETURNING
           id, abdm_id AS "abdmId", name, phone,
           date_of_birth AS "dateOfBirth", gender, address, district, state, pincode,
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        params,
      );

      if (!row) throw new Error('Patient not found');
      return row;
    },

    // -- Vitals --

    async recordVitals(
      _: unknown,
      { sessionId, input }: { sessionId: string; input: Record<string, unknown> },
    ) {
      const { v4: uuidv4 } = await import('uuid');
      const vitalsId = uuidv4();
      const now = new Date().toISOString();

      // Verify session exists
      const session = await queryOne<{ id: string; patient_id: string }>(
        `SELECT id, patient_id FROM consultation_sessions WHERE id = $1`,
        [sessionId],
      );
      if (!session) throw new Error('Session not found');

      await dbQuery(
        `INSERT INTO session_vitals
           (id, session_id, heart_rate, systolic_bp, diastolic_bp, temperature,
            sp_o2, respiratory_rate, blood_glucose, weight, height, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          vitalsId, sessionId,
          input.heartRate ?? null, input.systolicBp ?? null, input.diastolicBp ?? null,
          input.temperature ?? null, input.spO2 ?? null, input.respiratoryRate ?? null,
          input.bloodGlucose ?? null, input.weight ?? null, input.height ?? null,
          now,
        ],
      );

      const vitals = {
        id: vitalsId,
        sessionId,
        heartRate: input.heartRate ?? null,
        systolicBp: input.systolicBp ?? null,
        diastolicBp: input.diastolicBp ?? null,
        temperature: input.temperature ?? null,
        spO2: input.spO2 ?? null,
        respiratoryRate: input.respiratoryRate ?? null,
        bloodGlucose: input.bloodGlucose ?? null,
        weight: input.weight ?? null,
        height: input.height ?? null,
        recordedAt: now,
      };

      // Publish real-time vital signs event
      pubsub.publish(EVENTS.VITAL_SIGNS_UPDATED, {
        vitalSignsUpdated: {
          sessionId,
          patientId: (session as Record<string, unknown>).patient_id,
          heartRate: vitals.heartRate,
          systolicBp: vitals.systolicBp,
          diastolicBp: vitals.diastolicBp,
          temperature: vitals.temperature,
          spO2: vitals.spO2,
          respiratoryRate: vitals.respiratoryRate,
          recordedAt: now,
        },
      });

      return vitals;
    },

    // -- Triage --

    async runTriage(_: unknown, { sessionId }: { sessionId: string }) {
      const result = await proxyCall<Record<string, unknown>>(
        'clinical', 'POST', `/api/v1/triage/${sessionId}`,
      );

      // If triage returned critical/urgent, publish alert
      const level = typeof result?.level === 'number' ? result.level : undefined;
      if (level !== undefined && level <= 2) {
        const session = await queryOne<{ patient_id: string; facility_id: string }>(
          `SELECT patient_id, facility_id FROM consultation_sessions WHERE id = $1`,
          [sessionId],
        );

        if (session) {
          pubsub.publish(EVENTS.TRIAGE_ALERT, {
            triageAlert: {
              sessionId,
              patientId: (session as Record<string, unknown>).patient_id,
              level,
              label: result.label ?? (level === 1 ? 'Emergent' : 'Urgent'),
              confidence: result.confidence ?? 0,
              assessedAt: result.assessedAt ?? new Date().toISOString(),
              facilityId: (session as Record<string, unknown>).facility_id,
            },
          });
        }
      }

      return result;
    },

    // -- SOAP summary --

    async generateSOAPSummary(_: unknown, { sessionId }: { sessionId: string }) {
      return proxyCall('clinical', 'POST', `/api/v1/sessions/${sessionId}/summary`);
    },

    // -- Emergency --

    async createEmergencyAlert(
      _: unknown,
      { input }: { input: Record<string, unknown> },
    ) {
      const { v4: uuidv4 } = await import('uuid');
      const alertId = uuidv4();
      const now = new Date().toISOString();
      const location = input.location as Record<string, unknown>;

      await dbQuery(
        `INSERT INTO emergency_alerts
           (id, session_id, patient_id, alert_type, severity, latitude, longitude, address, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)`,
        [
          alertId, input.sessionId ?? null, input.patientId,
          String(input.alertType).toLowerCase(), String(input.severity).toLowerCase(),
          location.latitude, location.longitude, location.address ?? null,
          now,
        ],
      );

      // Also forward to clinical service for processing
      try {
        await proxyCall('clinical', 'POST', '/api/v1/emergency/alert', {
          ...input,
          alertId,
          alertType: String(input.alertType).toLowerCase(),
          severity: String(input.severity).toLowerCase(),
        });
      } catch (err) {
        console.warn('[GraphQL] Emergency alert saved but clinical service notification failed:', (err as Error).message);
      }

      return {
        id: alertId,
        sessionId: input.sessionId ?? null,
        patientId: input.patientId,
        alertType: input.alertType,
        severity: input.severity,
        location,
        status: 'ACTIVE',
        createdAt: now,
      };
    },

    async resolveEmergencyAlert(_: unknown, { id }: { id: string }) {
      const row = await queryOne(
        `UPDATE emergency_alerts
         SET status = 'resolved'
         WHERE id = $1
         RETURNING
           id, session_id AS "sessionId", patient_id AS "patientId",
           alert_type AS "alertType", severity,
           latitude, longitude, address,
           status, created_at AS "createdAt"`,
        [id],
      );

      if (!row) throw new Error('Emergency alert not found');
      return row;
    },

    // -- Trial matching --

    async requestTrialMatch(_: unknown, { patientId }: { patientId: string }) {
      const matches = await proxyCall<unknown[]>(
        'trial', 'POST', '/api/v1/trials/match', { patientId },
      );

      const items = Array.isArray(matches) ? matches : [];

      // Publish notifications for high-confidence matches
      for (const match of items) {
        const m = match as Record<string, unknown>;
        if (typeof m.matchScore === 'number' && m.matchScore >= 0.7) {
          pubsub.publish(EVENTS.TRIAL_MATCH_NOTIFICATION, {
            trialMatchNotification: {
              patientId,
              trialId: m.trialId,
              trialTitle: m.trialTitle ?? 'Clinical Trial',
              matchScore: m.matchScore,
              matchedAt: m.matchedAt ?? new Date().toISOString(),
            },
          });
        }
      }

      return items;
    },
  },

  // ── Nested Resolvers ─────────────────────────────────────────────────────

  ConsultationSession: {
    async patient(session: Record<string, unknown>) {
      if (!session.patientId) return null;
      return queryOne(
        `SELECT
           id, abdm_id AS "abdmId", name, phone,
           date_of_birth AS "dateOfBirth", gender, address, district, state, pincode,
           created_at AS "createdAt", updated_at AS "updatedAt"
         FROM patients WHERE id = $1`,
        [session.patientId],
      );
    },

    async vitals(session: Record<string, unknown>) {
      return queryRows(
        `SELECT
           id, session_id AS "sessionId",
           heart_rate AS "heartRate", systolic_bp AS "systolicBp", diastolic_bp AS "diastolicBp",
           temperature, sp_o2 AS "spO2", respiratory_rate AS "respiratoryRate",
           blood_glucose AS "bloodGlucose", weight, height,
           recorded_at AS "recordedAt"
         FROM session_vitals WHERE session_id = $1 ORDER BY recorded_at DESC`,
        [session.id],
      );
    },

    async triageResult(session: Record<string, unknown>) {
      try {
        return await proxyCall('clinical', 'GET', `/api/v1/triage/${session.id}`);
      } catch {
        return null;
      }
    },

    async soapSummary(session: Record<string, unknown>) {
      try {
        return await proxyCall('clinical', 'GET', `/api/v1/sessions/${session.id}/summary`);
      } catch {
        return null;
      }
    },
  },

  Patient: {
    async sessions(patient: Record<string, unknown>, args: { page?: number; limit?: number }) {
      const { page, limit, offset } = paginationQuery(args);

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM consultation_sessions WHERE patient_id = $1`,
        [patient.id],
      );
      const total = parseInt(countResult?.count ?? '0', 10);

      const items = await queryRows(
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
        [patient.id, limit, offset],
      );

      return { items, totalCount: total, pageInfo: pageInfo(page, limit, total) };
    },
  },

  EmergencyAlert: {
    location(alert: Record<string, unknown>) {
      return {
        latitude: alert.latitude,
        longitude: alert.longitude,
        address: alert.address ?? null,
      };
    },
  },

  // ── Subscriptions ────────────────────────────────────────────────────────

  Subscription: {
    consultationUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.CONSULTATION_UPDATED]),
        (
          payload: { consultationUpdated: Record<string, unknown> },
          variables: { sessionId?: string; facilityId?: string },
        ) => {
          if (variables.sessionId && payload.consultationUpdated.sessionId !== variables.sessionId) {
            return false;
          }
          if (variables.facilityId && payload.consultationUpdated.facilityId !== variables.facilityId) {
            return false;
          }
          return true;
        },
      ),
    },

    triageAlert: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.TRIAGE_ALERT]),
        (
          payload: { triageAlert: Record<string, unknown> },
          variables: { facilityId?: string },
        ) => {
          if (variables.facilityId && payload.triageAlert.facilityId !== variables.facilityId) {
            return false;
          }
          return true;
        },
      ),
    },

    trialMatchNotification: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.TRIAL_MATCH_NOTIFICATION]),
        (
          payload: { trialMatchNotification: Record<string, unknown> },
          variables: { patientId: string },
        ) => {
          return payload.trialMatchNotification.patientId === variables.patientId;
        },
      ),
    },

    vitalSignsUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([EVENTS.VITAL_SIGNS_UPDATED]),
        (
          payload: { vitalSignsUpdated: Record<string, unknown> },
          variables: { sessionId: string },
        ) => {
          return payload.vitalSignsUpdated.sessionId === variables.sessionId;
        },
      ),
    },
  },
};
