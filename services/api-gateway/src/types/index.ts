import { Request } from 'express';

// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'nurse' | 'doctor' | 'admin' | 'system';

export interface AuthenticatedUser {
  sub: string;           // Cognito user ID
  email: string;
  name: string;
  role: UserRole;
  facilityId?: string;   // Healthcare facility the user belongs to
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  requestId: string;
  startTime: number;
}

// ─── API Responses ──────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    requestId?: string;
    warning?: string;
  };
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface ConsultationSession {
  id: string;
  patientId: string;
  nurseId: string;
  doctorId?: string;
  facilityId: string;
  status: SessionStatus;
  chiefComplaint?: string;
  language: string;
  triageLevel?: number;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionPayload {
  patientId: string;
  nurseId: string;
  facilityId: string;
  chiefComplaint?: string;
  language?: string;
}

export interface UpdateSessionPayload {
  status?: SessionStatus;
  doctorId?: string;
  chiefComplaint?: string;
  triageLevel?: number;
}

// ─── Patients ───────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  abdmId?: string;
  name: string;
  phone: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  district?: string;
  state?: string;
  pincode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatientPayload {
  name: string;
  phone: string;
  abdmId?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  district?: string;
  state?: string;
  pincode?: string;
}

// ─── Vitals ─────────────────────────────────────────────────────────────────

export interface VitalsData {
  heartRate?: number;
  systolicBp?: number;
  diastolicBp?: number;
  temperature?: number;
  spO2?: number;
  respiratoryRate?: number;
  bloodGlucose?: number;
  weight?: number;
  height?: number;
}

// ─── Triage ─────────────────────────────────────────────────────────────────

export interface TriageResult {
  sessionId: string;
  level: number;           // 1-5 (1 = critical, 5 = non-urgent)
  label: string;
  reasoning: string;
  suggestedActions: string[];
  confidence: number;
  assessedAt: string;
}

// ─── Emergency ──────────────────────────────────────────────────────────────

export interface EmergencyAlert {
  id: string;
  sessionId?: string;
  patientId: string;
  alertType: 'cardiac' | 'respiratory' | 'trauma' | 'obstetric' | 'pediatric' | 'other';
  severity: 'critical' | 'high';
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  status: 'active' | 'dispatched' | 'resolved' | 'cancelled';
  createdAt: string;
}

// ─── Clinical Trials ────────────────────────────────────────────────────────

export interface TrialSearchParams {
  condition?: string;
  location?: string;
  phase?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface TrialMatch {
  trialId: string;
  patientId: string;
  matchScore: number;
  matchedCriteria: string[];
  unmatchedCriteria: string[];
  matchedAt: string;
}

// ─── Proxy / Circuit Breaker ────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export interface ServiceEndpoint {
  name: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export interface AuditEntry {
  userId: string;
  userRole: UserRole | 'anonymous';
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  requestMethod: string;
  requestPath: string;
  statusCode?: number;
  phiAccessed: boolean;
  timestamp: string;
}

// ─── WebSocket ──────────────────────────────────────────────────────────────

export interface WsAuthPayload {
  type: 'auth';
  token: string;
  sessionId: string;
}

export interface WsAudioChunk {
  type: 'audio';
  sessionId: string;
  chunk: string;  // base64-encoded audio
  sequence: number;
  sampleRate: number;
  encoding: 'pcm_s16le' | 'opus';
}

export interface WsControlMessage {
  type: 'start' | 'stop' | 'pause' | 'resume' | 'ping';
  sessionId: string;
}

export type WsInboundMessage = WsAuthPayload | WsAudioChunk | WsControlMessage;

export interface WsTranscriptEvent {
  type: 'transcript';
  sessionId: string;
  text: string;
  isFinal: boolean;
  language: string;
  confidence: number;
}

export interface WsErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export interface WsAckEvent {
  type: 'ack';
  event: string;
  sessionId?: string;
}

export type WsOutboundMessage = WsTranscriptEvent | WsErrorEvent | WsAckEvent;
