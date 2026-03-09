export const endpoints = {
  // Auth
  auth: {
    login: '/login',
    logout: '/logout',
    refresh: '/token/refresh',
    me: '/me',
    centers: '/centers',
    abdmLookup: '/abdm/lookup',
    patientSignup: '/patient/signup',
  },

  // Dashboard (Admin)
  dashboard: {
    kpis: '/dashboard/kpis',
    consultationsTrend: '/dashboard/consultations/trend',
    triageSummary: '/dashboard/triage/summary',
    topConditions: '/dashboard/conditions/top',
    centersMap: '/dashboard/centers/status',
  },

  // Health Centers
  centers: {
    list: '/centers',
    detail: (id: string) => `/centers/${id}`,
    create: '/centers',
    update: (id: string) => `/centers/${id}`,
    stats: (id: string) => `/centers/${id}/stats`,
    delete: (id: string) => `/centers/${id}`,
  },

  // Users
  users: {
    list: '/users',
    detail: (id: string) => `/users/${id}`,
    create: '/users',
    update: (id: string) => `/users/${id}`,
    delete: (id: string) => `/users/${id}`,
    roles: '/users/roles',
  },

  // Consultations
  consultations: {
    list: '/consultations',
    detail: (id: string) => `/consultations/${id}`,
    transcript: (id: string) => `/consultations/${id}/transcript`,
    soapNote: (id: string) => `/consultations/${id}/soap`,
    prosody: (id: string) => `/consultations/${id}/prosody`,
  },

  // Clinical Trials
  trials: {
    list: '/trials',
    search: '/trials/search',
    detail: (id: string) => `/trials/${id}`,
    similar: (id: string) => `/trials/${id}/similar`,
    stats: '/trials/stats',
    syncStatus: '/trials/sync/status',
    triggerSync: '/trials/sync/trigger',
    matches: '/trials/matches',
    patientMatches: (patientId: string) => `/trials/matches/patient/${patientId}`,
    eligibility: (trialId: string, patientId: string) => `/trials/${trialId}/eligibility/${patientId}`,
    csvUpload: '/trials/csv/upload',
    csvStatus: '/trials/csv/status',
    expressInterest: (trialId: string) => `/trials/${trialId}/interest`,
  },

  // Analytics
  analytics: {
    diseasePrevalence: '/analytics/diseases/prevalence',
    nursePerformance: '/analytics/nurses/performance',
    aiAccuracy: '/analytics/ai/accuracy',
    demographics: '/analytics/patients/demographics',
    waitTimes: '/analytics/wait-times',
  },

  // System Health
  system: {
    services: '/system/services',
    responseTimes: '/system/response-times',
    errorRates: '/system/error-rates',
    alerts: '/system/alerts',
    metrics: '/system/metrics',
    aws: '/system/aws',
  },

  // Nurse - Sessions
  sessions: {
    start: '/sessions/start',
    detail: (id: string) => `/sessions/${id}`,
    pause: (id: string) => `/sessions/${id}/pause`,
    resume: (id: string) => `/sessions/${id}/resume`,
    complete: (id: string) => `/sessions/${id}/complete`,
    vitals: (id: string) => `/sessions/${id}/vitals`,
    triage: (id: string) => `/sessions/${id}/triage`,
    soap: (id: string) => `/sessions/${id}/soap`,
  },

  // Patients
  patients: {
    list: '/patients',
    detail: (id: string) => `/patients/${id}`,
    create: '/patients',
    update: (id: string) => `/patients/${id}`,
    search: '/patients/search',
    recent: '/patients/recent',
    abdmLookup: '/patients/abdm/lookup',
  },

  // Notifications
  notifications: {
    list: '/notifications',
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: '/notifications/read-all',
  },

  // NLU (Natural Language Understanding)
  nlu: {
    extractSymptoms: '/nlu/extract-symptoms',
    contradictions: '/nlu/contradictions',
    followupQuestions: '/nlu/followup-questions',
    translate: '/nlu/translate',
    soapGenerate: '/nlu/soap-generate',
    summarize: '/nlu/summarize',
    medicalEntities: '/nlu/medical-entities',
  },

  // ABDM / Integrations
  integration: {
    abdmHealthRecord: (patientId: string) => `/integration/abdm/health-record/${patientId}`,
    abdmVerify: '/integration/abdm/verify',
    wearableSync: '/integration/wearables/sync',
    whatsappSend: '/integration/whatsapp/send',
  },

  // Voice
  voice: {
    detectLanguage: '/voice/detect-language',
    detectDialect: '/voice/detect-dialect',
    transcribe: '/voice/transcribe',
    synthesize: '/voice/synthesize',
    prosody: '/voice/analyze-prosody',
  },

  // Patient Health
  patientHealth: {
    summary: '/patient/health/summary',
    alertAcknowledge: (alertId: string) => `/patient/health/alerts/${alertId}/acknowledge`,
    wearables: '/patient/profile/wearables',
  },

  // Emergency
  emergency: {
    create: '/emergency',
    detail: (id: string) => `/emergency/${id}`,
    notifyHospital: (id: string) => `/emergency/${id}/notify-hospital`,
  },

  // Nurse Dashboard
  nurseDashboard: {
    stats: '/nurse/dashboard/stats',
  },

  // Telemedicine (Video Consultation)
  telemedicine: {
    createMeeting: '/telemedicine/meetings',
    getMeeting: (id: string) => `/telemedicine/meetings/${id}`,
    addAttendee: (id: string) => `/telemedicine/meetings/${id}/attendees`,
    endMeeting: (id: string) => `/telemedicine/meetings/${id}`,
    refreshToken: (id: string) => `/telemedicine/meetings/${id}/token`,
    startTranscription: '/telemedicine/transcription/start',
    stopTranscription: (id: string) => `/telemedicine/transcription/${id}/stop`,
    getTranscript: (id: string) => `/telemedicine/transcription/${id}`,
    facialAnalysis: '/telemedicine/facial-analysis',
  },
} as const;

export default endpoints;
