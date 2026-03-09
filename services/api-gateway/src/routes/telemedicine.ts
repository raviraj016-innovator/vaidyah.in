import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { auditLogger } from '../middleware/audit';
import { forwardRequest } from '../services/proxy';

export const telemedicineRouter: Router = Router();
telemedicineRouter.use(authenticate as never);
telemedicineRouter.use(auditLogger as never);

// POST /telemedicine/meetings — Create a video consultation meeting
telemedicineRouter.post(
  '/meetings',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, '/meetings');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /telemedicine/meetings/:id/attendees — Add attendee to meeting
telemedicineRouter.post(
  '/meetings/:consultationId/attendees',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/meetings/${req.params.consultationId}/attendees`);
    res.status(result.statusCode).json(result.body);
  }),
);

// GET /telemedicine/meetings/:id — Get meeting status
telemedicineRouter.get(
  '/meetings/:consultationId',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/meetings/${req.params.consultationId}`);
    res.status(result.statusCode).json(result.body);
  }),
);

// DELETE /telemedicine/meetings/:id — End meeting
telemedicineRouter.delete(
  '/meetings/:consultationId',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/meetings/${req.params.consultationId}`);
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /telemedicine/transcription/start — Start live transcription
telemedicineRouter.post(
  '/transcription/start',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, '/transcription/start');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /telemedicine/transcription/:id/stop — Stop transcription
telemedicineRouter.post(
  '/transcription/:consultationId/stop',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/transcription/${req.params.consultationId}/stop`);
    res.status(result.statusCode).json(result.body);
  }),
);

// GET /telemedicine/transcription/:id — Get transcript
telemedicineRouter.get(
  '/transcription/:consultationId',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/transcription/${req.params.consultationId}`);
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /telemedicine/meetings/:id/token — Refresh meeting token
telemedicineRouter.post(
  '/meetings/:consultationId/token',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/meetings/${req.params.consultationId}/token`);
    res.status(result.statusCode).json(result.body);
  }),
);

// GET /telemedicine/meetings/:id/attendees — List attendees
telemedicineRouter.get(
  '/meetings/:consultationId/attendees',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, `/meetings/${req.params.consultationId}/attendees`);
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /telemedicine/facial-analysis — Facial analysis for telemedicine
telemedicineRouter.post(
  '/facial-analysis',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, '/facial-analysis');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /telemedicine/audio — Audio processing for telemedicine
telemedicineRouter.post(
  '/audio',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('telemedicine', req, '/audio');
    res.status(result.statusCode).json(result.body);
  }),
);
