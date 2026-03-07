import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import config from './config';
import { healthCheck as dbHealthCheck } from './db';
import { authenticate, authorize } from './middleware/auth';
import { errorHandler, notFoundHandler, ValidationError } from './middleware/errorHandler';
import { abdmService } from './services/abdm';
import {
  ServiceResponse,
  ABHAVerificationSchema,
  ConsentRequestSchema,
  ConsultationPushSchema,
  WearableConnectSchema,
  WhatsAppSendSchema,
  WhatsAppTemplateSendSchema,
  WhatsAppWebhookPayload,
  ScheduledNotification,
} from './types';
import { query, queryOne, queryMany } from './db';

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

abdmRouter.get('/records/:patientId', authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params;
    const records = await abdmService.pullHealthRecords(patientId);

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

app.use('/api/v1/abdm', abdmRouter);

// ─── WhatsApp Routes ──────────────────────────────────────────────────────────

const whatsappRouter = express.Router();

whatsappRouter.post('/send', authenticate, authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WhatsAppSendSchema.parse(req.body);
    const messageId = uuidv4();

    await query(
      `INSERT INTO whatsapp_messages (id, patient_id, phone_number, direction, message_type, content, language, status, created_at)
       VALUES ($1, $2, $3, 'outbound', 'text', $4, $5, 'queued', NOW())`,
      [messageId, validated.patientId, validated.phoneNumber, validated.message, validated.language]
    );

    const waPayload = {
      messaging_product: 'whatsapp',
      to: validated.phoneNumber.replace('+', ''),
      type: 'text',
      text: { body: validated.message },
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const waResponse = await fetch(
        `${config.whatsapp.apiUrl}/${config.whatsapp.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(waPayload),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const waData = await waResponse.json() as { messages?: Array<{ id: string }> };

      if (waResponse.ok && waData.messages?.[0]?.id) {
        await query(
          `UPDATE whatsapp_messages SET status = 'sent', whatsapp_message_id = $1, sent_at = NOW() WHERE id = $2`,
          [waData.messages[0].id, messageId]
        );
      } else {
        await query(
          `UPDATE whatsapp_messages SET status = 'failed', error_message = $1 WHERE id = $2`,
          [JSON.stringify(waData), messageId]
        );
      }
    } catch (sendError) {
      await query(
        `UPDATE whatsapp_messages SET status = 'failed', error_message = $1 WHERE id = $2`,
        [sendError instanceof Error ? sendError.message : 'Send failed', messageId]
      );
    }

    const message = await queryOne<{ status: string }>(
      `SELECT id, patient_id, phone_number, status, whatsapp_message_id, created_at FROM whatsapp_messages WHERE id = $1`,
      [messageId]
    );

    if (!message) {
      const response: ServiceResponse = {
        success: false,
        error: 'Failed to retrieve created message',
        timestamp: new Date().toISOString(),
      };
      res.status(500).json(response);
      return;
    }

    const isFailed = message.status === 'failed';
    const response: ServiceResponse = {
      success: !isFailed,
      data: message,
      ...(isFailed && { error: 'WhatsApp message send failed' }),
      timestamp: new Date().toISOString(),
    };
    res.status(isFailed ? 502 : 201).json(response);
  } catch (error) {
    next(error);
  }
});

whatsappRouter.post('/template', authenticate, authorize('doctor', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WhatsAppTemplateSendSchema.parse(req.body);
    const messageId = uuidv4();

    await query(
      `INSERT INTO whatsapp_messages (id, patient_id, phone_number, direction, message_type, template_type, content, language, status, created_at)
       VALUES ($1, $2, $3, 'outbound', 'template', $4, $5, $6, 'queued', NOW())`,
      [
        messageId,
        validated.patientId,
        validated.phoneNumber,
        validated.templateType,
        JSON.stringify(validated.parameters),
        validated.language,
      ]
    );

    const templateComponents = [{
      type: 'body',
      parameters: Object.values(validated.parameters).map(value => ({
        type: 'text',
        text: value,
      })),
    }];

    const waPayload = {
      messaging_product: 'whatsapp',
      to: validated.phoneNumber.replace('+', ''),
      type: 'template',
      template: {
        name: validated.templateType,
        language: { code: validated.language === 'en' ? 'en_US' : `${validated.language}_IN` },
        components: templateComponents,
      },
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const waResponse = await fetch(
        `${config.whatsapp.apiUrl}/${config.whatsapp.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(waPayload),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const waData = await waResponse.json() as { messages?: Array<{ id: string }> };

      if (waResponse.ok && waData.messages?.[0]?.id) {
        await query(
          `UPDATE whatsapp_messages SET status = 'sent', whatsapp_message_id = $1, sent_at = NOW() WHERE id = $2`,
          [waData.messages[0].id, messageId]
        );
      } else {
        await query(
          `UPDATE whatsapp_messages SET status = 'failed', error_message = $1 WHERE id = $2`,
          [JSON.stringify(waData), messageId]
        );
      }
    } catch (sendError) {
      await query(
        `UPDATE whatsapp_messages SET status = 'failed', error_message = $1 WHERE id = $2`,
        [sendError instanceof Error ? sendError.message : 'Send failed', messageId]
      );
    }

    const message = await queryOne(
      `SELECT id, patient_id, phone_number, template_type, status, whatsapp_message_id, created_at FROM whatsapp_messages WHERE id = $1`,
      [messageId]
    );

    const isFailed = (message as any)?.status === 'failed';
    const response: ServiceResponse = {
      success: !isFailed,
      data: message,
      ...(isFailed && { error: 'WhatsApp template message send failed' }),
      timestamp: new Date().toISOString(),
    };
    res.status(isFailed ? 502 : 201).json(response);
  } catch (error) {
    next(error);
  }
});

whatsappRouter.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: 'Verification failed' });
  }
});

whatsappRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify Meta/WhatsApp webhook signature
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }
    if (!config.whatsapp.appSecret) {
      console.error('[Webhook] WhatsApp appSecret is not configured — rejecting webhook');
      res.status(500).json({ error: 'Webhook signature verification is not configured' });
      return;
    }
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error('[Webhook] rawBody not preserved — ensure body parser verify function is configured');
      res.status(500).json({ error: 'Webhook verification misconfigured' });
      return;
    }
    const expectedSig = 'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret)
      .update(rawBody)
      .digest('hex');
    // Hash both to ensure equal length, then use timingSafeEqual to prevent timing attacks
    const sigHash = crypto.createHash('sha256').update(signature).digest();
    const expectedHash = crypto.createHash('sha256').update(expectedSig).digest();
    if (!crypto.timingSafeEqual(sigHash, expectedHash)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const payload = req.body as WhatsAppWebhookPayload;

    if (!payload.entry?.length) {
      res.sendStatus(200);
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.value.statuses) {
          for (const status of change.value.statuses) {
            const statusMap: Record<string, string> = {
              sent: 'sent',
              delivered: 'delivered',
              read: 'read',
              failed: 'failed',
            };

            const mappedStatus = statusMap[status.status] || status.status;
            const timestampField = status.status === 'delivered' ? 'delivered_at' : status.status === 'read' ? 'read_at' : null;

            let updateQuery = `UPDATE whatsapp_messages SET status = $1`;
            const params: unknown[] = [mappedStatus];

            if (timestampField) {
              updateQuery += `, ${timestampField} = NOW()`;
            }

            if (status.status === 'failed' && status.errors?.length) {
              updateQuery += `, error_code = $${params.length + 1}, error_message = $${params.length + 2}`;
              params.push(String(status.errors[0].code), status.errors[0].title);
            }

            updateQuery += ` WHERE whatsapp_message_id = $${params.length + 1}`;
            params.push(status.id);

            await query(updateQuery, params);
          }
        }

        if (change.value.messages) {
          for (const message of change.value.messages) {
            const inboundId = uuidv4();

            await query(
              `INSERT INTO whatsapp_messages (id, phone_number, direction, message_type, content, language, status, whatsapp_message_id, sent_at, created_at)
               VALUES ($1, $2, 'inbound', $3, $4, 'en', 'delivered', $5, to_timestamp($6::bigint), NOW())
               ON CONFLICT (whatsapp_message_id) DO NOTHING`,
              [
                inboundId,
                message.from,
                message.type,
                message.text?.body || JSON.stringify(message.interactive || {}),
                message.id,
                message.timestamp,
              ]
            );
          }
        }
      }
    }

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

