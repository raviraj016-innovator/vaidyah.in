'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PatientInfo {
  id?: string;
  name: string;
  age: number;
  gender: string;
  phone?: string;
  abdmId?: string;
  bloodGroup?: string;
  allergies?: string[];
  chronicConditions?: string[];
}

interface VitalsData {
  temperature?: number;
  temperatureUnit: 'C' | 'F';
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  spO2?: number;
  bloodGlucose?: number;
  weight?: number;
  height?: number;
  painScore?: number;
}

interface TranscriptEntry {
  id: string;
  speaker: 'nurse' | 'patient' | 'system' | 'companion';
  text: string;
  textHi?: string;
  timestamp: string;
  emotions?: Record<string, number>;
}

interface TriageResult {
  category: 'A' | 'B' | 'C';
  urgencyScore: number;
  acuityLevel: string;
  redFlags: string[];
  contributingFactors: string[];
  recommendation: string;
  recommendationHi?: string;
  referralType?: string;
  differentialDiagnoses?: Array<{ name: string; confidence: number }>;
  nurseProtocol?: string;
  nurseProtocolHi?: string;
  prescriptionSuggestion?: string;
  prescriptionSuggestionHi?: string;
  teleconsultRequired?: boolean;
  emergencyRequired?: boolean;
}

interface SOAPNote {
  subjective: {
    chiefComplaint: string;
    historyOfPresentIllness: string;
    reviewOfSystems: string[];
    patientNarrative?: string;
  };
  objective: {
    vitalSigns: string;
    physicalExamination: string;
    observations: string[];
  };
  assessment: {
    primaryDiagnosis: string;
    differentialDiagnoses: string[];
    severity: string;
    clinicalReasoning: string;
  };
  plan: {
    medications: string[];
    investigations: string[];
    referrals: string[];
    followUp: string;
    patientEducation: string[];
  };
}

type SessionStatus =
  | 'idle'
  | 'intake'
  | 'vitals'
  | 'consultation'
  | 'triage'
  | 'soap'
  | 'completed';

type SOAPStatus = 'draft' | 'reviewed' | 'finalized';

const STATUS_ORDER: Record<SessionStatus, number> = {
  idle: 0, intake: 1, vitals: 2, consultation: 3, triage: 4, soap: 5, completed: 6,
};

const SOAP_STATUS_ORDER: Record<SOAPStatus, number> = { draft: 0, reviewed: 1, finalized: 2 };

interface SessionState {
  sessionId: string | null;
  status: SessionStatus;
  patient: PatientInfo | null;
  vitals: VitalsData;
  symptoms: Array<{
    id: string;
    name: string;
    severity: string;
    duration?: string;
  }>;
  transcript: TranscriptEntry[];
  triageResult: TriageResult | null;
  soapNote: SOAPNote | null;
  soapStatus: SOAPStatus;
  isRecording: boolean;
  startedAt: string | null;

  // Actions
  startSession: (patient: PatientInfo) => string;
  setVitals: (vitals: Partial<VitalsData>) => void;
  submitVitals: () => void;
  addSymptom: (symptom: {
    id: string;
    name: string;
    severity: string;
    duration?: string;
  }) => void;
  removeSymptom: (id: string) => void;
  addTranscriptEntry: (entry: TranscriptEntry) => void;
  setTriageResult: (result: TriageResult) => void;
  setSoapNote: (note: SOAPNote) => void;
  setSoapStatus: (status: SOAPStatus) => void;
  setRecording: (recording: boolean) => void;
  completeSession: () => void;
  resetSession: () => void;
}

export type {
  PatientInfo,
  VitalsData,
  TranscriptEntry,
  TriageResult,
  SOAPNote,
  SOAPStatus,
  SessionStatus,
  SessionState,
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
  sessionId: null,
  status: 'idle',
  patient: null,
  vitals: { temperatureUnit: 'C' },
  symptoms: [],
  transcript: [],
  triageResult: null,
  soapNote: null,
  soapStatus: 'draft',
  isRecording: false,
  startedAt: null,

  startSession: (patient) => {
    const newSessionId = crypto.randomUUID();
    set({
      sessionId: newSessionId,
      status: 'intake',
      patient,
      vitals: { temperatureUnit: 'C' },
      symptoms: [],
      transcript: [],
      triageResult: null,
      soapNote: null,
      soapStatus: 'draft',
      isRecording: false,
      startedAt: new Date().toISOString(),
    });
    return newSessionId;
  },

  setVitals: (vitals) =>
    set((state) => ({
      vitals: { ...state.vitals, ...vitals },
    })),

  submitVitals: () =>
    set((state) => ({
      status: STATUS_ORDER[state.status] < STATUS_ORDER['consultation']
        ? 'consultation'
        : state.status,
    })),

  addSymptom: (symptom) =>
    set((state) => ({
      symptoms: [...state.symptoms, symptom],
    })),

  removeSymptom: (id) =>
    set((state) => ({
      symptoms: state.symptoms.filter((s) => s.id !== id),
    })),

  addTranscriptEntry: (entry) =>
    set((state) => ({
      transcript: [...state.transcript, entry],
    })),

  setTriageResult: (triageResult) =>
    set((state) => ({
      triageResult,
      // Only advance status, never regress (e.g. don't go back from 'completed' to 'triage')
      status: STATUS_ORDER[state.status] < STATUS_ORDER['triage'] ? 'triage' : state.status,
    })),

  setSoapNote: (soapNote) =>
    set((state) => ({
      soapNote,
      // Only advance status, never regress
      status: STATUS_ORDER[state.status] < STATUS_ORDER['soap'] ? 'soap' : state.status,
    })),

  setSoapStatus: (soapStatus) =>
    set((state) => ({
      soapStatus:
        SOAP_STATUS_ORDER[soapStatus] > SOAP_STATUS_ORDER[state.soapStatus]
          ? soapStatus
          : state.soapStatus,
    })),

  setRecording: (isRecording) => set({ isRecording }),

  completeSession: () => set({ status: 'completed', soapStatus: 'finalized' }),

  resetSession: () =>
    set({
      sessionId: null,
      status: 'idle',
      patient: null,
      vitals: { temperatureUnit: 'C' },
      symptoms: [],
      transcript: [],
      triageResult: null,
      soapNote: null,
      soapStatus: 'draft',
      isRecording: false,
      startedAt: null,
    }),
    }),
    {
      name: 'vaidyah-session',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? sessionStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (state) => ({
        // Only persist non-PHI session metadata; patient data, vitals,
        // symptoms, transcripts, and SOAP notes are kept in memory only
        // to avoid storing PHI in plaintext sessionStorage.
        sessionId: state.sessionId,
        isRecording: state.isRecording,
        startedAt: state.startedAt,
        soapStatus: state.soapStatus,
      }),
    },
  ),
);
