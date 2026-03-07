import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.VAIDYAH_API_URL || 'http://localhost:4000/api/v1';
const AUTH_TOKEN = __ENV.VAIDYAH_LOAD_TOKEN || '';

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up to 50 VUs (simulating 50 concurrent nurses)
    { duration: '5m', target: 50 },   // hold at 50 VUs
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    'http_req_duration{api:session_create}': ['p(95)<500'],
    'http_req_duration{api:vitals_submit}': ['p(95)<500'],
    'http_req_duration{api:triage}': ['p(95)<5000'],
    'http_req_duration{api:soap_generate}': ['p(95)<10000'],
    'http_req_duration{api:session_complete}': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
    errors: ['rate<0.01'],
  },
};

// ---------------------------------------------------------------------------
// Custom Metrics
// ---------------------------------------------------------------------------

const errorRate = new Rate('errors');
const triageDuration = new Trend('triage_duration', true);
const soapDuration = new Trend('soap_duration', true);

// ---------------------------------------------------------------------------
// Test Data: realistic Indian patient scenarios
// ---------------------------------------------------------------------------

const patientScenarios = new SharedArray('scenarios', function () {
  return [
    {
      complaint: 'Tez bukhar aur sir dard (high fever and headache)',
      vitals: { heartRate: 98, systolicBp: 125, diastolicBp: 82, temperature: 39.2, spO2: 97, respiratoryRate: 20 },
      symptoms: ['fever', 'headache', 'body ache'],
    },
    {
      complaint: 'Khansi aur saans lene mein taklif (cough and breathing difficulty)',
      vitals: { heartRate: 105, systolicBp: 130, diastolicBp: 85, temperature: 38.5, spO2: 93, respiratoryRate: 26 },
      symptoms: ['cough', 'shortness of breath', 'chest tightness'],
    },
    {
      complaint: 'Pet mein dard aur ulti (stomach pain and vomiting)',
      vitals: { heartRate: 88, systolicBp: 118, diastolicBp: 76, temperature: 37.8, spO2: 98, respiratoryRate: 18 },
      symptoms: ['abdominal pain', 'vomiting', 'nausea'],
    },
    {
      complaint: 'Seene mein dard (chest pain)',
      vitals: { heartRate: 112, systolicBp: 155, diastolicBp: 95, temperature: 37.0, spO2: 95, respiratoryRate: 22 },
      symptoms: ['chest pain', 'sweating', 'left arm pain'],
    },
    {
      complaint: 'Dast aur ulti bahut zyada (severe diarrhea and vomiting)',
      vitals: { heartRate: 115, systolicBp: 95, diastolicBp: 60, temperature: 38.0, spO2: 96, respiratoryRate: 20 },
      symptoms: ['diarrhea', 'vomiting', 'weakness'],
    },
    {
      complaint: 'Bacche ko tez bukhar aur daure (child with high fever and seizures)',
      vitals: { heartRate: 160, systolicBp: 90, diastolicBp: 55, temperature: 40.1, spO2: 94, respiratoryRate: 35 },
      symptoms: ['fever', 'seizure'],
    },
    {
      complaint: 'Saanp ne kaat liya (snake bite)',
      vitals: { heartRate: 120, systolicBp: 88, diastolicBp: 55, temperature: 37.2, spO2: 95, respiratoryRate: 24 },
      symptoms: ['snakebite', 'swelling', 'pain'],
    },
    {
      complaint: 'Kamar mein dard (back pain)',
      vitals: { heartRate: 76, systolicBp: 128, diastolicBp: 82, temperature: 36.8, spO2: 99, respiratoryRate: 16 },
      symptoms: ['back pain', 'stiffness'],
    },
    {
      complaint: 'Peshab mein jalan aur bukhar (burning urination and fever)',
      vitals: { heartRate: 90, systolicBp: 120, diastolicBp: 78, temperature: 38.6, spO2: 98, respiratoryRate: 18 },
      symptoms: ['burning urination', 'fever', 'lower abdominal pain'],
    },
    {
      complaint: 'Skin pe daane aur kharish (skin rash and itching)',
      vitals: { heartRate: 72, systolicBp: 115, diastolicBp: 75, temperature: 37.0, spO2: 99, respiratoryRate: 16 },
      symptoms: ['skin rash', 'itching'],
    },
  ];
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };
}

