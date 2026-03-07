/**
 * k6 Load Test: Vaidyah API Gateway
 *
 * Simulates realistic consultation traffic against the API Gateway,
 * covering health checks, authentication, and the full consultation
 * lifecycle (session creation, vitals, symptoms, triage).
 *
 * PREREQUISITES:
 *   All backend services must be running (Docker Compose recommended):
 *     - API Gateway (port 3000)
 *     - PostgreSQL, Redis
 *     - Voice Service, Clinical Service (for upstream proxied calls)
 *
 * Run:
 *   k6 run tests/load/k6-load-test.js
 *
 * Run with custom base URL:
 *   k6 run -e BASE_URL=http://staging-api.vaidyah.in tests/load/k6-load-test.js
 *
 * Run with InfluxDB output for Grafana dashboards:
 *   k6 run --out influxdb=http://localhost:8086/k6 tests/load/k6-load-test.js
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import encoding from 'k6/encoding';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const triageLatency = new Trend('triage_latency', true);
const sessionCreateLatency = new Trend('session_create_latency', true);
const vitalsSubmitLatency = new Trend('vitals_submit_latency', true);
const summaryLatency = new Trend('summary_latency', true);
const consultationErrors = new Rate('consultation_error_rate');
const completedConsultations = new Counter('completed_consultations');

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const options = {
  // Ramp from 1 to 50 VUs over 2 minutes, sustain for 3 minutes, ramp down
  stages: [
    { duration: '30s', target: 10 },   // warm-up
    { duration: '90s', target: 50 },   // ramp to peak
    { duration: '3m',  target: 50 },   // sustain peak load
    { duration: '30s', target: 10 },   // begin ramp-down
    { duration: '30s', target: 0 },    // complete ramp-down
  ],

  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<500'],          // 95th percentile < 500ms
    http_req_failed: ['rate<0.01'],            // error rate < 1%

    // Custom thresholds per operation
    triage_latency: ['p(95)<800', 'p(99)<1500'],
    session_create_latency: ['p(95)<400'],
    vitals_submit_latency: ['p(95)<300'],
    summary_latency: ['p(95)<1000'],
    consultation_error_rate: ['rate<0.02'],    // consultation-specific error rate < 2%
  },

  // Tags for grouping in dashboards
  tags: {
    testSuite: 'vaidyah-load',
  },
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const HEADERS = {
  'Content-Type': 'application/json',
};

/**
 * Build a development-mode Bearer token (base64-encoded JSON).
 * In dev mode the API Gateway decodes this directly instead of
 * verifying against Cognito JWKS.
 */
function buildDevToken(role, name) {
  const payload = {
    sub: uuidv4(),
    email: `${role}-loadtest@vaidyah.local`,
    name: name || `Load Test ${role}`,
    role: role,
    facilityId: 'facility-load-001',
  };
  return encoding.b64encode(JSON.stringify(payload));
}

/**
 * Returns request headers with a valid auth token for the given role.
 */
function authHeaders(role) {
  const token = buildDevToken(role);
  return Object.assign({}, HEADERS, {
    Authorization: `Bearer ${token}`,
  });
}

// ---------------------------------------------------------------------------
// Scenario: Health Check (smoke test)
// ---------------------------------------------------------------------------

