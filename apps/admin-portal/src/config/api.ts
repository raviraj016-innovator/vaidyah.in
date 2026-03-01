import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// ---------------------------------------------------------------------------
// Axios instance with auth interceptor
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL ?? '/auth';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

export const authApi = axios.create({
  baseURL: AUTH_BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ---------- Request interceptor -- attach token -------------------------

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('vaidyah_admin_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------- Response interceptor -- handle 401 / refresh ----------------

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('vaidyah_admin_refresh');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await authApi.post('/token/refresh', {
          refresh_token: refreshToken,
        });

        localStorage.setItem('vaidyah_admin_token', data.access_token);
        if (data.refresh_token) {
          localStorage.setItem('vaidyah_admin_refresh', data.refresh_token);
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return api(originalRequest);
      } catch (_refreshError) {
        localStorage.removeItem('vaidyah_admin_token');
        localStorage.removeItem('vaidyah_admin_refresh');
        window.location.href = '/login';
        return Promise.reject(_refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// API endpoint helpers
// ---------------------------------------------------------------------------

export const endpoints = {
  // Auth
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/token/refresh',
    me: '/auth/me',
  },

  // Dashboard
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
    stats: '/trials/stats',
    syncStatus: '/trials/sync/status',
    triggerSync: '/trials/sync/trigger',
    matches: '/trials/matches',
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
} as const;

export default api;
