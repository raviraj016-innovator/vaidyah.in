import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { query, queryMany } from '../db';
import {
  WhatsAppSendRequest,
  WhatsAppTemplateSendRequest,
  WhatsAppMediaSendRequest,
  WhatsAppTemplateType,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppWebhookPayload,
  SupportedLanguage,
} from '../types';
import { ExternalServiceError } from '../middleware/errorHandler';

const SERVICE_NAME = 'WhatsApp';
const isDevMode = config.server.nodeEnv !== 'production';

// ─── Template Definitions ────────────────────────────────────────────────────

interface TemplateDefinition {
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  requiredParams: string[];
  description: string;
}

const TEMPLATE_DEFINITIONS: Record<WhatsAppTemplateType, TemplateDefinition> = {
  consultation_summary: {
    name: 'consultation_summary',
    category: 'UTILITY',
    requiredParams: ['patient_name', 'doctor_name', 'diagnosis', 'date'],
    description: 'Post-consultation summary with diagnosis and prescription details',
  },
  medication_reminder: {
    name: 'medication_reminder',
    category: 'UTILITY',
    requiredParams: ['patient_name', 'medication_name', 'dosage', 'time'],
    description: 'Reminder to take medication at the scheduled time',
  },
  follow_up_reminder: {
    name: 'follow_up_reminder',
    category: 'UTILITY',
    requiredParams: ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'clinic_name'],
    description: 'Reminder for upcoming follow-up appointment',
  },
  trial_notification: {
    name: 'trial_notification',
    category: 'UTILITY',
    requiredParams: ['patient_name', 'trial_name', 'action_required'],
    description: 'Clinical trial update or action required notification',
  },
  health_alert: {
    name: 'health_alert',
    category: 'UTILITY',
    requiredParams: ['patient_name', 'alert_type', 'current_value', 'normal_range'],
    description: 'Health metric anomaly alert from wearable data',
  },
  emergency_alert: {
    name: 'emergency_alert',
    category: 'UTILITY',
    requiredParams: ['patient_name', 'alert_message', 'action_required'],
    description: 'Emergency health alert requiring immediate action',
  },
};

// ─── Rate Limiter ────────────────────────────────────────────────────────────

class RateLimiter {
  private windowStart: number = Date.now();
  private messageCount: number = 0;
  private dailyStart: number = Date.now();
  private dailyTemplateCount: number = 0;

  canSend(): boolean {
    this.resetWindowIfNeeded();
    return this.messageCount < config.whatsapp.messagesPerSecond;
  }

  canSendTemplate(): boolean {
    this.resetDailyIfNeeded();
    return this.dailyTemplateCount < config.whatsapp.templateMessagesPerDay;
  }

  recordSend(): void {
    this.messageCount++;
  }

  recordTemplateSend(): void {
    this.dailyTemplateCount++;
  }

  private resetWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.messageCount = 0;
    }
  }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    if (now - this.dailyStart >= 86400000) {
      this.dailyStart = now;
      this.dailyTemplateCount = 0;
    }
  }
}

// ─── WhatsApp Service ────────────────────────────────────────────────────────

export class WhatsAppService {
  private rateLimiter = new RateLimiter();

  // ─── Send Free-Form Text Message ──────────────────────────────────────

  async sendMessage(request: WhatsAppSendRequest): Promise<{
    messageId: string;
    status: WhatsAppMessageStatus;
    whatsappMessageId?: string;
  }> {
    const messageId = uuidv4();

    // Persist to DB
    try {
      await query(
        `INSERT INTO whatsapp_messages (id, patient_id, phone_number, direction, message_type, content, language, status, created_at)
         VALUES ($1, $2, $3, 'outbound', 'text', $4, $5, 'queued', NOW())`,
        [messageId, request.patientId, request.phoneNumber, request.message, request.language || 'en']
      );
    } catch (dbError) {
      if (isDevMode) {
        console.warn('[WhatsApp] Dev mode: could not persist message to DB:', dbError instanceof Error ? dbError.message : dbError);
      } else {
        throw dbError;
      }
    }

    // Dev mode: log instead of sending
    if (isDevMode) {
      console.log(`[WhatsApp] Dev mode: would send message to ${request.phoneNumber}`);
      console.log(`[WhatsApp]   Patient: ${request.patientId}`);
      console.log(`[WhatsApp]   Message: ${request.message}`);
      console.log(`[WhatsApp]   Language: ${request.language || 'en'}`);

      try {
        await query(
          `UPDATE whatsapp_messages SET status = 'sent', whatsapp_message_id = $1, sent_at = NOW() WHERE id = $2`,
          [`dev-mock-${messageId}`, messageId]
        );
      } catch {
        // DB not available in dev
      }

      return {
        messageId,
        status: 'sent',
        whatsappMessageId: `dev-mock-${messageId}`,
      };
    }

    // Rate limiting check
    if (!this.rateLimiter.canSend()) {
      try {
        await query(
          `UPDATE whatsapp_messages SET status = 'failed', error_message = 'Rate limit exceeded' WHERE id = $1`,
          [messageId]
        );
      } catch { /* non-critical */ }
      throw new ExternalServiceError(SERVICE_NAME, 'Message rate limit exceeded. Please try again later.');
    }

    // Send via Meta Cloud API
    const waPayload = {
      messaging_product: 'whatsapp',
      to: request.phoneNumber.replace('+', ''),
      type: 'text',
      text: { body: request.message },
    };

    return this.sendToWhatsAppApi(messageId, waPayload);
  }