function healthCheck() {
  group('Health Check', function () {
    const res = http.get(`${BASE_URL}/health`);

    check(res, {
      'health: status is 200': (r) => r.status === 200,
      'health: response has success=true': (r) => {
        try {
          return r.json().success === true;
        } catch (_) {
          return false;
        }
      },
      'health: database is healthy': (r) => {
        try {
          return r.json().data.services.database === true;
        } catch (_) {
          return false;
        }
      },
      'health: redis is healthy': (r) => {
        try {
          return r.json().data.services.redis === true;
        } catch (_) {
          return false;
        }
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Scenario: Login Flow (authentication validation)
// ---------------------------------------------------------------------------

function loginFlow() {
  group('Login Flow', function () {
    const headers = authHeaders('nurse');

    // Authenticated request that should succeed
    const res = http.get(`${BASE_URL}/api/v1/sessions/${uuidv4()}`, {
      headers: headers,
    });

    check(res, {
      'login: authenticated request accepted (not 401)': (r) => r.status !== 401,
      // A 404 is fine here — it means auth passed but session does not exist
      'login: returns 404 for missing session': (r) => r.status === 404,
    });

    // Unauthenticated request that should be rejected
    const unauthRes = http.get(`${BASE_URL}/api/v1/sessions/${uuidv4()}`, {
      headers: HEADERS,
    });

    check(unauthRes, {
      'login: unauthenticated request rejected with 401': (r) => r.status === 401,
    });

    // Bad token should be rejected
    const badHeaders = Object.assign({}, HEADERS, {
      Authorization: 'Bearer this-is-not-valid',
    });
    const badRes = http.get(`${BASE_URL}/api/v1/sessions/${uuidv4()}`, {
      headers: badHeaders,
    });

    check(badRes, {
      'login: invalid token rejected with 401': (r) => r.status === 401,
    });
  });
}

// ---------------------------------------------------------------------------
// Scenario: Full Consultation Lifecycle
// ---------------------------------------------------------------------------

function consultationLifecycle() {
  const headers = authHeaders('nurse');
  let sessionId = null;
  let hasError = false;

  group('Consultation Lifecycle', function () {
    // ─── Step 1: Create Session ───────────────────────────────────────
    group('1. Create Session', function () {
      const payload = JSON.stringify({
        patientId: uuidv4(),
        nurseId: uuidv4(),
        facilityId: 'facility-load-001',
        chiefComplaint: 'Headache and mild fever for 2 days',
        language: 'en',
      });

      const res = http.post(`${BASE_URL}/api/v1/sessions`, payload, {
        headers: headers,
      });

      sessionCreateLatency.add(res.timings.duration);

      const created = check(res, {
        'create session: status is 201': (r) => r.status === 201,
        'create session: success is true': (r) => {
          try { return r.json().success === true; } catch (_) { return false; }
        },
        'create session: has session id': (r) => {
          try { return typeof r.json().data.id === 'string'; } catch (_) { return false; }
        },
        'create session: status is active': (r) => {
          try { return r.json().data.status === 'active'; } catch (_) { return false; }
        },
      });

      if (created) {
        try {
          sessionId = res.json().data.id;
        } catch (_) {
          hasError = true;
        }
      } else {
        hasError = true;
      }
    });

    if (!sessionId) {
      consultationErrors.add(1);
      return;
    }

    // ─── Step 2: Retrieve Session ─────────────────────────────────────
    group('2. Retrieve Session', function () {
      const res = http.get(`${BASE_URL}/api/v1/sessions/${sessionId}`, {
        headers: headers,
      });

      check(res, {
        'get session: status is 200': (r) => r.status === 200,
        'get session: id matches': (r) => {
          try { return r.json().data.id === sessionId; } catch (_) { return false; }
        },
      });
    });

    // ─── Step 3: Submit Vitals ────────────────────────────────────────
    group('3. Submit Vitals', function () {
      const vitals = JSON.stringify({
        heartRate: 72 + Math.floor(Math.random() * 20),
        systolicBp: 110 + Math.floor(Math.random() * 30),
        diastolicBp: 70 + Math.floor(Math.random() * 20),
        temperature: 36.5 + Math.random() * 2.0,
        spO2: 94 + Math.floor(Math.random() * 6),
        respiratoryRate: 14 + Math.floor(Math.random() * 8),
        bloodGlucose: 80 + Math.floor(Math.random() * 60),
        weight: 50 + Math.floor(Math.random() * 40),
        height: 150 + Math.floor(Math.random() * 35),
      });

      const res = http.post(
        `${BASE_URL}/api/v1/sessions/${sessionId}/vitals`,
        vitals,
        { headers: headers },
      );

      vitalsSubmitLatency.add(res.timings.duration);

      const ok = check(res, {
        'submit vitals: status is 201': (r) => r.status === 201,
        'submit vitals: success is true': (r) => {
          try { return r.json().success === true; } catch (_) { return false; }
        },
        'submit vitals: has vitals id': (r) => {
          try { return typeof r.json().data.id === 'string'; } catch (_) { return false; }
        },
      });

      if (!ok) {
        hasError = true;
      }
    });

    // ─── Step 4: Submit Voice / Symptoms ──────────────────────────────
    // This forwards to the Voice Service. Under load testing without the
    // Voice Service running, we expect 502/503. We still measure latency
    // of the gateway's proxy attempt.
    group('4. Submit Symptoms (Voice)', function () {
      const payload = JSON.stringify({
        transcript: 'Patient has headache behind the eyes, mild fever 37.8 degrees, nausea in the morning',
        language: 'en',
        confidence: 0.92,
        isFinal: true,
      });

      const res = http.post(
        `${BASE_URL}/api/v1/sessions/${sessionId}/voice`,
        payload,
        { headers: headers },
      );

      // Voice service may not be running — we accept 200, 201, or upstream errors
      check(res, {
        'submit symptoms: gateway responded': (r) => r.status > 0,
        'submit symptoms: not a gateway timeout': (r) => r.status !== 504,
      });
    });

    // ─── Step 5: Request Triage ───────────────────────────────────────
    // Proxied to the Clinical Service. Triage latency is a key SLO.
    group('5. Request Triage', function () {
      const res = http.post(
        `${BASE_URL}/api/v1/triage/${sessionId}`,
        null,
        { headers: headers },
      );

      triageLatency.add(res.timings.duration);

      check(res, {
        'triage: gateway responded': (r) => r.status > 0,
        'triage: not a gateway timeout': (r) => r.status !== 504,
        // When clinical service is running:
        'triage: success when service available': (r) => {
          return r.status === 200 || r.status === 201 || r.status === 502 || r.status === 503;
        },
      });
    });

    // ─── Step 6: Generate Summary ─────────────────────────────────────
    group('6. Generate SOAP Summary', function () {
      const res = http.post(
        `${BASE_URL}/api/v1/sessions/${sessionId}/summary`,
        null,
        { headers: headers },
      );

      summaryLatency.add(res.timings.duration);

      check(res, {
        'summary: gateway responded': (r) => r.status > 0,
        'summary: not a gateway timeout': (r) => r.status !== 504,
      });
    });

    // ─── Step 7: Verify Session in Patient History ────────────────────
    group('7. Verify Patient History', function () {
      // We would need the patientId from the session creation, but since
      // we used a random one we can still test the endpoint responds.
      const res = http.get(
        `${BASE_URL}/api/v1/patients/${uuidv4()}/history?page=1&limit=5`,
        { headers: headers },
      );

      check(res, {
        'history: status is 200': (r) => r.status === 200,
        'history: returns array': (r) => {
          try { return Array.isArray(r.json().data); } catch (_) { return false; }
        },
      });
    });

    // Record consultation completion
    if (!hasError) {
      completedConsultations.add(1);
    }
    consultationErrors.add(hasError ? 1 : 0);
  });
}

// ---------------------------------------------------------------------------
// Default VU Function
// ---------------------------------------------------------------------------

export default function () {
  // Each VU iteration runs through all scenarios with realistic pacing.

  // 10% of iterations: just a health check (simulates monitoring probes)
  if (Math.random() < 0.1) {
    healthCheck();
    sleep(1);
    return;
  }

  // 15% of iterations: login flow validation
  if (Math.random() < 0.15) {
    loginFlow();
    sleep(1);
    return;
  }

  // 75% of iterations: full consultation lifecycle
  consultationLifecycle();

  // Think time between consultations (1-3 seconds)
  sleep(1 + Math.random() * 2);
}

// ---------------------------------------------------------------------------
// Setup — runs once before all VUs start
// ---------------------------------------------------------------------------

export function setup() {
  // Verify the gateway is reachable before starting the load test
  const res = http.get(`${BASE_URL}/health`);

  if (res.status !== 200) {
    fail(
      `API Gateway health check failed (status ${res.status}). ` +
      `Ensure services are running at ${BASE_URL}`
    );
  }

  console.log(`Load test starting against ${BASE_URL}`);
  console.log(`Health check passed: ${res.json().data.status}`);

  return {
    baseUrl: BASE_URL,
    startTime: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Teardown — runs once after all VUs complete
// ---------------------------------------------------------------------------

export function teardown(data) {
  console.log(`Load test completed. Started at: ${data.startTime}`);
  console.log(`Finished at: ${new Date().toISOString()}`);

  // Optionally hit health check one last time to confirm stability
  const res = http.get(`${data.baseUrl}/health`);
  console.log(`Post-test health status: ${res.status}`);
}
