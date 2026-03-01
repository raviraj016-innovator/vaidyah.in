import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Environment / base URL
// ---------------------------------------------------------------------------
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.vaidyah.health/v1';
const WS_BASE_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://ws.vaidyah.health/v1';

// ---------------------------------------------------------------------------
// Endpoint definitions
// ---------------------------------------------------------------------------
export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_LOGOUT: '/auth/logout',
  AUTH_REFRESH: '/auth/refresh',
  AUTH_MFA_VERIFY: '/auth/mfa/verify',
  AUTH_CENTERS: '/auth/centers',

  // Patients
  PATIENT_SEARCH: '/patients/search',
  PATIENT_GET: (id: string) => `/patients/${id}`,
  PATIENT_CREATE: '/patients',
  PATIENT_HISTORY: (id: string) => `/patients/${id}/history`,
  PATIENT_ABDM_LOOKUP: '/patients/abdm/lookup',

  // Consultations / sessions
  SESSION_CREATE: '/sessions',
  SESSION_GET: (id: string) => `/sessions/${id}`,
  SESSION_LIST: '/sessions',
  SESSION_UPDATE: (id: string) => `/sessions/${id}`,
  SESSION_COMPLETE: (id: string) => `/sessions/${id}/complete`,

  // Voice / transcription
  VOICE_UPLOAD: '/voice/upload',
  VOICE_TRANSCRIBE: '/voice/transcribe',

  // AI / clinical
  AI_TRIAGE: '/ai/triage',
  AI_SYMPTOMS: '/ai/symptoms/extract',
  AI_SOAP_NOTE: '/ai/soap-note',
  AI_FOLLOWUP_QUESTIONS: '/ai/followup-questions',
  AI_CONTRADICTION_CHECK: '/ai/contradictions',

  // Vitals
  VITALS_SUBMIT: (sessionId: string) => `/sessions/${sessionId}/vitals`,
  VITALS_VALIDATE: '/vitals/validate',

  // Emergency
  EMERGENCY_CREATE: '/emergency/alert',
  EMERGENCY_STATUS: (id: string) => `/emergency/${id}/status`,
  EMERGENCY_AMBULANCE: (id: string) => `/emergency/${id}/ambulance`,

  // Teleconsult
  TELECONSULT_REQUEST: '/teleconsult/request',
  TELECONSULT_JOIN: (id: string) => `/teleconsult/${id}/join`,

  // Sync
  SYNC_PUSH: '/sync/push',
  SYNC_PULL: '/sync/pull',
  SYNC_STATUS: '/sync/status',

  // Dashboard
  DASHBOARD_SUMMARY: '/dashboard/nurse/summary',
  DASHBOARD_STATS: '/dashboard/nurse/stats',
} as const;

// ---------------------------------------------------------------------------
// WebSocket endpoints
// ---------------------------------------------------------------------------
export const WS_ENDPOINTS = {
  AUDIO_STREAM: `${WS_BASE_URL}/audio/stream`,
  TRANSCRIPTION: `${WS_BASE_URL}/transcription`,
  EMERGENCY_UPDATES: `${WS_BASE_URL}/emergency/updates`,
} as const;

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'vaidyah_auth_token';
const REFRESH_TOKEN_KEY = 'vaidyah_refresh_token';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, access);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Client': 'nurse-tablet',
    'X-Client-Version': '1.0.0',
  },
});

// Request interceptor -- attach auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// Response interceptor -- handle 401 with token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: AxiosError | null, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const { data } = await axios.post(`${API_BASE_URL}${ENDPOINTS.AUTH_REFRESH}`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefresh } = data;
        await storeTokens(accessToken, newRefresh);

        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        await clearTokens();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
export { API_BASE_URL, WS_BASE_URL };
