import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import apiClient, {
  API_CONFIG,
  storeTokens,
  clearTokens,
  getStoredToken,
  setLogoutCallback,
} from '../config/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientUser {
  id: string;
  name: string;
  phone: string;
  abdmId?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  languagePref: 'hi' | 'en';
  location?: {
    city: string;
    state: string;
    pincode: string;
    lat?: number;
    lng?: number;
  };
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
  familyHistory?: string[];
  profileComplete: boolean;
}

export interface AuthState {
  // State
  user: PatientUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOtpSent: boolean;
  otpSessionId: string | null;
  error: string | null;
  language: 'hi' | 'en';

  // Actions
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  loginWithAbdm: (abdmId: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  updateProfile: (profile: Partial<PatientUser>) => Promise<void>;
  setLanguage: (lang: 'hi' | 'en') => void;
  clearError: () => void;
  resetOtpFlow: () => void;
}

// ---------------------------------------------------------------------------
// Secure storage helpers
// ---------------------------------------------------------------------------

const USER_KEY = 'vaidyah_patient_user';
const LANG_KEY = 'vaidyah_patient_lang';

async function storeUser(user: PatientUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

async function loadUser(): Promise<PatientUser | null> {
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

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

async function loadLanguage(): Promise<'hi' | 'en'> {
  try {
    const lang = await SecureStore.getItemAsync(LANG_KEY);
    return lang === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

async function storeLanguage(lang: 'hi' | 'en'): Promise<void> {
  await SecureStore.setItemAsync(LANG_KEY, lang);
}

// ---------------------------------------------------------------------------
// Callback to clear trial data on logout (avoids circular dependency)
// ---------------------------------------------------------------------------

let trialCleanupCallback: (() => void) | null = null;

export function setTrialCleanupCallback(cb: () => void) {
  trialCleanupCallback = cb;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state — isLoading starts true to prevent auth flicker before loadStoredAuth
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isOtpSent: false,
  otpSessionId: null,
  error: null,
  language: 'en',

  // ------------------------------------------------------------------
  // Send OTP to phone number
  // ------------------------------------------------------------------
  sendOtp: async (phone: string) => {
    set({ isLoading: true, error: null });

    try {
      const { data } = await apiClient.post(API_CONFIG.ENDPOINTS.AUTH_SEND_OTP, {
        phone,
        role: 'patient',
      });

      set({
        isOtpSent: true,
        otpSessionId: data.sessionId,
        isLoading: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'OTP भेजने में विफल। कृपया पुनः प्रयास करें। / Failed to send OTP. Please try again.';
      set({ error: message, isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Verify OTP
  // ------------------------------------------------------------------
  verifyOtp: async (otp: string) => {
    const { otpSessionId } = get();
    if (!otpSessionId) {
      set({ error: 'No OTP session active' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const { data } = await apiClient.post(API_CONFIG.ENDPOINTS.AUTH_VERIFY_OTP, {
        sessionId: otpSessionId,
        otp,
      });

      const { accessToken, refreshToken, user } = data;
      await storeTokens(accessToken, refreshToken);
      await storeUser(user);

      set({
        user,
        isAuthenticated: true,
        isOtpSent: false,
        otpSessionId: null,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'गलत OTP। कृपया पुनः प्रयास करें। / Invalid OTP. Please try again.';
      set({ error: message, isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Login with ABDM Health ID
  // ------------------------------------------------------------------
  loginWithAbdm: async (abdmId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { data } = await apiClient.post(API_CONFIG.ENDPOINTS.AUTH_SEND_OTP, {
        abdmId,
        role: 'patient',
        method: 'abdm',
      });

      set({
        isOtpSent: true,
        otpSessionId: data.sessionId,
        isLoading: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'ABDM सत्यापन विफल। / ABDM verification failed.';
      set({ error: message, isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------
  logout: async () => {
    set({ isLoading: true });
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.AUTH_LOGOUT);
    } catch {
      // Proceed with local logout even if server call fails
    } finally {
      await clearTokens();
      await clearUser();
      // Clear trial data to prevent leakage to next user
      trialCleanupCallback?.();
      set({
        user: null,
        isAuthenticated: false,
        isOtpSent: false,
        otpSessionId: null,
        isLoading: false,
        error: null,
      });
    }
  },

  // ------------------------------------------------------------------
  // Load stored auth (app cold start)
  // ------------------------------------------------------------------
  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const [token, user, lang] = await Promise.all([
        getStoredToken(),
        loadUser(),
        loadLanguage(),
      ]);

      if (token && user) {
        if (isTokenExpired(token)) {
          // Token expired — clear auth state
          await clearTokens();
          await clearUser();
          set({ isLoading: false, language: lang });
          return;
        }
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          language: lang,
        });
      } else {
        set({ isLoading: false, language: lang });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Update patient profile
  // ------------------------------------------------------------------
  updateProfile: async (profile: Partial<PatientUser>) => {
    const currentUser = get().user;
    if (!currentUser) {
      set({ error: 'No user logged in.' });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.put(API_CONFIG.ENDPOINTS.PROFILE, profile);
      const updatedUser = data.user ?? { ...currentUser, ...profile };
      await storeUser(updatedUser);
      set({ user: updatedUser, isLoading: false });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'प्रोफ़ाइल अपडेट विफल। / Profile update failed.';
      set({ error: message, isLoading: false });
    }
  },

  // ------------------------------------------------------------------
  // Setters
  // ------------------------------------------------------------------
  setLanguage: (lang: 'hi' | 'en') => {
    storeLanguage(lang).catch(() => {});
    set({ language: lang });
  },

  clearError: () => set({ error: null }),

  resetOtpFlow: () =>
    set({
      isOtpSent: false,
      otpSessionId: null,
      error: null,
    }),
}));

// Register logout callback with api module to break circular dependency.
// This performs LOCAL-ONLY logout (no API call) to avoid infinite 401 loops.
setLogoutCallback(async () => {
  await clearTokens();
  await clearUser();
  trialCleanupCallback?.();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isOtpSent: false,
    otpSessionId: null,
    isLoading: false,
    error: null,
  });
});
