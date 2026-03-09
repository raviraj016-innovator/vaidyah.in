import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { auditLogger } from '../middleware/audit';
import { forwardRequest } from '../services/proxy';

export const integrationRouter: Router = Router();
integrationRouter.use(authenticate as never);
integrationRouter.use(auditLogger as never);

// POST /integration/abdm/health-record/:patientId
integrationRouter.post(
  '/abdm/health-record/:patientId',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('integration', req, `/api/v1/abdm/health-record/${req.params.patientId}`);
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /integration/abdm/verify
integrationRouter.post(
  '/abdm/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('integration', req, '/api/v1/abdm/verify');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /integration/wearables/sync
integrationRouter.post(
  '/wearables/sync',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('integration', req, '/api/v1/wearables/sync');
    res.status(result.statusCode).json(result.body);
  }),
);

// POST /integration/whatsapp/send
integrationRouter.post(
  '/whatsapp/send',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await forwardRequest('integration', req, '/api/v1/whatsapp/send');
    res.status(result.statusCode).json(result.body);
  }),
);
