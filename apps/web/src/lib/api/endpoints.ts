export const endpoints = {
  // Auth
  auth: {
    login: '/login',
    logout: '/logout',
    refresh: '/token/refresh',
    me: '/me',
    otpSend: '/otp/send',
    otpVerify: '/otp/verify',
    mfaVerify: '/mfa/verify',
    centers: '/centers',
    abdmLookup: '/abdm/lookup',
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
    stats: '/trials/stats',
    syncStatus: '/trials/sync/status',
    triggerSync: '/trials/sync/trigger',
    matches: '/trials/matches',
    patientMatches: (patientId: string) => `/trials/matches/patient/${patientId}`,
    eligibility: (trialId: string, patientId: string) => `/trials/${trialId}/eligibility/${patientId}`,
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

  // Nurse Dashboard
  nurseDashboard: {
    stats: '/nurse/dashboard/stats',
  },
} as const;

export default endpoints;
