import { create } from 'zustand';
import apiClient, { ENDPOINTS } from '../config/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface PatientInfo {
  id: string;
  abdmId?: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  phone: string;
  languagePreference: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
  address?: string;
  bloodGroup?: string;
  allergies?: string[];
  chronicConditions?: string[];
  currentMedications?: string[];
}

export interface Vitals {
  temperature?: { value: number; unit: 'F' | 'C' };
  bloodPressure?: { systolic: number; diastolic: number };
  spO2?: number;
  pulse?: number;
  respiratoryRate?: number;
  weight?: number;
  recordedAt: string;
}

export interface DetectedSymptom {
  id: string;
  name: string;
  severity: 'mild' | 'moderate' | 'severe';
  bodyPart?: string;
  duration?: string;
  confidence: number;
  source: 'voice' | 'manual';
}

export interface EmotionIndicator {
  distress: number; // 0-100
  pain: number;
  anxiety: number;
  timestamp: string;
}

export interface TranscriptionEntry {
  id: string;
  originalText: string;
  originalLanguage: string;
  translatedText: string;
  speaker: 'patient' | 'nurse' | 'companion';
  timestamp: string;
  confidence: number;
}

export interface Contradiction {
  id: string;
  description: string;
  field1: string;
  field2: string;
  severity: 'low' | 'medium' | 'high';
  suggestedAction: string;
}

export interface FollowUpQuestion {
  id: string;
  text: string;
  translatedText?: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
}

export type TriageLevel = 'A' | 'B' | 'C';

export interface TriageResult {
  level: TriageLevel;
  confidence: number;
  primaryDiagnosis: string;
  differentialDiagnoses: Array<{ name: string; confidence: number }>;
  recommendedActions: string[];
  urgencyScore: number;
  nurseProtocol?: string;
  prescriptionSuggestion?: string;
  teleconsultRequired: boolean;
  emergencyRequired: boolean;
}

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  generatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  status: 'draft' | 'reviewed' | 'finalized';
}

export interface ConsultationSession {
  id: string;
  patientId: string;
  nurseId: string;
  centerId: string;
  startedAt: string;
  completedAt?: string;
  status: 'active' | 'paused' | 'completed' | 'emergency';
}

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------
export interface SessionState {
  // Current session
  currentSession: ConsultationSession | null;
  patient: PatientInfo | null;
  vitals: Vitals | null;
  symptoms: DetectedSymptom[];
  transcriptions: TranscriptionEntry[];
  emotions: EmotionIndicator[];
  contradictions: Contradiction[];
  followUpQuestions: FollowUpQuestion[];
  triageResult: TriageResult | null;
  soapNote: SOAPNote | null;

  // Recording state
  isRecording: boolean;
  recordingDuration: number;
  audioChunkCount: number;

  // UI state
  isProcessing: boolean;
  isGeneratingSoap: boolean;
  isTriaging: boolean;
  error: string | null;

  // Actions -- session lifecycle
  startSession: (patient: PatientInfo) => Promise<void>;
  pauseSession: () => void;
  resumeSession: () => void;
  completeSession: () => Promise<void>;
  resetSession: () => void;

  // Actions -- patient
  setPatient: (patient: PatientInfo) => void;

  // Actions -- recording
  setRecording: (isRecording: boolean) => void;
  incrementRecordingDuration: () => void;
  resetRecordingDuration: () => void;

  // Actions -- transcription
  addTranscription: (entry: TranscriptionEntry) => void;
  clearTranscriptions: () => void;

  // Actions -- symptoms
  addSymptom: (symptom: DetectedSymptom) => void;
  removeSymptom: (id: string) => void;
  updateSymptomSeverity: (id: string, severity: DetectedSymptom['severity']) => void;
  setSymptoms: (symptoms: DetectedSymptom[]) => void;

  // Actions -- vitals
  setVitals: (vitals: Vitals) => void;
  submitVitals: () => Promise<void>;

  // Actions -- emotions
  updateEmotions: (indicator: EmotionIndicator) => void;

