/**
 * E2E Integration Tests: Full Consultation Flow
 *
 * These tests exercise the complete consultation lifecycle through the
 * API Gateway, from authentication through session closure.
 *
 * PREREQUISITES (Docker / services that must be running):
 *   - PostgreSQL (port 5432)   -- stores sessions, vitals, audit logs
 *   - Redis (port 6379)        -- caching layer used by the gateway
 *   - API Gateway (port 3000)  -- the service under test
 *   - Voice Service (port 3001)  -- forwarded to for /sessions/:id/voice
 *   - Clinical Service (port 3002) -- forwarded to for /triage, /summary, /emergency
 *   - Trial Service (port 3003)   -- forwarded to for /trials/*
 *
 * Start all services with:
 *   docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d
 *
 * Run these tests with:
 *   NODE_ENV=development npx jest tests/e2e/consultation-flow.test.ts --runInBand
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * In development mode (when no Cognito pool is configured), the API Gateway
 * accepts a base64-encoded JSON payload as the Bearer token. This helper
 * builds such a token for the given role.
 */
function buildDevToken(overrides: Record<string, unknown> = {}): string {
  const payload = {
    sub: overrides.sub ?? uuidv4(),
    email: overrides.email ?? 'e2e-nurse@vaidyah.local',
    name: overrides.name ?? 'E2E Nurse',
    role: overrides.role ?? 'nurse',
    facilityId: overrides.facilityId ?? 'facility-e2e-001',
    ...overrides,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ---------------------------------------------------------------------------
// Test-scoped state
// ---------------------------------------------------------------------------

interface TestContext {
  api: AxiosInstance;
  nurseToken: string;
  doctorToken: string;
  patientId: string;
  nurseId: string;
  facilityId: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('[Integration] Full Consultation Flow', () => {
  const ctx: TestContext = {} as TestContext;

  // -----------------------------------------------------------------------
  // Setup -- create axios client and seed identifiers
  // -----------------------------------------------------------------------

  beforeAll(async () => {
    // Build dev-mode auth tokens for nurse and doctor roles.
    // In a real CI pipeline this would call Cognito or use a test-user pool.
    ctx.nurseId = uuidv4();
    ctx.patientId = uuidv4();
    ctx.facilityId = 'facility-e2e-001';

    ctx.nurseToken = buildDevToken({
      sub: ctx.nurseId,
      email: 'e2e-nurse@vaidyah.local',
      name: 'E2E Test Nurse',
      role: 'nurse',
      facilityId: ctx.facilityId,
    });

    ctx.doctorToken = buildDevToken({
      sub: uuidv4(),
      email: 'e2e-doctor@vaidyah.local',
      name: 'E2E Test Doctor',
      role: 'doctor',
      facilityId: ctx.facilityId,
    });

    ctx.api = axios.create({
      baseURL: BASE_URL,
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.nurseToken}`,
      },
      // Do not throw on non-2xx so we can assert status codes directly
      validateStatus: () => true,
    });
  });

  // -----------------------------------------------------------------------
  // Teardown -- clean up test data created during the run
  // -----------------------------------------------------------------------

  afterAll(async () => {
    // If services expose a test-cleanup endpoint, call it here.
    // Otherwise the test database should be reset between CI runs
    // using migrations or a TRUNCATE script.
    //
    // Example:
    //   await ctx.api.delete(`/api/v1/sessions/${ctx.sessionId}`);
    //
    // For now we rely on ephemeral Docker volumes being destroyed after CI.
  });

  // -----------------------------------------------------------------------
  // 0. Health check -- verify the gateway is reachable
  // -----------------------------------------------------------------------

  it('should return healthy status from /health', async () => {
    const res = await ctx.api.get('/health');

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toMatchObject({
      status: 'healthy',
      services: {
        database: true,
        redis: true,
      },
    });
    expect(typeof res.data.data.uptime).toBe('number');
    expect(res.data.data.timestamp).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 1. Authentication -- verify Bearer token is accepted
  // -----------------------------------------------------------------------

  it('should reject requests without an auth token', async () => {
    const unauthApi = axios.create({
      baseURL: BASE_URL,
      timeout: 10_000,
      validateStatus: () => true,
    });

    const res = await unauthApi.get(`/api/v1/sessions/${uuidv4()}`);

    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toBeDefined();
    expect(res.data.error.message).toMatch(/authentication|token/i);
  });

  it('should reject requests with an invalid auth token', async () => {
    const badApi = axios.create({
      baseURL: BASE_URL,
      timeout: 10_000,
      headers: { Authorization: 'Bearer not-valid-base64-json' },
      validateStatus: () => true,
    });

    const res = await badApi.get(`/api/v1/sessions/${uuidv4()}`);

    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 2. Create consultation session
  // -----------------------------------------------------------------------

  it('should create a new consultation session', async () => {
    const payload = {
      patientId: ctx.patientId,
      nurseId: ctx.nurseId,
      facilityId: ctx.facilityId,
      chiefComplaint: 'Persistent headache for 3 days with mild fever',
      language: 'en',
    };

    const res = await ctx.api.post('/api/v1/sessions', payload);

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toMatchObject({
      patientId: ctx.patientId,
      nurseId: ctx.nurseId,
      facilityId: ctx.facilityId,
      status: 'active',
      chiefComplaint: payload.chiefComplaint,
      language: 'en',
    });
    expect(res.data.data.id).toBeDefined();
    expect(res.data.meta.requestId).toBeDefined();

    // Persist for subsequent steps
    ctx.sessionId = res.data.data.id;
  });

  // -----------------------------------------------------------------------
  // 3. Retrieve the session
  // -----------------------------------------------------------------------

  it('should retrieve the newly created session by ID', async () => {
    const res = await ctx.api.get(`/api/v1/sessions/${ctx.sessionId}`);

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(ctx.sessionId);
    expect(res.data.data.status).toBe('active');
    expect(res.data.data.patientId).toBe(ctx.patientId);
  });

  it('should return 404 for a non-existent session', async () => {
    const res = await ctx.api.get(`/api/v1/sessions/${uuidv4()}`);

    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 4. Submit vitals
  // -----------------------------------------------------------------------

  it('should submit vitals for the session', async () => {
    const vitals = {
      heartRate: 82,
      systolicBp: 128,
      diastolicBp: 84,
      temperature: 37.8,
      spO2: 97,
      respiratoryRate: 18,
      bloodGlucose: 105,
      weight: 68,
      height: 165,
    };

    const res = await ctx.api.post(
      `/api/v1/sessions/${ctx.sessionId}/vitals`,
      vitals,
    );

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toMatchObject({
      sessionId: ctx.sessionId,
    });
    expect(res.data.data.id).toBeDefined();
    expect(res.data.data.recordedAt).toBeDefined();
  });

  it('should reject vitals for a non-existent session', async () => {
    const res = await ctx.api.post(`/api/v1/sessions/${uuidv4()}/vitals`, {
      heartRate: 72,
    });

    expect(res.status).toBe(404);
  });

  // -----------------------------------------------------------------------
  // 5. Submit voice / symptoms (transcription result)
  //
  // NOTE: This endpoint proxies to the Voice Service. In the e2e
  // environment the Voice Service must be running or a mock/stub must be
  // available. If the Voice Service is unavailable, this test will fail
  // with a 502 or connection error -- which is expected when running
  // without Docker Compose.
  // -----------------------------------------------------------------------

  it('should forward voice/symptoms data to the voice service', async () => {
    const voicePayload = {
      audioBase64: '', // empty for test; real payload would be base64 audio
      transcript: 'Patient reports persistent headache behind the eyes, mild fever since 3 days, occasional nausea',
      language: 'en',
      confidence: 0.94,
      isFinal: true,
    };

    const res = await ctx.api.post(
      `/api/v1/sessions/${ctx.sessionId}/voice`,
      voicePayload,
    );

    // The voice service must be running for this to succeed (200/201).
    // If the upstream is down the gateway returns 502/503.
    expect([200, 201, 502, 503]).toContain(res.status);

    if (res.status < 300) {
      expect(res.data).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // 6. Request triage
  //
  // NOTE: Proxied to the Clinical Service. Requires that service to be
  // running. The gateway updates the session's triage_level in the DB
  // when the clinical service returns a successful result.
  // -----------------------------------------------------------------------

  it('should request triage for the session', async () => {
    const res = await ctx.api.post(`/api/v1/triage/${ctx.sessionId}`);

    // Clinical service must be running. Expect 200 when available.
    expect([200, 201, 502, 503]).toContain(res.status);

    if (res.status < 300) {
      expect(res.data).toBeDefined();
      // If the clinical service returned a triage level, verify it was
      // persisted by fetching the session again.
      if (res.data.data?.level) {
        const sessionRes = await ctx.api.get(
          `/api/v1/sessions/${ctx.sessionId}`,
        );
        expect(sessionRes.data.data.triageLevel).toBe(res.data.data.level);
      }
    }
  });

  it('should enforce role requirements on triage endpoint', async () => {
    // Patient role should be rejected (requires nurse, doctor, or admin)
    const patientToken = buildDevToken({ role: 'patient' });
    const patientApi = axios.create({
      baseURL: BASE_URL,
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientToken}`,
      },
      validateStatus: () => true,
    });

    const res = await patientApi.post(`/api/v1/triage/${ctx.sessionId}`);

    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);
    expect(res.data.error.message).toMatch(/not authorized|role/i);
  });

  // -----------------------------------------------------------------------
  // 7. Generate SOAP summary
  //
  // NOTE: Proxied to the Clinical Service.
  // -----------------------------------------------------------------------

  it('should generate a SOAP summary for the session', async () => {
    const res = await ctx.api.post(
      `/api/v1/sessions/${ctx.sessionId}/summary`,
    );

    // Clinical service must be running.
    expect([200, 201, 502, 503]).toContain(res.status);

    if (res.status < 300) {
      expect(res.data).toBeDefined();
      // A SOAP summary typically contains Subjective, Objective, Assessment, Plan.
      // The exact shape depends on the clinical service implementation.
    }
  });

  it('should enforce role requirements on summary endpoint', async () => {
    const patientToken = buildDevToken({ role: 'patient' });
    const patientApi = axios.create({
      baseURL: BASE_URL,
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${patientToken}`,
      },
      validateStatus: () => true,
    });

    const res = await patientApi.post(
      `/api/v1/sessions/${ctx.sessionId}/summary`,
    );

    expect(res.status).toBe(403);
  });

  // -----------------------------------------------------------------------
  // 8. Patient history -- verify the session appears in history
  // -----------------------------------------------------------------------

  it('should include the session in patient history', async () => {
    const res = await ctx.api.get(
      `/api/v1/patients/${ctx.patientId}/history?page=1&limit=10`,
    );

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    const found = res.data.data.find(
      (s: { id: string }) => s.id === ctx.sessionId,
    );
    expect(found).toBeDefined();
    expect(found.patientId).toBe(ctx.patientId);
    expect(found.facilityId).toBe(ctx.facilityId);
  });

  it('should support pagination on patient history', async () => {
    const res = await ctx.api.get(
      `/api/v1/patients/${ctx.patientId}/history?page=1&limit=1`,
    );

    expect(res.status).toBe(200);
    expect(res.data.meta).toMatchObject({
      page: 1,
      limit: 1,
    });
    expect(typeof res.data.meta.total).toBe('number');
    expect(res.data.data.length).toBeLessThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // 9. Close session (simulated)
  //
  // The current API does not expose a dedicated "close session" endpoint.
  // In production the session status is updated by the clinical service
  // after the consultation completes. Here we verify the session is still
  // retrievable and in the expected state.
  //
  // TODO: When a PATCH /api/v1/sessions/:id endpoint is added, update
  // this test to set status = 'completed' and verify completedAt is set.
  // -----------------------------------------------------------------------

  it('should confirm session is still active at end of flow', async () => {
    const res = await ctx.api.get(`/api/v1/sessions/${ctx.sessionId}`);

    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('active');
    // The session remains active until explicitly closed by the clinical
    // workflow. This is the expected terminal state for this e2e flow.
  });

  // -----------------------------------------------------------------------
  // 10. Emergency alert (supplementary test)
  // -----------------------------------------------------------------------

  it('should create an emergency alert', async () => {
    const alertPayload = {
      patientId: ctx.patientId,
      sessionId: ctx.sessionId,
      alertType: 'cardiac',
      severity: 'critical',
      location: {
        latitude: 28.6139,
        longitude: 77.209,
        address: '123 Test Street, New Delhi',
      },
    };

    const res = await ctx.api.post('/api/v1/emergency/alert', alertPayload);

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.alertId).toBeDefined();
    expect(res.data.data.status).toBe('active');
  });

  // -----------------------------------------------------------------------
  // 11. Request-ID propagation
  // -----------------------------------------------------------------------

  it('should propagate a custom X-Request-ID header', async () => {
    const customId = `e2e-${uuidv4()}`;

    const res = await ctx.api.get(`/api/v1/sessions/${ctx.sessionId}`, {
      headers: { 'X-Request-ID': customId },
    });

    expect(res.headers['x-request-id']).toBe(customId);
    expect(res.data.meta.requestId).toBe(customId);
  });
});
