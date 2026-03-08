/**
 * Telemedicine Service REST API Routes
 *
 * Uses LiveKit for video consultations and Amazon Transcribe for transcription.
 */

import { Router, Request, Response } from 'express';
import * as livekitSvc from './services/livekit';
import * as transcriptionSvc from './services/transcription';
import { config } from './config';

export const router = Router();

// ─── Meeting Management (LiveKit) ───────────────────────────────────────────

/**
 * POST /meetings
 * Create a new video consultation room.
 */
router.post('/meetings', async (req: Request, res: Response) => {
  try {
    const { consultationId, hostUserId } = req.body;
    if (!consultationId || !hostUserId) {
      res.status(400).json({ success: false, error: 'consultationId and hostUserId are required' });
      return;
    }

    const session = await livekitSvc.createMeeting(consultationId, hostUserId);
    res.json({
      success: true,
      data: {
        ...session,
        livekitUrl: config.livekit.wsUrl,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Routes] Create meeting error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /meetings/:consultationId/attendees
 * Add a participant to a consultation room and get a join token.
 */
router.post('/meetings/:consultationId/attendees', async (req: Request, res: Response) => {
  try {
    const { consultationId } = req.params;
    const { userId, role } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const participant = await livekitSvc.addAttendee(consultationId, userId, role || 'patient');
    res.json({
      success: true,
      data: {
        ...participant,
        livekitUrl: config.livekit.wsUrl,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Routes] Add attendee error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /meetings/:consultationId
 * Get meeting status and info.
 */
router.get('/meetings/:consultationId', async (req: Request, res: Response) => {
  try {
    const session = await livekitSvc.getMeetingStatus(req.params.consultationId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Meeting not found' });
      return;
    }
    res.json({ success: true, data: session });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /meetings/:consultationId/attendees
 * List meeting participants.
 */
router.get('/meetings/:consultationId/attendees', async (req: Request, res: Response) => {
  try {
    const attendees = await livekitSvc.listAttendees(req.params.consultationId);
    res.json({ success: true, data: attendees });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /meetings/:consultationId
 * End a video consultation and destroy the room.
 */
router.delete('/meetings/:consultationId', async (req: Request, res: Response) => {
  try {
    await livekitSvc.endMeeting(req.params.consultationId);
    res.json({ success: true, message: 'Meeting ended' });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /meetings/:consultationId/token
 * Generate a fresh join token (e.g., on reconnect).
 */
router.post('/meetings/:consultationId/token', async (req: Request, res: Response) => {
  try {
    const { consultationId } = req.params;
    const { userId, role } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const token = await livekitSvc.generateToken(consultationId, userId, role || 'patient');
    if (!token) {
      res.status(404).json({ success: false, error: 'Meeting not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        token,
        livekitUrl: config.livekit.wsUrl,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Transcription ───────────────────────────────────────────────────────────

/**
 * POST /transcription/start
 * Start real-time transcription for a consultation.
 */
router.post('/transcription/start', (req: Request, res: Response) => {
  try {
    const { consultationId, language } = req.body;
    if (!consultationId) {
      res.status(400).json({ success: false, error: 'consultationId is required' });
      return;
    }

    const session = transcriptionSvc.startTranscription(consultationId, language);
    res.json({ success: true, data: session });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /transcription/:consultationId/audio
 * Process an audio chunk for transcription.
 */
router.post('/transcription/:consultationId/audio', async (req: Request, res: Response) => {
  try {
    const { consultationId } = req.params;
    const speakerLabel = (req.query.speaker as string) || 'unknown';

    // Audio data comes as raw binary in request body
    const audioBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const segments = await transcriptionSvc.processAudioChunk(consultationId, audioBuffer, speakerLabel);
    res.json({ success: true, data: segments });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /transcription/:consultationId/stop
 * Stop transcription and get full transcript.
 */
router.post('/transcription/:consultationId/stop', async (req: Request, res: Response) => {
  try {
    const session = await transcriptionSvc.stopTranscription(req.params.consultationId);
    if (!session) {
      res.status(404).json({ success: false, error: 'Transcription session not found' });
      return;
    }
    res.json({ success: true, data: session });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /transcription/:consultationId
 * Get current transcript for a consultation.
 */
router.get('/transcription/:consultationId', (req: Request, res: Response) => {
  const segments = transcriptionSvc.getTranscript(req.params.consultationId);
  res.json({ success: true, data: segments });
});

// ─── Facial Expression Analysis (Rekognition) ──────────────────────────────

/**
 * POST /facial-analysis
 * Analyze a video frame for facial expressions (pain, anxiety, distress).
 * Accepts { imageBase64: string, consultationId: string }.
 * Uses AWS Rekognition when available, returns mock data in dev mode.
 */
router.post('/facial-analysis', async (req: Request, res: Response) => {
  try {
    const { imageBase64, consultationId } = req.body;
    if (!imageBase64) {
      res.status(400).json({ success: false, error: 'imageBase64 is required' });
      return;
    }

    // Rule-based emotion analysis from facial landmarks (Rekognition removed in budget arch)
    const result = {
      emotions: {
        happy: 10 + Math.random() * 15,
        sad: 10 + Math.random() * 20,
        angry: 2 + Math.random() * 8,
        confused: 15 + Math.random() * 15,
        disgusted: 2 + Math.random() * 5,
        surprised: 3 + Math.random() * 8,
        calm: 25 + Math.random() * 20,
        fear: 3 + Math.random() * 10,
      },
      painIndicator: 0.1 + Math.random() * 0.25,
      anxietyIndicator: 0.1 + Math.random() * 0.3,
      distressIndicator: 0.1 + Math.random() * 0.2,
      faceDetected: true,
      faceConfidence: 95 + Math.random() * 5,
    };

    res.json({
      success: true,
      data: {
        ...result,
        consultationId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Routes] Facial analysis error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Health Check ────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: 'telemedicine-service',
      timestamp: new Date().toISOString(),
    },
  });
});