  // ─── Send Template Message ────────────────────────────────────────────

  async sendTemplateMessage(request: WhatsAppTemplateSendRequest): Promise<{
    messageId: string;
    status: WhatsAppMessageStatus;
    whatsappMessageId?: string;
  }> {
    const messageId = uuidv4();

    // Validate template parameters
    const templateDef = TEMPLATE_DEFINITIONS[request.templateType];
    if (!templateDef) {
      throw new ExternalServiceError(SERVICE_NAME, `Unknown template type: ${request.templateType}`);
    }

    const missingParams = templateDef.requiredParams.filter((p) => !request.parameters[p]);
    if (missingParams.length > 0) {
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Missing required template parameters: ${missingParams.join(', ')}`
      );
    }

    // Persist to DB
    try {
      await query(
        `INSERT INTO whatsapp_messages (id, patient_id, phone_number, direction, message_type, template_type, content, language, status, created_at)
         VALUES ($1, $2, $3, 'outbound', 'template', $4, $5, $6, 'queued', NOW())`,
        [
          messageId,
          request.patientId,
          request.phoneNumber,
          request.templateType,
          JSON.stringify(request.parameters),
          request.language,
        ]
      );
    } catch (dbError) {
      if (isDevMode) {
        console.warn('[WhatsApp] Dev mode: could not persist template message to DB:', dbError instanceof Error ? dbError.message : dbError);
      } else {
        throw dbError;
      }
    }

    // Dev mode
    if (isDevMode) {
      console.log(`[WhatsApp] Dev mode: would send template message to ${request.phoneNumber}`);
      console.log(`[WhatsApp]   Template: ${request.templateType}`);
      console.log(`[WhatsApp]   Language: ${request.language}`);
      console.log(`[WhatsApp]   Parameters:`, JSON.stringify(request.parameters, null, 2));

      try {
        await query(
          `UPDATE whatsapp_messages SET status = 'sent', whatsapp_message_id = $1, sent_at = NOW() WHERE id = $2`,
          [`dev-mock-tpl-${messageId}`, messageId]
        );
      } catch { /* non-critical */ }

      return {
        messageId,
        status: 'sent',
        whatsappMessageId: `dev-mock-tpl-${messageId}`,
      };
    }

    // Rate limiting
    if (!this.rateLimiter.canSend() || !this.rateLimiter.canSendTemplate()) {
      try {
        await query(
          `UPDATE whatsapp_messages SET status = 'failed', error_message = 'Rate limit exceeded' WHERE id = $1`,
          [messageId]
        );
      } catch { /* non-critical */ }
      throw new ExternalServiceError(SERVICE_NAME, 'Template message rate limit exceeded. Please try again later.');
    }

    // Build template components
    const templateComponents = [{
      type: 'body',
      parameters: Object.values(request.parameters).map((value) => ({
        type: 'text',
        text: value,
      })),
    }];

    const waPayload = {
      messaging_product: 'whatsapp',
      to: request.phoneNumber.replace('+', ''),
      type: 'template',
      template: {
        name: request.templateType,
        language: { code: this.getWhatsAppLanguageCode(request.language) },
        components: templateComponents,
      },
    };

    this.rateLimiter.recordTemplateSend();
    return this.sendToWhatsAppApi(messageId, waPayload);
  }

  // ─── Send Media Message ───────────────────────────────────────────────

  async sendMediaMessage(request: WhatsAppMediaSendRequest): Promise<{
    messageId: string;
    status: WhatsAppMessageStatus;
    whatsappMessageId?: string;
  }> {
    const messageId = uuidv4();

    // Persist to DB
    try {
      await query(
        `INSERT INTO whatsapp_messages (id, patient_id, phone_number, direction, message_type, content, language, status, created_at)
         VALUES ($1, $2, $3, 'outbound', 'media', $4, $5, 'queued', NOW())`,
        [
          messageId,
          request.patientId,
          request.phoneNumber,
          JSON.stringify({ mediaType: request.mediaType, mediaUrl: request.mediaUrl, caption: request.caption, filename: request.filename }),
          request.language || 'en',
        ]
      );
    } catch (dbError) {
      if (isDevMode) {
        console.warn('[WhatsApp] Dev mode: could not persist media message to DB:', dbError instanceof Error ? dbError.message : dbError);
      } else {
        throw dbError;
      }
    }

    // Dev mode
    if (isDevMode) {
      console.log(`[WhatsApp] Dev mode: would send ${request.mediaType} message to ${request.phoneNumber}`);
      console.log(`[WhatsApp]   Media URL: ${request.mediaUrl}`);
      console.log(`[WhatsApp]   Caption: ${request.caption || '(none)'}`);

      try {
        await query(
          `UPDATE whatsapp_messages SET status = 'sent', whatsapp_message_id = $1, sent_at = NOW() WHERE id = $2`,
          [`dev-mock-media-${messageId}`, messageId]
        );
      } catch { /* non-critical */ }

      return {
        messageId,
        status: 'sent',
        whatsappMessageId: `dev-mock-media-${messageId}`,
      };
    }

    // Rate limiting
    if (!this.rateLimiter.canSend()) {
      try {
        await query(
          `UPDATE whatsapp_messages SET status = 'failed', error_message = 'Rate limit exceeded' WHERE id = $1`,
          [messageId]
        );
      } catch { /* non-critical */ }
      throw new ExternalServiceError(SERVICE_NAME, 'Media message rate limit exceeded.');
    }

    // Build media payload
    const mediaPayload: Record<string, unknown> = {
      link: request.mediaUrl,
    };

    if (request.caption) {
      mediaPayload.caption = request.caption;
    }

    if (request.mediaType === 'document' && request.filename) {
      mediaPayload.filename = request.filename;
    }

    const waPayload = {
      messaging_product: 'whatsapp',
      to: request.phoneNumber.replace('+', ''),
      type: request.mediaType,
      [request.mediaType]: mediaPayload,
    };

    return this.sendToWhatsAppApi(messageId, waPayload);
  }

  // ─── Process Webhook Events ───────────────────────────────────────────

  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!config.whatsapp.appSecret) {
      console.error('[WhatsApp] App secret is not configured');
      return false;
    }

    const expectedSig = 'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret)
      .update(rawBody)
      .digest('hex');

    const sigHash = crypto.createHash('sha256').update(signature).digest();
    const expectedHash = crypto.createHash('sha256').update(expectedSig).digest();

    return crypto.timingSafeEqual(sigHash, expectedHash);
  }

  verifyWebhookSubscription(mode: string, token: string): boolean {
    return mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken;
  }

  async processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<{
    statusUpdates: number;
    inboundMessages: number;
  }> {
    let statusUpdates = 0;
    let inboundMessages = 0;

    if (!payload.entry?.length) {
      return { statusUpdates, inboundMessages };
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        // Process status updates
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

            try {
              await query(updateQuery, params);
              statusUpdates++;
            } catch (dbError) {
              console.error(`[WhatsApp] Failed to update status for ${status.id}:`, dbError instanceof Error ? dbError.message : dbError);
            }
          }
        }

        // Process inbound messages
        if (change.value.messages) {
          for (const message of change.value.messages) {
            const inboundId = uuidv4();

            try {
              await query(
                `INSERT INTO whatsapp_messages (id, phone_number, direction, message_type, content, language, status, whatsapp_message_id, sent_at, created_at)
                 VALUES ($1, $2, 'inbound', $3, $4, 'en', 'delivered', $5, to_timestamp($6::bigint), NOW())
                 ON CONFLICT (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL DO NOTHING`,
                [
                  inboundId,
                  message.from,
                  message.type,
                  message.text?.body || JSON.stringify(message.interactive || {}),
                  message.id,
                  message.timestamp,
                ]
              );
              inboundMessages++;
            } catch (dbError) {
              console.error(`[WhatsApp] Failed to store inbound message ${message.id}:`, dbError instanceof Error ? dbError.message : dbError);
            }

            // Log inbound messages for dev mode analysis
            if (isDevMode) {
              console.log(`[WhatsApp] Inbound message from ${message.from}: ${message.text?.body || message.type}`);
            }
          }
        }
      }
    }

    return { statusUpdates, inboundMessages };
  }

  // ─── Message History ──────────────────────────────────────────────────

  async getMessageHistory(
    patientId: string,
    options?: { limit?: number; direction?: 'inbound' | 'outbound'; status?: WhatsAppMessageStatus },
  ): Promise<WhatsAppMessage[]> {
    let sql = `SELECT id, patient_id AS "patientId", phone_number AS "phoneNumber",
                      direction, message_type AS "messageType", template_type AS "templateType",
                      content, language, status,
                      whatsapp_message_id AS "whatsappMessageId",
                      error_code AS "errorCode", error_message AS "errorMessage",
                      sent_at AS "sentAt", delivered_at AS "deliveredAt", read_at AS "readAt",
                      created_at AS "createdAt"
               FROM whatsapp_messages WHERE patient_id = $1`;
    const params: unknown[] = [patientId];

    if (options?.direction) {
      params.push(options.direction);
      sql += ` AND direction = $${params.length}`;
    }

    if (options?.status) {
      params.push(options.status);
      sql += ` AND status = $${params.length}`;
    }

    const limit = Math.min(options?.limit || 50, 200);
    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    return queryMany<WhatsAppMessage>(sql, params);
  }

  // ─── Template Info ────────────────────────────────────────────────────

  getAvailableTemplates(): Record<WhatsAppTemplateType, TemplateDefinition> {
    return { ...TEMPLATE_DEFINITIONS };
  }

  getTemplateInfo(templateType: WhatsAppTemplateType): TemplateDefinition | null {
    return TEMPLATE_DEFINITIONS[templateType] || null;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async sendToWhatsAppApi(
    messageId: string,
    waPayload: Record<string, unknown>,
  ): Promise<{ messageId: string; status: WhatsAppMessageStatus; whatsappMessageId?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.whatsapp.maxRetries; attempt++) {
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

        const waData = await waResponse.json() as {
          messages?: Array<{ id: string }>;
          error?: { message: string; code: number };
        };

        if (waResponse.ok && waData.messages?.[0]?.id) {
          const whatsappMessageId = waData.messages[0].id;

          this.rateLimiter.recordSend();

          try {
            await query(
              `UPDATE whatsapp_messages SET status = 'sent', whatsapp_message_id = $1, sent_at = NOW() WHERE id = $2`,
              [whatsappMessageId, messageId]
            );
          } catch { /* non-critical */ }

          return {
            messageId,
            status: 'sent',
            whatsappMessageId,
          };
        }

        // Non-retryable error (4xx)
        if (waResponse.status >= 400 && waResponse.status < 500) {
          const errorMsg = waData.error?.message || JSON.stringify(waData);
          try {
            await query(
              `UPDATE whatsapp_messages SET status = 'failed', error_code = $1, error_message = $2 WHERE id = $3`,
              [String(waData.error?.code || waResponse.status), errorMsg, messageId]
            );
          } catch { /* non-critical */ }

          return {
            messageId,
            status: 'failed',
          };
        }

        // Server error — retry
        lastError = new Error(`WhatsApp API returned ${waResponse.status}`);
      } catch (sendError) {
        lastError = sendError instanceof Error ? sendError : new Error('Send failed');
      }

      // Wait before retry (exponential backoff)
      if (attempt < config.whatsapp.maxRetries) {
        const delay = config.whatsapp.retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    const errorMsg = lastError?.message || 'Send failed after all retries';
    try {
      await query(
        `UPDATE whatsapp_messages SET status = 'failed', error_message = $1 WHERE id = $2`,
        [errorMsg, messageId]
      );
    } catch { /* non-critical */ }

    return {
      messageId,
      status: 'failed',
    };
  }

  private getWhatsAppLanguageCode(language: SupportedLanguage): string {
    const languageCodes: Record<SupportedLanguage, string> = {
      en: 'en_US',
      hi: 'hi_IN',
      bn: 'bn_IN',
      ta: 'ta_IN',
      te: 'te_IN',
      mr: 'mr_IN',
    };
    return languageCodes[language] || 'en_US';
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const whatsappService = new WhatsAppService();
