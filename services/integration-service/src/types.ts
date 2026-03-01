import { z } from 'zod';

// ─── Common ──────────────────────────────────────────────────────────────────

export interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ServiceResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── ABDM Types ──────────────────────────────────────────────────────────────

export interface ABDMSessionToken {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  refreshToken?: string;
  issuedAt: number;
}

export interface ABHAVerificationRequest {
  abhaId: string;
  authMethod: 'AADHAAR_OTP' | 'MOBILE_OTP' | 'DEMOGRAPHICS';
  purpose: 'KYC' | 'LINK' | 'AUTH';
}

export interface ABHAVerificationResponse {
  verified: boolean;
  abhaNumber: string;
  abhaAddress: string;
  name: string;
  yearOfBirth: string;
  gender: 'M' | 'F' | 'O';
  mobile: string;
  healthId: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEACTIVATED';
}

export type ConsentPurpose =
  | 'CAREMGT'
  | 'BTG'
  | 'PUBHLTH'
  | 'HPAYMT'
  | 'DSRCH'
  | 'PATRQT';

export type HIType =
  | 'OPConsultation'
  | 'Prescription'
  | 'DischargeSummary'
  | 'DiagnosticReport'
  | 'ImmunizationRecord'
  | 'HealthDocumentRecord'
  | 'WellnessRecord';

export interface ConsentRequest {
  patientId: string;
  abhaAddress: string;
  purpose: ConsentPurpose;
  hiTypes: HIType[];
  dateRange: {
    from: string; // ISO date
    to: string;
  };
  expiry: string; // ISO datetime
  hipId?: string;
}

export type ConsentStatus =
  | 'REQUESTED'
  | 'GRANTED'
  | 'DENIED'
  | 'EXPIRED'
  | 'REVOKED';

export interface ConsentArtifact {
  consentId: string;
  requestId: string;
  status: ConsentStatus;
  consentDetail: {
    purpose: { code: ConsentPurpose; text: string };
    patient: { id: string };
    hip: { id: string; name: string };
    hiTypes: HIType[];
    permission: {
      accessMode: 'VIEW' | 'STORE' | 'QUERY' | 'STREAM';
      dateRange: { from: string; to: string };
      dataEraseAt: string;
      frequency: { unit: string; value: number; repeats: number };
    };
  };
  signature: string;
  grantedAt: string;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  id: string;
  type: 'collection' | 'document' | 'searchset';
  timestamp: string;
  entry: FHIRBundleEntry[];
}

export interface FHIRBundleEntry {
  fullUrl?: string;
  resource: FHIRResource;
}

export interface FHIRResource {
  resourceType: string;
  id: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
    profile?: string[];
  };
  [key: string]: unknown;
}

export interface HealthRecord {
  id: string;
  patientId: string;
  recordType: HIType;
  sourceHipId: string;
  sourceHipName: string;
  fhirBundle: FHIRBundle;
  summary: string;
  recordDate: string;
  fetchedAt: string;
  consentArtifactId: string;
}

export interface ConsultationPushRequest {
  patientId: string;
  abhaAddress: string;
  consultationId: string;
  doctorId: string;
  diagnosis: string[];
  prescriptions: PrescriptionItem[];
  vitals?: VitalRecord[];
  notes?: string;
  followUpDate?: string;
}

export interface PrescriptionItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface VitalRecord {
  type: 'blood_pressure' | 'heart_rate' | 'temperature' | 'spo2' | 'blood_glucose' | 'weight' | 'height';
  value: string;
  unit: string;
  measuredAt: string;
}

// ─── Wearable Types ──────────────────────────────────────────────────────────

export type WearablePlatform = 'apple_health' | 'google_fit';

export type WearableDataType =
  | 'heart_rate'
  | 'steps'
  | 'blood_glucose'
  | 'spo2'
  | 'sleep'
  | 'blood_pressure'
  | 'weight'
  | 'calories_burned'
  | 'active_minutes';

export interface WearableConnection {
  id: string;
  patientId: string;
  platform: WearablePlatform;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
  connectedAt: string;
  lastSyncAt?: string;
  isActive: boolean;
}

export interface WearableConnectRequest {
  patientId: string;
  platform: WearablePlatform;
  authorizationCode: string;
  redirectUri: string;
}

export interface NormalizedWearableData {
  id: string;
  patientId: string;
  platform: WearablePlatform;
  dataType: WearableDataType;
  value: number;
  unit: string;
  startTime: string;
  endTime: string;
  metadata?: Record<string, unknown>;
  syncedAt: string;
}

export interface WearableSyncResult {
  patientId: string;
  platform: WearablePlatform;
  recordsSynced: number;
  dataTypes: WearableDataType[];
  syncStartedAt: string;
  syncCompletedAt: string;
  errors?: string[];
}

export interface HealthTrend {
  dataType: WearableDataType;
  period: '7d' | '30d' | '90d';
  average: number;
  min: number;
  max: number;
  unit: string;
  dataPoints: TrendDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
}

export interface HealthAlert {
  id: string;
  patientId: string;
  alertType: 'glucose_spike' | 'abnormal_heart_rate' | 'low_spo2' | 'irregular_sleep' | 'high_blood_pressure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  dataType: WearableDataType;
  currentValue: number;
  normalRange: { min: number; max: number };
  detectedAt: string;
  acknowledged: boolean;
}

// ─── WhatsApp Types ──────────────────────────────────────────────────────────

export type SupportedLanguage = 'en' | 'hi' | 'bn' | 'ta' | 'te' | 'mr';

