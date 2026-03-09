'use client';

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
const AUTH_BASE_URL = process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? '/auth';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export const authApi = axios.create({
  baseURL: AUTH_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// Helper: read token from Zustand store (single source of truth)
function getToken(): string | null {
  return useAuthStore.getState().token;
}

// Request interceptor: attach token to both api and authApi
const attachTokenInterceptor = (config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

api.interceptors.request.use(
  attachTokenInterceptor,
  (error: AxiosError) => Promise.reject(error),
);

authApi.interceptors.request.use(
  attachTokenInterceptor,
  (error: AxiosError) => Promise.reject(error),
);

// Guest mode interceptor: swallow errors and return mock empty responses
function createGuestFallbackInterceptor() {
  return (error: AxiosError) => {
    const { isGuest } = useAuthStore.getState();
    if (isGuest) {
      // Return a mock successful response so pages render with empty state
      const url = error.config?.url || '';
      const mockData: Record<string, unknown> = { data: [], total: 0, success: true, message: 'Guest mode – demo data' };

      // Provide sensible defaults for common endpoints
      if (url.includes('/health')) mockData.status = 'ok';
      if (url.includes('/nurse/dashboard/stats')) {
        Object.assign(mockData, { data: { patientsSeen: 12, pendingTriage: 3, emergencies: 0 } });
      } else if (url.includes('/stats') || url.includes('/analytics')) {
        Object.assign(mockData, { total_patients: 1247, total_consultations: 3891, total_nurses: 48, total_centers: 12, active_sessions: 5 });
      }
      if (url.includes('/centers')) {
        mockData.data = [
          { id: 'demo-center-1', name: 'PHC Koregaon Park', type: 'PHC', district: 'Pune', state: 'Maharashtra', status: 'active', staffCount: 8, dailyAvg: 40, connectivity: 'good', latitude: 18.5362, longitude: 73.8939, totalPatients: 320, activeSince: '2024-01-15', lastSync: '2 min ago' },
          { id: 'demo-center-2', name: 'CHC Hadapsar', type: 'CHC', district: 'Pune', state: 'Maharashtra', status: 'active', staffCount: 12, dailyAvg: 65, connectivity: 'good', latitude: 18.5089, longitude: 73.9260, totalPatients: 580, activeSince: '2023-08-10', lastSync: '5 min ago' },
          { id: 'demo-center-3', name: 'PHC Kothrud', type: 'PHC', district: 'Pune', state: 'Maharashtra', status: 'active', staffCount: 6, dailyAvg: 28, connectivity: 'intermittent', latitude: 18.5074, longitude: 73.8077, totalPatients: 210, activeSince: '2024-06-01', lastSync: '15 min ago' },
        ];
        mockData.total = 3;
      }
      if (url.includes('/consultations')) {
        mockData.data = [];
        mockData.total = 0;
      }
      if (url.includes('/trials/search') || url.includes('/trials')) {
        mockData.data = [];
        mockData.trials = [];
        mockData.total = 0;
        mockData.facets = {};
      }

      return Promise.resolve({
        data: mockData,
        status: 200,
        statusText: 'OK (Guest Mode)',
        headers: {},
        config: error.config!,
      });
    }
    return Promise.reject(error);
  };
}

api.interceptors.response.use(undefined, createGuestFallbackInterceptor());
authApi.interceptors.response.use(undefined, createGuestFallbackInterceptor());

// Mark 401 errors so downstream catch blocks can skip duplicate toasts
function markAuthErrors(error: AxiosError) {
  if (error.response?.status === 401) {
    (error as any)._authHandled = true;
  }
  return Promise.reject(error);
}

api.interceptors.response.use(undefined, markAuthErrors);

// Response interceptor: handle 401 / token refresh
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else if (token) prom.resolve(token);
    else prom.reject(new Error('Token refresh produced null token'));
  });
  failedQueue = [];
};

function redirectToLogin() {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (!path.includes('/login')) {
      if (path.startsWith('/admin')) window.location.href = '/admin/login';
      else if (path.startsWith('/nurse')) window.location.href = '/nurse/login';
      else if (path.startsWith('/patient')) window.location.href = '/patient/login';
      else window.location.href = '/';
    }
  }
}

function createRefreshInterceptor(axiosInstance: typeof api) {
  return async (error: AxiosError) => {
    if (!error.config) return Promise.reject(error);

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const { isGuest, token } = useAuthStore.getState();
    if (isGuest) return Promise.reject(error);

    // Don't attempt refresh if user has no token (e.g. on login page)
    if (!token) return Promise.reject(error);

    // Don't attempt refresh if the failing request IS the refresh endpoint (prevents circular loop)
    const url = originalRequest.url ?? '';
    if (url.includes('/token/refresh')) return Promise.reject(error);

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(axiosInstance(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          processQueue(new Error('No refresh token'), null);
          useAuthStore.getState().logout();
          redirectToLogin();
          return Promise.reject(error);
        }

        const { data } = await authApi.post('/token/refresh', { refresh_token: refreshToken });

        const newToken = data.access_token;
        const newRefresh = data.refresh_token ?? refreshToken;
        useAuthStore.setState({ token: newToken, refreshToken: newRefresh });

        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  };
}

api.interceptors.response.use((response) => response, createRefreshInterceptor(api));
authApi.interceptors.response.use((response) => response, createRefreshInterceptor(authApi));

export default api;