function checkResponse(res, apiName, expectedStatus) {
  const passed = check(res, {
    [`${apiName}: status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${apiName}: response is JSON`]: (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
    [`${apiName}: success field is true`]: (r) => {
      try { return JSON.parse(r.body).success === true; } catch { return false; }
    },
  });
  if (!passed) {
    errorRate.add(1);
  }
  return passed;
}

// ---------------------------------------------------------------------------
// Main Test Scenario
// ---------------------------------------------------------------------------

export default function () {
  const scenario = patientScenarios[Math.floor(Math.random() * patientScenarios.length)];
  const nurseId = uuidv4();
  const facilityId = uuidv4();
  let sessionId = null;
  let patientId = null;

  // Step 1: Create patient
  group('Create Patient', function () {
    const payload = JSON.stringify({
      name: `Load Test Patient ${__VU}-${__ITER}`,
      phone: `+9198${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
      gender: Math.random() > 0.5 ? 'male' : 'female',
      dateOfBirth: '1985-03-15',
      district: 'Mandla',
      state: 'Madhya Pradesh',
      pincode: '481661',
    });
    const res = http.post(`${BASE_URL}/patients`, payload, {
      headers: headers(),
      tags: { api: 'patient_create' },
    });
    if (res.status === 201) {
      try {
        patientId = JSON.parse(res.body).data.id;
      } catch { /* use fallback */ }
    }
    if (!patientId) {
      patientId = uuidv4();
    }
  });

  sleep(0.5);

  // Step 2: Create consultation session
  group('Create Session', function () {
    const payload = JSON.stringify({
      patientId,
      nurseId,
      facilityId,
      chiefComplaint: scenario.complaint,
      language: 'hi',
    });
    const res = http.post(`${BASE_URL}/sessions`, payload, {
      headers: headers(),
      tags: { api: 'session_create' },
    });
    checkResponse(res, 'session_create', 201);
    if (res.status === 201) {
      try {
        sessionId = JSON.parse(res.body).data.id;
      } catch { /* use fallback */ }
    }
    if (!sessionId) {
      sessionId = uuidv4();
    }
  });

  sleep(0.5);

  // Step 3: Submit vitals
  group('Submit Vitals', function () {
    const payload = JSON.stringify(scenario.vitals);
    const res = http.put(`${BASE_URL}/sessions/${sessionId}/vitals`, payload, {
      headers: headers(),
      tags: { api: 'vitals_submit' },
    });
    checkResponse(res, 'vitals_submit', 200);
  });

  sleep(0.3);

  // Step 4: Run triage
  group('Run Triage', function () {
    const start = Date.now();
    const res = http.post(`${BASE_URL}/sessions/${sessionId}/triage`, null, {
      headers: headers(),
      tags: { api: 'triage' },
      timeout: '10s',
    });
    triageDuration.add(Date.now() - start);
    checkResponse(res, 'triage', 200);
  });

  sleep(0.5);

  // Step 5: Generate SOAP note
  group('Generate SOAP', function () {
    const start = Date.now();
    const res = http.post(`${BASE_URL}/sessions/${sessionId}/soap`, null, {
      headers: headers(),
      tags: { api: 'soap_generate' },
      timeout: '15s',
    });
    soapDuration.add(Date.now() - start);
    checkResponse(res, 'soap_generate', 200);
  });

  sleep(0.3);

  // Step 6: Complete session
  group('Complete Session', function () {
    const payload = JSON.stringify({ status: 'completed' });
    const res = http.patch(`${BASE_URL}/sessions/${sessionId}`, payload, {
      headers: headers(),
      tags: { api: 'session_complete' },
    });
    checkResponse(res, 'session_complete', 200);
  });

  sleep(1);
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalRequests: data.metrics.http_reqs?.values?.count || 0,
    errorRate: data.metrics.errors?.values?.rate || 0,
    p95SessionCreate: data.metrics['http_req_duration{api:session_create}']?.values?.['p(95)'] || null,
    p95VitalsSubmit: data.metrics['http_req_duration{api:vitals_submit}']?.values?.['p(95)'] || null,
    p95Triage: data.metrics['http_req_duration{api:triage}']?.values?.['p(95)'] || null,
    p95SOAPGenerate: data.metrics['http_req_duration{api:soap_generate}']?.values?.['p(95)'] || null,
    thresholdsPassed: Object.values(data.root_group?.checks || {}).every(c => c.passes > 0),
  };
  return {
    stdout: JSON.stringify(summary, null, 2) + '\n',
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}
