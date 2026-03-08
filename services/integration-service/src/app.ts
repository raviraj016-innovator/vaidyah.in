import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import config from './config';
import { healthCheck as dbHealthCheck } from './db';
import { authenticate, authorize } from './middleware/auth';
import { errorHandler, notFoundHandler, ValidationError } from './middleware/errorHandler';
import { abdmService } from './services/abdm';
import { wearableService } from './services/wearables';
import { whatsappService } from './services/whatsapp';
import {
  ServiceResponse,
  ABHAVerificationSchema,
  ConsentRequestSchema,
  ConsultationPushSchema,
  WearableConnectSchema,
  WearableDisconnectSchema,
  WearableSyncSchema,
  WhatsAppSendSchema,
  WhatsAppTemplateSendSchema,
  WhatsAppMediaSendSchema,
  WhatsAppWebhookPayload,
  ScheduledNotification,
} from './types';
import { query, queryOne, queryMany } from './db';

// ─── Audit Logging ──────────────────────────────────────────────────────────

const _auditLog = async (event: Record<string, unknown>) => {
  console.log('[AUDIT]', JSON.stringify(event));
};
console.log('[integration-service] Audit logging initialized');

async function audit(action: string, resource: string, resourceId: string, userId: string, details: Record<string, unknown> = {}) {
  await _auditLog({ action, resource, resourceId, userId, details }).catch((err) =>
    console.error('[AUDIT] Failed:', (err as Error).message)
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: config.server.corsOrigins, credentials: true }));
app.use(express.json({
  limit: '5mb',
  verify: (req: any, _res, buf) => {
    // Preserve raw body for webhook signature verification
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(config.logging.format));

app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { requestId: string }).requestId = req.headers['x-request-id'] as string || uuidv4();
  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const db = await dbHealthCheck();
  const status = db.healthy ? 200 : 503;

  const response: ServiceResponse = {
    success: db.healthy,
    data: {
      service: config.server.serviceName,
      status: db.healthy ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      database: db,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(status).json(response);
});

// ─── ABDM Routes ──────────────────────────────────────────────────────────────

const abdmRouter = express.Router();
abdmRouter.use(authenticate);
abdmRouter.param('patientId', (_req, res, next, value) => {
  if (!UUID_REGEX.test(value)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PARAM', message: 'patientId must be a valid UUID' } });
    return;
  }
  next();
});

// POST /abdm/verify — Verify ABHA ID
abdmRouter.post('/verify', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ABHAVerificationSchema.parse(req.body);
    const result = await abdmService.verifyAbhaId(validated);

    const response: ServiceResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /abdm/consent/request — Request consent
abdmRouter.post('/consent/request', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ConsentRequestSchema.parse(req.body);
    const result = await abdmService.requestConsent(validated);

    const response: ServiceResponse = {
      success: true,
      data: result,
      message: 'Consent request initiated',
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// POST /abdm/consent/status — Get consent status
abdmRouter.post('/consent/status', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.body;
    if (!requestId || typeof requestId !== 'string') {
      throw new ValidationError('requestId is required');
    }

    const result = await abdmService.getConsentStatus(requestId);

    const response: ServiceResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /abdm/consent/revoke — Revoke consent
abdmRouter.post('/consent/revoke', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { requestId } = req.body;
    if (!requestId || typeof requestId !== 'string') {
      throw new ValidationError('requestId is required');
    }

    const result = await abdmService.revokeConsent(requestId);

    const response: ServiceResponse = {
      success: true,
      data: result,
      message: 'Consent revoked successfully',
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /abdm/consent/:patientId — List consents for a patient
abdmRouter.get('/consent/:patientId', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    const consents = await abdmService.listConsents(patientId);

    const response: ServiceResponse = {
      success: true,
      data: consents,
      message: `Retrieved ${consents.length} consent(s)`,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /abdm/records/:patientId — Fetch health records
abdmRouter.get('/records/:patientId', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    const records = await abdmService.pullHealthRecords(patientId);

    // Audit: PHI access via ABDM health records
    const user = (req as any).user;
    await audit('PHI_ACCESS', 'abdm_health_records', patientId, user?.userId ?? 'system', {
      records_count: records.length,
      access_type: 'pull',
    });

    const response: ServiceResponse = {
      success: true,
      data: records,
      message: `Retrieved ${records.length} health record(s)`,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /abdm/records/push — Push health record to ABDM
abdmRouter.post('/records/push', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = ConsultationPushSchema.parse(req.body);
    const result = await abdmService.pushConsultation(validated);

    const response: ServiceResponse = {
      success: true,
      data: result,
      message: 'Consultation pushed to ABDM health locker',
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// POST /abdm/callback/consent — ABDM gateway consent notification callback
abdmRouter.post('/callback/consent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify ABDM gateway callback authenticity via X-ABDM-Signature header
    const signature = req.headers['x-abdm-signature'] as string;
    if (!signature) {
      res.status(401).json({ error: 'Missing ABDM callback signature' });
      return;
    }
    const abdmSecret = process.env.ABDM_WEBHOOK_SECRET;
    if (abdmSecret) {
      const crypto = await import('crypto');
      const rawBody = (req as any).rawBody;
      const expected = crypto.createHmac('sha256', abdmSecret)
        .update(rawBody || JSON.stringify(req.body))
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
        res.status(401).json({ error: 'Invalid ABDM callback signature' });
        return;
      }
    }
    await abdmService.handleConsentNotification(req.body);
    res.sendStatus(202);
  } catch (error) {
    next(error);
  }
});

// POST /abdm/callback/health-info — ABDM gateway health info notification callback
abdmRouter.post('/callback/health-info', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify ABDM gateway callback authenticity via X-ABDM-Signature header
    const signature = req.headers['x-abdm-signature'] as string;
    if (!signature) {
      res.status(401).json({ error: 'Missing ABDM callback signature' });
      return;
    }
    const abdmSecret = process.env.ABDM_WEBHOOK_SECRET;
    if (abdmSecret) {
      const crypto = await import('crypto');
      const rawBody = (req as any).rawBody;
      const expected = crypto.createHmac('sha256', abdmSecret)
        .update(rawBody || JSON.stringify(req.body))
        .digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
        res.status(401).json({ error: 'Invalid ABDM callback signature' });
        return;
      }
    }
    await abdmService.handleHealthInfoNotification(req.body);
    res.sendStatus(202);
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1/abdm', abdmRouter);

// ─── WhatsApp Routes ──────────────────────────────────────────────────────────

const whatsappRouter = express.Router();

// POST /whatsapp/send — Send WhatsApp message
whatsappRouter.post('/send', authenticate, authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WhatsAppSendSchema.parse(req.body);
    const result = await whatsappService.sendMessage(validated);

    const isFailed = result.status === 'failed';
    const response: ServiceResponse = {
      success: !isFailed,
      data: result,
      ...(isFailed && { error: 'WhatsApp message send failed' }),
      timestamp: new Date().toISOString(),
    };
    res.status(isFailed ? 502 : 201).json(response);
  } catch (error) {
    next(error);
  }
});

// POST /whatsapp/template — Send template message
whatsappRouter.post('/template', authenticate, authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WhatsAppTemplateSendSchema.parse(req.body);
    const result = await whatsappService.sendTemplateMessage(validated);

    const isFailed = result.status === 'failed';
    const response: ServiceResponse = {
      success: !isFailed,
      data: result,
      ...(isFailed && { error: 'WhatsApp template message send failed' }),
      timestamp: new Date().toISOString(),
    };
    res.status(isFailed ? 502 : 201).json(response);
  } catch (error) {
    next(error);
  }
});

// POST /whatsapp/media — Send media message (prescription images, lab reports)
whatsappRouter.post('/media', authenticate, authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WhatsAppMediaSendSchema.parse(req.body);
    const result = await whatsappService.sendMediaMessage(validated);

    const isFailed = result.status === 'failed';
    const response: ServiceResponse = {
      success: !isFailed,
      data: result,
      ...(isFailed && { error: 'WhatsApp media message send failed' }),
      timestamp: new Date().toISOString(),
    };
    res.status(isFailed ? 502 : 201).json(response);
  } catch (error) {
    next(error);
  }
});

// GET /whatsapp/templates — List available templates
whatsappRouter.get('/templates', authenticate, authorize('doctor', 'admin', 'system'), (_req: Request, res: Response) => {
  const templates = whatsappService.getAvailableTemplates();
  const response: ServiceResponse = {
    success: true,
    data: templates,
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

// GET /whatsapp/webhook — WhatsApp webhook verification (Meta challenge)
whatsappRouter.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (whatsappService.verifyWebhookSubscription(mode, token)) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Verification failed' });
  }
});

// POST /whatsapp/webhook — Receive webhook events
whatsappRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify Meta/WhatsApp webhook signature
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error('[Webhook] rawBody not preserved');
      res.status(500).json({ error: 'Webhook verification misconfigured' });
      return;
    }

    if (!whatsappService.verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const payload = req.body as WhatsAppWebhookPayload;
    const result = await whatsappService.processWebhookPayload(payload);

    console.log(`[WhatsApp Webhook] Processed: ${result.statusUpdates} status update(s), ${result.inboundMessages} inbound message(s)`);
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1/whatsapp', whatsappRouter);

// ─── Wearable Routes ─────────────────────────────────────────────────────────

const wearableRouter = express.Router();
wearableRouter.use(authenticate);
wearableRouter.param('patientId', (_req, res, next, value) => {
  if (!UUID_REGEX.test(value)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PARAM', message: 'patientId must be a valid UUID' } });
    return;
  }
  next();
});

// POST /wearables/connect — Connect wearable device
wearableRouter.post('/connect', authorize('patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WearableConnectSchema.parse(req.body);

    if (req.user?.role === 'patient' && req.user?.userId !== validated.patientId) {
      res.status(403).json({
        success: false,
        error: 'Patients can only connect their own wearable devices',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await wearableService.connect(
      validated.patientId,
      validated.platform,
      validated.authorizationCode,
      validated.redirectUri,
    );

    const response: ServiceResponse = {
      success: true,
      data: result,
      message: `${validated.platform} connected successfully`,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// POST /wearables/disconnect — Disconnect device
wearableRouter.post('/disconnect', authorize('patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WearableDisconnectSchema.parse(req.body);

    if (req.user?.role === 'patient' && req.user?.userId !== validated.patientId) {
      res.status(403).json({
        success: false,
        error: 'Patients can only disconnect their own wearable devices',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await wearableService.disconnect(validated.patientId, validated.platform);

    const response: ServiceResponse = {
      success: true,
      data: result,
      message: `${validated.platform} disconnected successfully`,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /wearables/sync — Sync latest data
wearableRouter.post('/sync', authorize('patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WearableSyncSchema.parse(req.body);

    if (req.user?.role === 'patient' && req.user?.userId !== validated.patientId) {
      res.status(403).json({
        success: false,
        error: 'Patients can only sync their own wearable data',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await wearableService.syncData(
      validated.patientId,
      validated.platform,
      validated.dataTypes,
    );

    const response: ServiceResponse = {
      success: !result.errors?.length,
      data: result,
      message: `Synced ${result.recordsSynced} record(s) from ${validated.platform}`,
      timestamp: new Date().toISOString(),
    };
    res.status(result.errors?.length ? 207 : 200).json(response);
  } catch (error) {
    next(error);
  }
});

// GET /wearables/data/:patientId — Get patient wearable data
wearableRouter.get('/data/:patientId', authorize('doctor', 'patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    const user = (req as any).user;

    // Patients can only access their own data
    if (user?.role === 'patient' && user?.userId !== patientId) {
      res.status(403).json({ success: false, error: 'Patients can only access their own data' });
      return;
    }

    // Doctors must have an active care relationship with the patient
    if (user?.role === 'doctor') {
      const rel = await queryOne('SELECT 1 FROM care_relationships WHERE doctor_id = $1 AND patient_id = $2 AND status = $3 LIMIT 1', [user.userId, patientId, 'active']);
      if (!rel) {
        res.status(403).json({ success: false, error: 'No active care relationship with this patient' });
        return;
      }
    }

    const { dataType, from, to, limit: queryLimit, platform } = req.query;

    // Validate dataType against whitelist
    const VALID_DATA_TYPES = [
      'heart_rate', 'steps', 'blood_glucose', 'spo2', 'sleep',
      'blood_pressure', 'weight', 'calories_burned', 'active_minutes',
      'temperature', 'respiratory_rate',
    ];
    if (dataType && !VALID_DATA_TYPES.includes(String(dataType))) {
      res.status(400).json({ success: false, error: 'Invalid dataType' });
      return;
    }

    // Validate platform
    const VALID_PLATFORMS = ['apple_health', 'google_fit', 'fitbit'];
    if (platform && !VALID_PLATFORMS.includes(String(platform))) {
      res.status(400).json({ success: false, error: 'Invalid platform' });
      return;
    }

    // Validate date params
    if (from && isNaN(Date.parse(String(from)))) {
      res.status(400).json({ success: false, error: 'Invalid "from" date format' });
      return;
    }
    if (to && isNaN(Date.parse(String(to)))) {
      res.status(400).json({ success: false, error: 'Invalid "to" date format' });
      return;
    }

    let sql = `SELECT id, patient_id AS "patientId", platform, data_type AS "dataType",
                      value, unit, start_time AS "startTime", end_time AS "endTime",
                      metadata, synced_at AS "syncedAt"
               FROM wearable_data WHERE patient_id = $1`;
    const params: unknown[] = [patientId];

    if (dataType) {
      params.push(dataType);
      sql += ` AND data_type = $${params.length}`;
    }

    if (platform) {
      params.push(platform);
      sql += ` AND platform = $${params.length}`;
    }

    if (from) {
      params.push(from);
      sql += ` AND start_time >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      sql += ` AND end_time <= $${params.length}`;
    }

    sql += ` ORDER BY start_time DESC`;

    const rowLimit = Math.min(parseInt(queryLimit as string, 10) || 100, 500);
    params.push(rowLimit);
    sql += ` LIMIT $${params.length}`;

    const data = await queryMany(sql, params);

    // Audit: wearable health data access (PHI)
    await audit('PHI_ACCESS', 'wearable_data', patientId, user?.userId ?? 'system', {
      data_type: dataType || 'all',
      platform: platform || 'all',
      records_returned: data.length,
    });

    const response: ServiceResponse = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /wearables/connections/:patientId — Get active wearable connections
wearableRouter.get('/connections/:patientId', authorize('patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;

    if (req.user?.role === 'patient' && req.user?.userId !== patientId) {
      res.status(403).json({ success: false, error: 'Patients can only view their own connections' });
      return;
    }

    const connections = await wearableService.getActiveConnections(patientId);

    const response: ServiceResponse = {
      success: true,
      data: connections,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /wearables/alerts/:patientId — Get health alerts
wearableRouter.get('/alerts/:patientId', authorize('doctor', 'patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    const user = (req as any).user;

    // Patients can only access their own alerts
    if (user?.role === 'patient' && user?.userId !== patientId) {
      res.status(403).json({ success: false, error: 'Patients can only access their own data' });
      return;
    }

    // Doctors must have an active care relationship with the patient
    if (user?.role === 'doctor') {
      const rel = await queryOne('SELECT 1 FROM care_relationships WHERE doctor_id = $1 AND patient_id = $2 AND status = $3 LIMIT 1', [user.userId, patientId, 'active']);
      if (!rel) {
        res.status(403).json({ success: false, error: 'No active care relationship with this patient' });
        return;
      }
    }

    const { severity, acknowledged } = req.query;

    let sql = `SELECT id, patient_id AS "patientId", alert_type AS "alertType",
                      severity, message, data_type AS "dataType",
                      current_value AS "currentValue", normal_range AS "normalRange",
                      detected_at AS "detectedAt", acknowledged
               FROM health_alerts WHERE patient_id = $1`;
    const params: unknown[] = [patientId];

    if (severity) {
      params.push(severity);
      sql += ` AND severity = $${params.length}`;
    }

    if (acknowledged !== undefined) {
      params.push(acknowledged === 'true');
      sql += ` AND acknowledged = $${params.length}`;
    }

    sql += ` ORDER BY detected_at DESC LIMIT 50`;

    const alerts = await queryMany(sql, params);

    const response: ServiceResponse = {
      success: true,
      data: alerts,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1/wearables', wearableRouter);

// ─── Notification Routes ──────────────────────────────────────────────────────

const notificationRouter = express.Router();
notificationRouter.use(authenticate);
notificationRouter.param('patientId', (_req, res, next, value) => {
  if (!UUID_REGEX.test(value)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PARAM', message: 'patientId must be a valid UUID' } });
    return;
  }
  next();
});

notificationRouter.post('/schedule', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId, type, scheduledFor, payload } = req.body;

    if (!patientId || !type || !scheduledFor) {
      throw new ValidationError('patientId, type, and scheduledFor are required');
    }

    if (!UUID_REGEX.test(patientId)) {
      throw new ValidationError('patientId must be a valid UUID');
    }

    if (isNaN(new Date(scheduledFor).getTime())) {
      throw new ValidationError('scheduledFor must be a valid date');
    }

    // Doctors must have an active care relationship with the patient
    const user = (req as any).user;
    if (user?.role === 'doctor') {
      const rel = await queryOne('SELECT 1 FROM care_relationships WHERE doctor_id = $1 AND patient_id = $2 AND status = $3 LIMIT 1', [user.userId, patientId, 'active']);
      if (!rel) {
        res.status(403).json({ success: false, error: 'No active care relationship with this patient' });
        return;
      }
    }

    const validTypes = ['medication_reminder', 'follow_up_reminder', 'health_alert', 'weekly_summary'];
    if (!validTypes.includes(type)) {
      throw new ValidationError(`Invalid notification type. Must be one of: ${validTypes.join(', ')}`);
    }

    const id = uuidv4();

    await query(
      `INSERT INTO scheduled_notifications (id, patient_id, type, scheduled_for, status, payload, attempts, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5, 0, NOW())`,
      [id, patientId, type, scheduledFor, JSON.stringify(payload || {})]
    );

    const notification = await queryOne<ScheduledNotification>(
      `SELECT id, patient_id AS "patientId", type, scheduled_for AS "scheduledFor",
              status, payload, attempts, created_at AS "createdAt"
       FROM scheduled_notifications WHERE id = $1`,
      [id]
    );

    const response: ServiceResponse = {
      success: true,
      data: notification,
      message: 'Notification scheduled',
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

notificationRouter.get('/:patientId', authorize('doctor', 'patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    const user = (req as any).user;

    // Patients can only access their own notifications
    if (user?.role === 'patient' && user?.userId !== patientId) {
      res.status(403).json({ success: false, error: 'Patients can only access their own notifications' });
      return;
    }

    // Doctors must have an active care relationship with the patient
    if (user?.role === 'doctor') {
      const rel = await queryOne('SELECT 1 FROM care_relationships WHERE doctor_id = $1 AND patient_id = $2 AND status = $3 LIMIT 1', [user.userId, patientId, 'active']);
      if (!rel) {
        res.status(403).json({ success: false, error: 'No active care relationship with this patient' });
        return;
      }
    }

    const { status, type } = req.query;

    let sql = `SELECT id, patient_id AS "patientId", type, scheduled_for AS "scheduledFor",
                      status, payload, attempts, last_attempt_at AS "lastAttemptAt",
                      created_at AS "createdAt"
               FROM scheduled_notifications WHERE patient_id = $1`;
    const params: unknown[] = [patientId];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    sql += ` ORDER BY scheduled_for DESC LIMIT 100`;

    const notifications = await queryMany(sql, params);

    const response: ServiceResponse = {
      success: true,
      data: notifications,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1/notifications', notificationRouter);

// ─── Error Handling ───────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