export type WhatsAppTemplateType =
  | 'medication_reminder'
  | 'follow_up_reminder'
  | 'trial_notification'
  | 'health_alert'
  | 'consultation_summary';

export interface WhatsAppSendRequest {
  patientId: string;
  phoneNumber: string;
  message: string;
  language?: SupportedLanguage;
}

export interface WhatsAppTemplateSendRequest {
  patientId: string;
  phoneNumber: string;
  templateType: WhatsAppTemplateType;
  language: SupportedLanguage;
  parameters: Record<string, string>;
}

export type WhatsAppMessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export interface WhatsAppMessage {
  id: string;
  patientId: string;
  phoneNumber: string;
  direction: 'outbound' | 'inbound';
  messageType: 'text' | 'template' | 'interactive' | 'media';
  templateType?: WhatsAppTemplateType;
  content: string;
  language: SupportedLanguage;
  status: WhatsAppMessageStatus;
  whatsappMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: {
    messaging_product: string;
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: Array<{ profile: { name: string }; wa_id: string }>;
    messages?: Array<{
      from: string;
      id: string;
      timestamp: string;
      type: string;
      text?: { body: string };
      interactive?: { type: string; button_reply?: { id: string; title: string } };
    }>;
    statuses?: Array<{
      id: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
      timestamp: string;
      recipient_id: string;
      errors?: Array<{ code: number; title: string }>;
    }>;
  };
  field: string;
}

// ─── Notification Scheduler Types ────────────────────────────────────────────

export interface ScheduledNotification {
  id: string;
  patientId: string;
  type: 'medication_reminder' | 'follow_up_reminder' | 'health_alert' | 'weekly_summary';
  scheduledFor: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  payload: Record<string, string>;
  attempts: number;
  lastAttemptAt?: string;
  createdAt: string;
}

export interface MedicationSchedule {
  patientId: string;
  phoneNumber: string;
  language: SupportedLanguage;
  patientName: string;
  medications: Array<{
    name: string;
    dosage: string;
    times: string[]; // ["08:00", "14:00", "20:00"]
  }>;
}

export interface FollowUpSchedule {
  patientId: string;
  phoneNumber: string;
  language: SupportedLanguage;
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicName: string;
}

// ─── Zod Validation Schemas ──────────────────────────────────────────────────

export const ABHAVerificationSchema = z.object({
  abhaId: z.string().min(1, 'ABHA ID is required'),
  authMethod: z.enum(['AADHAAR_OTP', 'MOBILE_OTP', 'DEMOGRAPHICS']),
  purpose: z.enum(['KYC', 'LINK', 'AUTH']).default('AUTH'),
});

export const ConsentRequestSchema = z.object({
  patientId: z.string().uuid('Invalid patient ID'),
  abhaAddress: z.string().min(1, 'ABHA address is required'),
  purpose: z.enum(['CAREMGT', 'BTG', 'PUBHLTH', 'HPAYMT', 'DSRCH', 'PATRQT']).default('CAREMGT'),
  hiTypes: z.array(
    z.enum([
      'OPConsultation',
      'Prescription',
      'DischargeSummary',
      'DiagnosticReport',
      'ImmunizationRecord',
      'HealthDocumentRecord',
      'WellnessRecord',
    ])
  ).min(1, 'At least one HI type is required'),
  dateRange: z.object({
    from: z.string().datetime({ message: 'Invalid from date' }),
    to: z.string().datetime({ message: 'Invalid to date' }),
  }),
  expiry: z.string().datetime({ message: 'Invalid expiry date' }),
  hipId: z.string().optional(),
});

export const ConsultationPushSchema = z.object({
  patientId: z.string().uuid(),
  abhaAddress: z.string().min(1),
  consultationId: z.string().uuid(),
  doctorId: z.string().uuid(),
  diagnosis: z.array(z.string()).min(1),
  prescriptions: z.array(
    z.object({
      medicineName: z.string().min(1),
      dosage: z.string().min(1),
      frequency: z.string().min(1),
      duration: z.string().min(1),
      instructions: z.string().optional(),
    })
  ),
  vitals: z
    .array(
      z.object({
        type: z.enum([
          'blood_pressure',
          'heart_rate',
          'temperature',
          'spo2',
          'blood_glucose',
          'weight',
          'height',
        ]),
        value: z.string(),
        unit: z.string(),
        measuredAt: z.string().datetime(),
      })
    )
    .optional(),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
});

export const WearableConnectSchema = z.object({
  patientId: z.string().uuid(),
  platform: z.enum(['apple_health', 'google_fit']),
  authorizationCode: z.string().min(1),
  redirectUri: z.string().url(),
});

export const WhatsAppSendSchema = z.object({
  patientId: z.string().uuid(),
  phoneNumber: z.string().regex(/^\+91\d{10}$/, 'Phone number must be in +91XXXXXXXXXX format'),
  message: z.string().min(1).max(4096),
  language: z.enum(['en', 'hi', 'bn', 'ta', 'te', 'mr']).default('en'),
});

export const WhatsAppTemplateSendSchema = z.object({
  patientId: z.string().uuid(),
  phoneNumber: z.string().regex(/^\+91\d{10}$/, 'Phone number must be in +91XXXXXXXXXX format'),
  templateType: z.enum([
    'medication_reminder',
    'follow_up_reminder',
    'trial_notification',
    'health_alert',
    'consultation_summary',
  ]),
  language: z.enum(['en', 'hi', 'bn', 'ta', 'te', 'mr']),
  parameters: z.record(z.string()),
});

// ─── Express Extensions ──────────────────────────────────────────────────────

export interface AuthenticatedUser {
  userId: string;
  role: 'doctor' | 'patient' | 'admin' | 'system';
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
