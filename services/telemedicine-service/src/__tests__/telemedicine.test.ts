/**
 * Telemedicine Service — Unit Tests
 *
 * Tests REST routes for meetings, transcription, and facial analysis.
 * LiveKit SDK and Transcribe SDK are mocked.
 */

import express from 'express';
import request from 'supertest';
import { router } from '../routes';
import * as livekitSvc from '../services/livekit';
import * as transcriptionSvc from '../services/transcription';

// Build test app
const app = express();
app.use(express.json());
app.use('/api/v1/telemedicine', router);

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../services/livekit');
jest.mock('../services/transcription');

const mockedLivekit = livekitSvc as jest.Mocked<typeof livekitSvc>;
const mockedTranscription = transcriptionSvc as jest.Mocked<typeof transcriptionSvc>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Meeting Management ───────────────────────────────────────────────────────

describe('Meeting Management', () => {
  const mockSession: livekitSvc.TeleconsultSession = {
    roomInfo: {
      roomName: 'vaidyah-session-123',
      sid: 'room-sid-abc',
      numParticipants: 1,
      maxParticipants: 10,
      createdAt: Date.now(),
    },
    participants: [
      { identity: 'nurse-1', role: 'host', joinToken: 'token-abc' },
    ],
    consultationId: 'session-123',
    createdAt: new Date().toISOString(),
    status: 'waiting',
  };

  describe('POST /api/v1/telemedicine/meetings', () => {
    it('creates a new meeting', async () => {
      mockedLivekit.createMeeting.mockResolvedValue(mockSession);

      const res = await request(app)
        .post('/api/v1/telemedicine/meetings')
        .send({ consultationId: 'session-123', hostUserId: 'nurse-1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roomInfo.roomName).toBe('vaidyah-session-123');
      expect(mockedLivekit.createMeeting).toHaveBeenCalledWith('session-123', 'nurse-1');
    });

    it('returns 400 when consultationId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/telemedicine/meetings')
        .send({ hostUserId: 'nurse-1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when hostUserId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/telemedicine/meetings')
        .send({ consultationId: 'session-123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/telemedicine/meetings/:consultationId/attendees', () => {
    it('adds an attendee to a meeting', async () => {
      const participant = { identity: 'doctor-1', role: 'doctor', joinToken: 'token-xyz' };
      mockedLivekit.addAttendee.mockResolvedValue(participant);

      const res = await request(app)
        .post('/api/v1/telemedicine/meetings/session-123/attendees')
        .send({ userId: 'doctor-1', role: 'doctor' });

      expect(res.status).toBe(200);
      expect(res.body.data.identity).toBe('doctor-1');
      expect(mockedLivekit.addAttendee).toHaveBeenCalledWith('session-123', 'doctor-1', 'doctor');
    });

    it('defaults role to patient when not provided', async () => {
      mockedLivekit.addAttendee.mockResolvedValue({
        identity: 'patient-1', role: 'patient', joinToken: 'token-p',
      });

      await request(app)
        .post('/api/v1/telemedicine/meetings/session-123/attendees')
        .send({ userId: 'patient-1' });

      expect(mockedLivekit.addAttendee).toHaveBeenCalledWith('session-123', 'patient-1', 'patient');
    });

    it('returns 400 when userId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/telemedicine/meetings/session-123/attendees')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/telemedicine/meetings/:consultationId', () => {
    it('returns meeting status', async () => {
      mockedLivekit.getMeetingStatus.mockResolvedValue(mockSession);

      const res = await request(app).get('/api/v1/telemedicine/meetings/session-123');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('waiting');
    });

    it('returns 404 when meeting not found', async () => {
      mockedLivekit.getMeetingStatus.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/telemedicine/meetings/unknown');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/telemedicine/meetings/:consultationId/attendees', () => {
    it('lists attendees', async () => {
      mockedLivekit.listAttendees.mockResolvedValue([
        { identity: 'nurse-1', role: 'host', joinToken: 'token-1' },
        { identity: 'doctor-1', role: 'doctor', joinToken: 'token-2' },
      ]);

      const res = await request(app).get('/api/v1/telemedicine/meetings/session-123/attendees');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('DELETE /api/v1/telemedicine/meetings/:consultationId', () => {
    it('ends a meeting', async () => {
      mockedLivekit.endMeeting.mockResolvedValue(undefined);

      const res = await request(app).delete('/api/v1/telemedicine/meetings/session-123');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Meeting ended');
      expect(mockedLivekit.endMeeting).toHaveBeenCalledWith('session-123');
    });
  });

  describe('POST /api/v1/telemedicine/meetings/:consultationId/token', () => {
    it('generates a fresh token', async () => {
      mockedLivekit.generateToken.mockResolvedValue('new-token-123');

      const res = await request(app)
        .post('/api/v1/telemedicine/meetings/session-123/token')
        .send({ userId: 'nurse-1', role: 'host' });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBe('new-token-123');
    });

    it('returns 404 when meeting not found for token', async () => {
      mockedLivekit.generateToken.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/telemedicine/meetings/unknown/token')
        .send({ userId: 'nurse-1' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when userId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/telemedicine/meetings/session-123/token')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});

// ─── Transcription ────────────────────────────────────────────────────────────

describe('Transcription', () => {
  describe('POST /api/v1/telemedicine/transcription/start', () => {
    it('starts transcription', async () => {
      mockedTranscription.startTranscription.mockReturnValue({
        consultationId: 'session-123',
        language: 'en-IN',
        status: 'active',
        startedAt: new Date().toISOString(),
      } as any);

      const res = await request(app)
        .post('/api/v1/telemedicine/transcription/start')
        .send({ consultationId: 'session-123', language: 'en-IN' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when consultationId is missing', async () => {
      const res = await request(app)
        .post('/api/v1/telemedicine/transcription/start')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/telemedicine/transcription/:consultationId/stop', () => {
    it('stops transcription and returns transcript', async () => {
      mockedTranscription.stopTranscription.mockResolvedValue({
        consultationId: 'session-123',
        segments: [{ speaker: 'nurse', text: 'How are you feeling?', timestamp: '2026-01-01T00:00:00Z' }],
        stoppedAt: new Date().toISOString(),
      } as any);

      const res = await request(app)
        .post('/api/v1/telemedicine/transcription/session-123/stop');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 when transcription not found', async () => {
      mockedTranscription.stopTranscription.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/telemedicine/transcription/unknown/stop');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/telemedicine/transcription/:consultationId', () => {
    it('returns current transcript', async () => {
      mockedTranscription.getTranscript.mockReturnValue([
        { speaker: 'nurse', text: 'Hello', timestamp: '2026-01-01T00:00:00Z', isFinal: true },
      ] as any);

      const res = await request(app).get('/api/v1/telemedicine/transcription/session-123');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});

// ─── Facial Analysis ──────────────────────────────────────────────────────────

describe('Facial Analysis', () => {
  describe('POST /api/v1/telemedicine/facial-analysis', () => {
    it('analyzes a facial image (mock mode)', async () => {
      const imageBase64 = Buffer.from('fake-image-data').toString('base64');

      const res = await request(app)
        .post('/api/v1/telemedicine/facial-analysis')
        .send({ imageBase64, consultationId: 'session-123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.consultationId).toBe('session-123');
      expect(res.body.data.timestamp).toBeDefined();
    });

    it('returns 400 when imageBase64 is missing', async () => {
      const res = await request(app)
        .post('/api/v1/telemedicine/facial-analysis')
        .send({ consultationId: 'session-123' });

      expect(res.status).toBe(400);
    });
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────

describe('GET /api/v1/telemedicine/health', () => {
  it('returns healthy status', async () => {
    const res = await request(app).get('/api/v1/telemedicine/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.service).toBe('telemedicine-service');
  });
});
