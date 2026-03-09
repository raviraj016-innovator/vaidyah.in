import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { auditLogger } from '../middleware/audit';
import { forwardRequest } from '../services/proxy';

export const nluRouter: Router = Router();
nluRouter.use(authenticate as never);
nluRouter.use(auditLogger as never);

// POST /nlu/extract-symptoms
nluRouter.post(
  '/extract-symptoms',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/extract-symptoms');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /nlu/contradictions
nluRouter.post(
  '/contradictions',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/contradictions');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /nlu/followup-questions
nluRouter.post(
  '/followup-questions',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/followup-questions');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /nlu/translate
nluRouter.post(
  '/translate',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/translate');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /nlu/soap-generate
nluRouter.post(
  '/soap-generate',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/soap-generate');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /nlu/summarize
nluRouter.post(
  '/summarize',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/summarize');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /nlu/medical-entities
nluRouter.post(
  '/medical-entities',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('nlu', req, '/api/v1/nlu/medical-entities');
    res.status(result.statusCode).json(result.body);
  }),
);