  // Actions -- contradictions
  addContradiction: (c: Contradiction) => void;
  dismissContradiction: (id: string) => void;

  // Actions -- follow-up questions
  setFollowUpQuestions: (questions: FollowUpQuestion[]) => void;

  // Actions -- triage
  requestTriage: () => Promise<void>;
  setTriageResult: (result: TriageResult) => void;

  // Actions -- SOAP note
  generateSoapNote: () => Promise<void>;
  updateSoapNote: (updates: Partial<SOAPNote>) => void;
  finalizeSoapNote: () => Promise<void>;

  // Actions -- errors
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Initial empty state
// ---------------------------------------------------------------------------
const initialState = {
  currentSession: null,
  patient: null,
  vitals: null,
  symptoms: [],
  transcriptions: [],
  emotions: [],
  contradictions: [],
  followUpQuestions: [],
  triageResult: null,
  soapNote: null,
  isRecording: false,
  recordingDuration: 0,
  audioChunkCount: 0,
  isProcessing: false,
  isGeneratingSoap: false,
  isTriaging: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialState,

  // ------------------------------------------------------------------
  // Session lifecycle
  // ------------------------------------------------------------------
  startSession: async (patient: PatientInfo) => {
    set({ isProcessing: true, error: null });
    try {
      const { data } = await apiClient.post(ENDPOINTS.SESSION_CREATE, {
        patientId: patient.id,
      });

      set({
        currentSession: data.session,
        patient,
        isProcessing: false,
      });
    } catch (err: any) {
      // Fallback: create local session for offline
      const offlineSession: ConsultationSession = {
        id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        patientId: patient.id,
        nurseId: 'current',
        centerId: 'current',
        startedAt: new Date().toISOString(),
        status: 'active',
      };
      set({
        currentSession: offlineSession,
        patient,
        isProcessing: false,
      });
    }
  },

  pauseSession: () => {
    const { currentSession } = get();
    if (currentSession) {
      set({
        currentSession: { ...currentSession, status: 'paused' },
        isRecording: false,
      });
    }
  },

  resumeSession: () => {
    const { currentSession } = get();
    if (currentSession) {
      set({ currentSession: { ...currentSession, status: 'active' } });
    }
  },

  completeSession: async () => {
    const { currentSession, isProcessing } = get();
    if (!currentSession || isProcessing) return;

    set({ isProcessing: true });
    try {
      await apiClient.post(ENDPOINTS.SESSION_COMPLETE(currentSession.id));
      set({
        currentSession: {
          ...currentSession,
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
        isRecording: false,
        isProcessing: false,
      });
    } catch (err) {
      set({ isProcessing: false });
      throw err; // Don't mark completed on failure — let caller handle
    }
  },

  resetSession: () => set({ ...initialState }),

  // ------------------------------------------------------------------
  // Patient
  // ------------------------------------------------------------------
  setPatient: (patient) => set({ patient }),

  // ------------------------------------------------------------------
  // Recording
  // ------------------------------------------------------------------
  setRecording: (isRecording) => set({ isRecording }),
  incrementRecordingDuration: () =>
    set((s) => ({ recordingDuration: s.recordingDuration + 1 })),
  resetRecordingDuration: () => set({ recordingDuration: 0, audioChunkCount: 0 }),

  // ------------------------------------------------------------------
  // Transcription
  // ------------------------------------------------------------------
  addTranscription: (entry) =>
    set((s) => ({ transcriptions: [...s.transcriptions, entry] })),
  clearTranscriptions: () => set({ transcriptions: [] }),

  // ------------------------------------------------------------------
  // Symptoms
  // ------------------------------------------------------------------
  addSymptom: (symptom) =>
    set((s) => {
      const exists = s.symptoms.some((sx) => sx.name === symptom.name);
      if (exists) return s;
      return { symptoms: [...s.symptoms, symptom] };
    }),
  removeSymptom: (id) =>
    set((s) => ({ symptoms: s.symptoms.filter((sx) => sx.id !== id) })),
  updateSymptomSeverity: (id, severity) =>
    set((s) => ({
      symptoms: s.symptoms.map((sx) => (sx.id === id ? { ...sx, severity } : sx)),
    })),
  setSymptoms: (symptoms) => set({ symptoms }),

  // ------------------------------------------------------------------
  // Vitals
  // ------------------------------------------------------------------
  setVitals: (vitals) => set({ vitals }),
  submitVitals: async () => {
    const { currentSession, vitals } = get();
    if (!currentSession || !vitals) {
      throw new Error('Session or vitals data missing');
    }

    set({ isProcessing: true });
    try {
      await apiClient.post(ENDPOINTS.VITALS_SUBMIT(currentSession.id), vitals);
      set({ isProcessing: false });
    } catch (err) {
      set({ isProcessing: false });
      throw err; // Re-throw so callers (VitalsEntryScreen) can handle the failure
    }
  },

  // ------------------------------------------------------------------
  // Emotions
  // ------------------------------------------------------------------
  updateEmotions: (indicator) =>
    set((s) => ({ emotions: [...s.emotions, indicator] })),

  // ------------------------------------------------------------------
  // Contradictions
  // ------------------------------------------------------------------
  addContradiction: (c) =>
    set((s) => ({ contradictions: [...s.contradictions, c] })),
  dismissContradiction: (id) =>
    set((s) => ({ contradictions: s.contradictions.filter((c) => c.id !== id) })),

  // ------------------------------------------------------------------
  // Follow-up questions
  // ------------------------------------------------------------------
  setFollowUpQuestions: (questions) => set({ followUpQuestions: questions }),

  // ------------------------------------------------------------------
  // Triage
  // ------------------------------------------------------------------
  requestTriage: async () => {
    const { currentSession, symptoms, vitals, transcriptions } = get();
    if (!currentSession) return;

    set({ isTriaging: true, error: null });
    try {
      const { data } = await apiClient.post(ENDPOINTS.AI_TRIAGE, {
        sessionId: currentSession.id,
        symptoms,
        vitals,
        transcriptionSummary: transcriptions.map((t) => t.translatedText).join(' '),
      });

      set({ triageResult: data.triage, isTriaging: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message ?? 'Triage request failed',
        isTriaging: false,
      });
    }
  },

  setTriageResult: (result) => set({ triageResult: result }),

  // ------------------------------------------------------------------
  // SOAP note
  // ------------------------------------------------------------------
  generateSoapNote: async () => {
    const { currentSession, symptoms, vitals, transcriptions, triageResult } = get();
    if (!currentSession) {
      throw new Error('No active session');
    }

    set({ isGeneratingSoap: true, error: null });
    try {
      const { data } = await apiClient.post(ENDPOINTS.AI_SOAP_NOTE, {
        sessionId: currentSession.id,
        symptoms,
        vitals,
        transcriptions: transcriptions.map((t) => ({
          text: t.translatedText,
          speaker: t.speaker,
        })),
        triage: triageResult,
      });

      set({
        soapNote: {
          ...data.soapNote,
          status: 'draft',
          generatedAt: new Date().toISOString(),
        },
        isGeneratingSoap: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.message ?? 'SOAP note generation failed',
        isGeneratingSoap: false,
      });
      throw err;
    }
  },

  updateSoapNote: (updates) =>
    set((s) => ({
      soapNote: s.soapNote ? { ...s.soapNote, ...updates } : null,
    })),

  finalizeSoapNote: async () => {
    const { currentSession, soapNote } = get();
    if (!currentSession || !soapNote) {
      throw new Error('Session or SOAP note not found');
    }

    set({ isProcessing: true });
    try {
      await apiClient.put(ENDPOINTS.SESSION_UPDATE(currentSession.id), {
        soapNote: { ...soapNote, status: 'finalized' },
      });
      set({
        soapNote: { ...soapNote, status: 'finalized' },
        isProcessing: false,
      });
    } catch (err) {
      set({ isProcessing: false });
      throw err; // Re-throw so SOAPSummaryScreen try/catch can handle the failure
    }
  },

  // ------------------------------------------------------------------
  // Errors
  // ------------------------------------------------------------------
  clearError: () => set({ error: null }),
}));