wearableRouter.post('/sync', authorize('patient', 'admin', 'system'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = WearableConnectSchema.parse(req.body);

    if (req.user?.role === 'patient' && req.user?.userId !== validated.patientId) {
      res.status(403).json({
        success: false,
        error: 'Patients can only sync their own wearable data',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const syncId = uuidv4();
    const syncStartedAt = new Date().toISOString();

    let tokenEndpoint: string;
    let tokenPayload: Record<string, string>;

    if (validated.platform === 'google_fit') {
      tokenEndpoint = config.wearables.googleFit.tokenUrl;
      tokenPayload = {
        grant_type: 'authorization_code',
        code: validated.authorizationCode,
        redirect_uri: validated.redirectUri,
        client_id: config.wearables.googleFit.clientId,
        client_secret: config.wearables.googleFit.clientSecret,
      };
    } else {
      tokenEndpoint = `${config.wearables.appleHealth.serverUrl}/auth/token`;
      tokenPayload = {
        grant_type: 'authorization_code',
        code: validated.authorizationCode,
        redirect_uri: validated.redirectUri,
      };
    }

    let syncResult;
    try {
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 10000);
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenPayload),
        signal: fetchController.signal,
      });
      clearTimeout(fetchTimeout);

      if (!tokenResponse.ok) {
        throw new Error(`Token endpoint returned ${tokenResponse.status}`);
      }
      const tokenData = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
      if (!tokenData.access_token) {
        throw new Error(`Token fetch failed: ${tokenData.error || 'Missing access_token'}`);
      }

      await query(
        `INSERT INTO wearable_connections (id, patient_id, platform, access_token, refresh_token, expires_at, scopes, connected_at, last_sync_at, is_active)
         VALUES ($1, $2, $3, $4, $5, NOW() + interval '1 second' * $6, $7, NOW(), NOW(), true)
         ON CONFLICT (patient_id, platform) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at,
           last_sync_at = NOW(),
           is_active = true`,
        [
          uuidv4(),
          validated.patientId,
          validated.platform,
          tokenData.access_token,
          tokenData.refresh_token,
          tokenData.expires_in || 3600,
          tokenData.scope || '',
        ]
      );

      syncResult = {
        syncId,
        patientId: validated.patientId,
        platform: validated.platform,
        status: 'completed',
        syncStartedAt,
        syncCompletedAt: new Date().toISOString(),
      };
    } catch (syncError) {
      syncResult = {
        syncId,
        patientId: validated.patientId,
        platform: validated.platform,
        status: 'failed',
        error: syncError instanceof Error ? syncError.message : 'Sync failed',
        syncStartedAt,
        syncCompletedAt: new Date().toISOString(),
      };
    }

    const response: ServiceResponse = {
      success: syncResult.status === 'completed',
      data: syncResult,
      timestamp: new Date().toISOString(),
    };
    res.status(syncResult.status === 'completed' ? 200 : 502).json(response);
  } catch (error) {
    next(error);
  }
});

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
    const { dataType, from, to, limit: queryLimit } = req.query;

    // Validate dataType against whitelist to prevent enumeration
    const VALID_DATA_TYPES = [
      'heart_rate', 'steps', 'blood_glucose', 'spo2', 'sleep',
      'blood_pressure', 'weight', 'calories_burned', 'active_minutes',
      'temperature', 'respiratory_rate',
    ];
    if (dataType && !VALID_DATA_TYPES.includes(String(dataType))) {
      res.status(400).json({ success: false, error: 'Invalid dataType' });
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
