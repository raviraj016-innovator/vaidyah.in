import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

// ---------------------------------------------------------------------------
// Axios instance with auth interceptor
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL ?? 'http://localhost:3000/auth';

if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
  if (API_BASE_URL.startsWith('http://') && !API_BASE_URL.includes('localhost')) {
    console.error('[Security] API_BASE_URL uses HTTP on a secure page. Set VITE_API_BASE_URL to an HTTPS URL.');
  }
  if (AUTH_BASE_URL.startsWith('http://') && !AUTH_BASE_URL.includes('localhost')) {
    console.error('[Security] AUTH_BASE_URL uses HTTP on a secure page. Set VITE_AUTH_BASE_URL to an HTTPS URL.');
  }
}

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
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ---------- Response interceptor -- handle 401 / refresh ----------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: Error | null, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue up while another refresh is in-flight
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        originalRequest._retry = true;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await authApi.post('/token/refresh', {
        refresh_token: refreshToken,
      });

      const newToken = data.access_token;
      const newRefresh = data.refresh_token ?? refreshToken;
      useAuthStore.getState().setTokens(newToken, newRefresh);

      processQueue(null, newToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
      }
      return api(originalRequest);
    } catch (_refreshError) {
      processQueue(_refreshError as Error, null);
      // Clear auth state — the router will handle redirecting to /login
      useAuthStore.getState().logout();
      return Promise.reject(_refreshError);
    } finally {
      isRefreshing = false;
    }
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
