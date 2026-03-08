/**
 * Integration Service — Unit Tests
 *
 * Tests the ABDM, Wearable, WhatsApp, and Notification routes.
 * All external dependencies (database, ABDM API, WhatsApp API) are mocked.
 */

import express from 'express';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the database module
jest.mock('../db', () => ({
  healthCheck: jest.fn().mockResolvedValue({ healthy: true, latency: 5 }),
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryOne: jest.fn().mockResolvedValue(null),
  queryMany: jest.fn().mockResolvedValue([]),
}));

// Mock auth middleware to pass through
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: 'test-user-id', role: 'admin', name: 'Test Admin' };
    next();
  },
  authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));

// Mock ABDM service
jest.mock('../services/abdm', () => ({
  abdmService: {
    verifyAbhaId: jest.fn().mockResolvedValue({ valid: true, name: 'Test Patient', abhaNumber: '12-3456-7890-1234' }),
    requestConsent: jest.fn().mockResolvedValue({ requestId: 'consent-req-123', status: 'REQUESTED' }),
    getConsentStatus: jest.fn().mockResolvedValue({ requestId: 'consent-req-123', status: 'GRANTED' }),
    revokeConsent: jest.fn().mockResolvedValue({ requestId: 'consent-req-123', status: 'REVOKED' }),
    listConsents: jest.fn().mockResolvedValue([{ id: 'c1', status: 'GRANTED', createdAt: '2026-01-01' }]),
    pullHealthRecords: jest.fn().mockResolvedValue([{ recordType: 'Prescription', date: '2026-01-15' }]),
    pushConsultation: jest.fn().mockResolvedValue({ transactionId: 'txn-456', status: 'ACCEPTED' }),
    handleConsentNotification: jest.fn().mockResolvedValue(undefined),
    handleHealthInfoNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock wearable service
jest.mock('../services/wearables', () => ({
  wearableService: {
    connect: jest.fn().mockResolvedValue({ status: 'connected', platform: 'apple_health' }),
    disconnect: jest.fn().mockResolvedValue({ status: 'disconnected', platform: 'apple_health' }),
    syncData: jest.fn().mockResolvedValue({ recordsSynced: 42, errors: [] }),
    getActiveConnections: jest.fn().mockResolvedValue([{ platform: 'apple_health', connected: true }]),
  },
}));

// Mock WhatsApp service
jest.mock('../services/whatsapp', () => ({
  whatsappService: {
    sendMessage: jest.fn().mockResolvedValue({ messageId: 'wamid.123', status: 'sent' }),
    sendTemplateMessage: jest.fn().mockResolvedValue({ messageId: 'wamid.456', status: 'sent' }),
    sendMediaMessage: jest.fn().mockResolvedValue({ messageId: 'wamid.789', status: 'sent' }),
    getAvailableTemplates: jest.fn().mockReturnValue([
      { name: 'appointment_reminder', language: 'en' },
      { name: 'prescription_ready', language: 'hi' },
    ]),
    verifyWebhookSubscription: jest.fn().mockReturnValue(true),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    processWebhookPayload: jest.fn().mockResolvedValue({ statusUpdates: 1, inboundMessages: 0 }),
  },
}));

// ─── Import app after mocks ──────────────────────────────────────────────────

import request from 'supertest';

// We need supertest for HTTP testing
let app: express.Express;

beforeAll(async () => {
  // Dynamic import to ensure mocks are in place
  const module = await import('../app');
  app = module.default;
});

// ─── Health Check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.service).toBeDefined();
  });
});

// ─── ABDM Routes ──────────────────────────────────────────────────────────────

