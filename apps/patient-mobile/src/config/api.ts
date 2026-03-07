import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Environment / API configuration
// ---------------------------------------------------------------------------

export const API_CONFIG = {
  /** Base URL – overridden via env in EAS builds */
  BASE_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/v1',

  /** Request timeout in milliseconds */
  TIMEOUT: 30_000,

  /** Endpoints grouped by domain */
  ENDPOINTS: {
    // Auth
    AUTH_SEND_OTP: '/auth/otp/send',
    AUTH_VERIFY_OTP: '/auth/otp/verify',
    AUTH_REGISTER: '/auth/register',
    AUTH_REFRESH: '/auth/refresh',
    AUTH_LOGOUT: '/auth/logout',

    // Patient profile
    PROFILE: '/patient/profile',
    PROFILE_CONDITIONS: '/patient/profile/conditions',
    PROFILE_MEDICATIONS: '/patient/profile/medications',
    PROFILE_FAMILY_HISTORY: '/patient/profile/family-history',
    PROFILE_WEARABLES: '/patient/profile/wearables',

    // Trials
    TRIALS_SEARCH: '/trials/search',
    TRIALS_DETAIL: (id: string) => `/trials/${id}`,
    TRIALS_ELIGIBILITY: (id: string) => `/trials/${id}/eligibility`,
    TRIALS_SIMILAR: (id: string) => `/trials/${id}/similar`,
    TRIALS_CONTACT: (id: string) => `/trials/${id}/contact`,

    // Matches
    MATCHES: '/patient/matches',
    MATCHES_DISMISS: (id: string) => `/patient/matches/${id}/dismiss`,
    MATCHES_SAVE: (id: string) => `/patient/matches/${id}/save`,

    // Notifications
    NOTIFICATIONS: '/patient/notifications',
    NOTIFICATIONS_READ: (id: string) => `/patient/notifications/${id}/read`,
    NOTIFICATIONS_REGISTER_PUSH: '/patient/notifications/push-token',

    // Health data
    HEALTH_HEART_RATE: '/patient/health/heart-rate',
    HEALTH_STEPS: '/patient/health/steps',
    HEALTH_GLUCOSE: '/patient/health/glucose',
    HEALTH_SLEEP: '/patient/health/sleep',
    HEALTH_ALERTS: '/patient/health/alerts',
  },
} as const;

// ---------------------------------------------------------------------------
// Secure token helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'vaidyah_auth_token';
const REFRESH_KEY = 'vaidyah_refresh_token';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeTokens(token: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Logout callback (avoids circular dependency with authStore)
// ---------------------------------------------------------------------------

let logoutCallback: (() => void) | null = null;

export function setLogoutCallback(cb: () => void) {
  logoutCallback = cb;
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const apiClient = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Client': 'patient-mobile',
    'X-Client-Version': '1.0.0',
  },
});

// -- Request interceptor: attach bearer token --------------------------------

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

// -- Response interceptor: auto-refresh on 401 -------------------------------

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token!);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401 and if we haven't already retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue up while another refresh is in-flight
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        originalRequest._retry = true; // Prevent infinite retry if retried request also gets 401
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const { data } = await axios.post(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH_REFRESH}`,
        { refreshToken },
      );

      const { token: newToken, refreshToken: newRefreshToken } = data;
      if (!newToken || !newRefreshToken) {
        throw new Error('Invalid refresh response: missing tokens');
      }
      await storeTokens(newToken, newRefreshToken);

      processQueue(null, newToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error, null);
      await clearTokens();
      // Force auth state update so UI transitions to login screen
      await logoutCallback?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
