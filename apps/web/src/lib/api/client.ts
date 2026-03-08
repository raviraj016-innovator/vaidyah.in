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