describe('ABDM Routes', () => {
  describe('POST /api/v1/abdm/verify', () => {
    it('verifies an ABHA ID', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/verify')
        .send({ abhaId: '12-3456-7890-1234', purpose: 'consultation' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
    });
  });

  describe('POST /api/v1/abdm/consent/request', () => {
    it('creates a consent request', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/consent/request')
        .send({
          patientAbhaId: '12-3456-7890-1234',
          purpose: 'consultation',
          dateRange: { from: '2025-01-01', to: '2026-01-01' },
          hiTypes: ['Prescription', 'DiagnosticReport'],
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requestId).toBeDefined();
    });
  });

  describe('POST /api/v1/abdm/consent/status', () => {
    it('returns consent status', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/consent/status')
        .send({ requestId: 'consent-req-123' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('GRANTED');
    });

    it('rejects missing requestId', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/consent/status')
        .send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v1/abdm/consent/:patientId', () => {
    it('lists consents for a patient', async () => {
      const patientId = '550e8400-e29b-41d4-a716-446655440000';
      const res = await request(app).get(`/api/v1/abdm/consent/${patientId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('rejects invalid UUID', async () => {
      const res = await request(app).get('/api/v1/abdm/consent/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/abdm/records/:patientId', () => {
    it('fetches health records', async () => {
      const patientId = '550e8400-e29b-41d4-a716-446655440000';
      const res = await request(app).get(`/api/v1/abdm/records/${patientId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/abdm/records/push', () => {
    it('pushes a consultation to ABDM', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/records/push')
        .send({
          consultationId: '550e8400-e29b-41d4-a716-446655440001',
          patientAbhaId: '12-3456-7890-1234',
          record: { type: 'Prescription', data: {} },
        });
      expect(res.status).toBe(201);
    });
  });

  describe('Callback endpoints', () => {
    it('accepts consent notification callback', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/callback/consent')
        .send({ notificationType: 'consent', status: 'GRANTED' });
      expect(res.status).toBe(202);
    });

    it('accepts health-info notification callback', async () => {
      const res = await request(app)
        .post('/api/v1/abdm/callback/health-info')
        .send({ transactionId: 'txn-123' });
      expect(res.status).toBe(202);
    });
  });
});

// ─── WhatsApp Routes ──────────────────────────────────────────────────────────

describe('WhatsApp Routes', () => {
  describe('POST /api/v1/whatsapp/send', () => {
    it('sends a WhatsApp message', async () => {
      const res = await request(app)
        .post('/api/v1/whatsapp/send')
        .send({ to: '+919876543210', body: 'Your appointment is confirmed.' });
      expect(res.status).toBe(201);
      expect(res.body.data.messageId).toBeDefined();
    });
  });

  describe('POST /api/v1/whatsapp/template', () => {
    it('sends a template message', async () => {
      const res = await request(app)
        .post('/api/v1/whatsapp/template')
        .send({
          to: '+919876543210',
          templateName: 'appointment_reminder',
          language: 'en',
          parameters: ['Dr. Sharma', '2:00 PM'],
        });
      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/v1/whatsapp/media', () => {
    it('sends a media message', async () => {
      const res = await request(app)
        .post('/api/v1/whatsapp/media')
        .send({
          to: '+919876543210',
          mediaUrl: 'https://example.com/prescription.pdf',
          mediaType: 'document',
          caption: 'Your prescription',
        });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/v1/whatsapp/templates', () => {
    it('lists available templates', async () => {
      const res = await request(app).get('/api/v1/whatsapp/templates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/whatsapp/webhook', () => {
    it('verifies webhook subscription', async () => {
      const res = await request(app)
        .get('/api/v1/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-verify-token',
          'hub.challenge': 'challenge-string-123',
        });
      expect(res.status).toBe(200);
      expect(res.text).toBe('challenge-string-123');
    });
  });
});

// ─── Wearable Routes ──────────────────────────────────────────────────────────

describe('Wearable Routes', () => {
  const patientId = '550e8400-e29b-41d4-a716-446655440000';

  describe('POST /api/v1/wearables/connect', () => {
    it('connects a wearable device', async () => {
      const res = await request(app)
        .post('/api/v1/wearables/connect')
        .send({
          patientId,
          platform: 'apple_health',
          authorizationCode: 'auth-code-123',
          redirectUri: 'vaidyah://callback',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('connected');
    });
  });

  describe('POST /api/v1/wearables/disconnect', () => {
    it('disconnects a wearable device', async () => {
      const res = await request(app)
        .post('/api/v1/wearables/disconnect')
        .send({ patientId, platform: 'apple_health' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('disconnected');
    });
  });

  describe('POST /api/v1/wearables/sync', () => {
    it('syncs wearable data', async () => {
      const res = await request(app)
        .post('/api/v1/wearables/sync')
        .send({
          patientId,
          platform: 'apple_health',
          dataTypes: ['heart_rate', 'steps'],
        });
      expect(res.status).toBe(200);
      expect(res.body.data.recordsSynced).toBe(42);
    });
  });

  describe('GET /api/v1/wearables/data/:patientId', () => {
    it('retrieves wearable data', async () => {
      const res = await request(app).get(`/api/v1/wearables/data/${patientId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid UUID for patientId', async () => {
      const res = await request(app).get('/api/v1/wearables/data/bad-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/wearables/connections/:patientId', () => {
    it('lists active connections', async () => {
      const res = await request(app).get(`/api/v1/wearables/connections/${patientId}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/wearables/alerts/:patientId', () => {
    it('retrieves health alerts', async () => {
      const res = await request(app).get(`/api/v1/wearables/alerts/${patientId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

// ─── Notification Routes ──────────────────────────────────────────────────────

describe('Notification Routes', () => {
  const patientId = '550e8400-e29b-41d4-a716-446655440000';

  describe('POST /api/v1/notifications/schedule', () => {
    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/schedule')
        .send({ patientId });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v1/notifications/:patientId', () => {
    it('lists notifications for a patient', async () => {
      const res = await request(app).get(`/api/v1/notifications/${patientId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
  });
});
