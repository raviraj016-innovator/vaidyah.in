import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import apiClient, { ENDPOINTS, storeTokens, clearTokens, API_BASE_URL } from '../config/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface NurseUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'nurse' | 'senior_nurse' | 'anm';
  centerId: string;
  centerName: string;
  district: string;
  state: string;
  languagesSpoken: string[];
  registrationNumber: string;
  profileImageUrl?: string;
}

export interface HealthCenter {
  id: string;
  name: string;
  type: 'PHC' | 'CHC' | 'SC' | 'DH';
  district: string;
  state: string;
  pincode: string;
}

export interface AuthState {
  // State
  user: NurseUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMfaPending: boolean;
  mfaSessionId: string | null;
  selectedCenter: HealthCenter | null;
  availableCenters: HealthCenter[];
  error: string | null;
  language: string;

  // Actions
  login: (credentials: { identifier: string; password: string; centerId: string }) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  fetchCenters: () => Promise<void>;
  setSelectedCenter: (center: HealthCenter) => void;
  setLanguage: (lang: string) => void;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Secure storage helpers
// ---------------------------------------------------------------------------
const USER_KEY = 'vaidyah_user';

async function storeUser(user: NurseUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

async function loadUser(): Promise<NurseUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function clearUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  isMfaPending: false,
  mfaSessionId: null,
  selectedCenter: null,
  availableCenters: [],
  error: null,
  language: 'en',

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------
  login: async ({ identifier, password, centerId }) => {
    set({ isLoading: true, error: null });

    try {
      const { data } = await apiClient.post(ENDPOINTS.AUTH_LOGIN, {
        identifier,
        password,
        centerId,
      });

      if (data.mfaRequired) {
        set({
          isMfaPending: true,
          mfaSessionId: data.mfaSessionId,
          isLoading: false,
        });
        return;
      }

      const { accessToken, refreshToken: newRefresh, user } = data;
      await storeTokens(accessToken, newRefresh);
      await storeUser(user);

      set({
        user,
        token: accessToken,
        refreshToken: newRefresh,
        isAuthenticated: true,
        isMfaPending: false,
        mfaSessionId: null,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 ? 'Invalid credentials. Please try again.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Login failed. Please try again.';
      set({ error: message, isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // MFA verification
  // ------------------------------------------------------------------
  verifyMfa: async (code: string) => {
    const { mfaSessionId } = get();
    if (!mfaSessionId) {
      set({ error: 'No MFA session active' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const { data } = await apiClient.post(ENDPOINTS.AUTH_MFA_VERIFY, {
        sessionId: mfaSessionId,
        code,
      });

      const { accessToken, refreshToken: newRefresh, user } = data;
      await storeTokens(accessToken, newRefresh);
      await storeUser(user);

      set({
        user,
        token: accessToken,
        refreshToken: newRefresh,
        isAuthenticated: true,
        isMfaPending: false,
        mfaSessionId: null,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 ? 'Invalid MFA code. Please try again.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Verification failed. Please try again.';
      set({ error: message, isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------
  logout: async () => {
    set({ isLoading: true });
    try {
      await apiClient.post(ENDPOINTS.AUTH_LOGOUT);
    } catch {
      // Proceed with local logout even if server call fails
    } finally {
      await clearTokens();
      await clearUser();
      set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false,
        isMfaPending: false,
        mfaSessionId: null,
        selectedCenter: null,
        isLoading: false,
        error: null,
      });
    }
  },

  // ------------------------------------------------------------------
  // Refresh tokens
  // ------------------------------------------------------------------
  refreshTokens: async () => {
    try {
      const currentRefresh = await SecureStore.getItemAsync('vaidyah_refresh_token');
      if (!currentRefresh) throw new Error('No refresh token');

      const { data } = await axios.post(`${API_BASE_URL}${ENDPOINTS.AUTH_REFRESH}`, {
        refreshToken: currentRefresh,
      });

      const { accessToken, refreshToken: newRefresh } = data;
      await storeTokens(accessToken, newRefresh);

      set({ token: accessToken, refreshToken: newRefresh });
    } catch {
      // Refresh failed -- force logout
      await get().logout();
    }
  },

  // ------------------------------------------------------------------
  // Load stored auth (app cold start)
  // ------------------------------------------------------------------
  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const [token, refreshToken, user] = await Promise.all([
        SecureStore.getItemAsync('vaidyah_auth_token'),
        SecureStore.getItemAsync('vaidyah_refresh_token'),
        loadUser(),
      ]);

      if (token && user) {
        if (isTokenExpired(token)) {
          // Token expired — try refresh
          if (refreshToken && !isTokenExpired(refreshToken)) {
            try {
              await get().refreshTokens();
              const newToken = await SecureStore.getItemAsync('vaidyah_auth_token');
              if (newToken && !isTokenExpired(newToken)) {
                set({ token: newToken, user, isAuthenticated: true, isLoading: false });
                return;
              }
            } catch {
              // Refresh failed
            }
          }
          // Both expired — force logout
          await clearTokens();
          await clearUser();
          set({ isLoading: false });
          return;
        }
        set({
          token,
          refreshToken,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Fetch available health centers
  // ------------------------------------------------------------------
  fetchCenters: async () => {
    try {
      const { data } = await apiClient.get(ENDPOINTS.AUTH_CENTERS);
      set({ availableCenters: data.centers ?? [] });
    } catch {
      // Silently fail -- centers list is non-critical for offline
    }
  },

  // ------------------------------------------------------------------
  // Setters
  // ------------------------------------------------------------------
  setSelectedCenter: (center) => set({ selectedCenter: center }),
  setLanguage: (lang) => set({ language: lang }),
  clearError: () => set({ error: null }),
}));
