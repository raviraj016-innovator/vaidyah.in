'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalType = 'admin' | 'nurse' | 'patient';

export type AdminRole = 'super_admin' | 'state_admin' | 'district_admin' | 'viewer';
export type NurseRole = 'nurse' | 'senior_nurse' | 'anm' | 'staff_nurse';
export type PatientRole = 'patient';

export type Permission =
  | 'centers:read' | 'centers:write' | 'centers:delete'
  | 'users:read' | 'users:write' | 'users:delete'
  | 'consultations:read' | 'consultations:write'
  | 'trials:read' | 'trials:write' | 'trials:sync'
  | 'analytics:read'
  | 'system:read' | 'system:manage';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: Permission[];
  avatar?: string;
  centerId?: string;
  state?: string;
  district?: string;
  lastLogin: string;
}

export interface NurseUser {
  id: string;
  name: string;
  registrationNumber: string;
  role: NurseRole;
  centerId: string;
  centerName: string;
  phone?: string;
  qualifications?: string[];
  avatar?: string;
}

export interface PatientUser {
  id: string;
  name: string;
  phone: string;
  abdmId?: string;
  age?: number;
  gender?: string;
  location?: string;
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
  familyHistory?: string[];
  profileComplete: boolean;
}

export type AuthUser = AdminUser | NurseUser | PatientUser;

const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    'centers:read', 'centers:write', 'centers:delete',
    'users:read', 'users:write', 'users:delete',
    'consultations:read', 'consultations:write',
    'trials:read', 'trials:write', 'trials:sync',
    'analytics:read',
    'system:read', 'system:manage',
  ],
  state_admin: [
    'centers:read', 'centers:write',
    'users:read', 'users:write',
    'consultations:read',
    'trials:read',
    'analytics:read',
    'system:read',
  ],
  district_admin: [
    'centers:read', 'users:read', 'consultations:read',
    'trials:read', 'analytics:read', 'system:read',
  ],
  viewer: [
    'centers:read', 'users:read', 'consultations:read',
    'analytics:read', 'system:read',
  ],
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AuthState {
  portalType: PortalType | null;
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  language: 'en' | 'hi';

  // MFA state (nurse)
  mfaRequired: boolean;
  mfaSessionId: string | null;

  // OTP state (patient)
  otpSessionId: string | null;
  otpSent: boolean;

  // Actions
  loginAdmin: (user: AdminUser, token: string, refreshToken: string) => void;
  loginNurse: (user: NurseUser, token: string, refreshToken: string) => void;
  loginPatient: (user: PatientUser, token: string, refreshToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLanguage: (lang: 'en' | 'hi') => void;
  setMfaRequired: (required: boolean, sessionId?: string) => void;
  setOtpSent: (sent: boolean, sessionId?: string) => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasRole: (role: string) => boolean;
  getPermissionsForRole: (role: AdminRole) => Permission[];
}

// ---------------------------------------------------------------------------
// Zustand store with persistence
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      portalType: null,
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      language: 'en',
      mfaRequired: false,
      mfaSessionId: null,
      otpSessionId: null,
      otpSent: false,

      loginAdmin: (user, token, refreshToken) => {
        set({
          portalType: 'admin',
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      },

      loginNurse: (user, token, refreshToken) => {
        set({
          portalType: 'nurse',
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          mfaRequired: false,
          mfaSessionId: null,
        });
      },

      loginPatient: (user, token, refreshToken) => {
        set({
          portalType: 'patient',
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          otpSessionId: null,
          otpSent: false,
        });
      },

      logout: () => {
        set({
          portalType: null,
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          mfaRequired: false,
          mfaSessionId: null,
          otpSessionId: null,
          otpSent: false,
        });
      },

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setLanguage: (language) => set({ language }),

      setMfaRequired: (mfaRequired, mfaSessionId) =>
        set({ mfaRequired, mfaSessionId: mfaSessionId ?? null }),

      setOtpSent: (otpSent, otpSessionId) =>
        set({ otpSent, otpSessionId: otpSessionId ?? null }),

      hasPermission: (permission) => {
        const { user, portalType } = get();
        if (!user || portalType !== 'admin') return false;
        return (user as AdminUser).permissions?.includes(permission) ?? false;
      },

      hasAnyPermission: (permissions) => {
        const { user, portalType } = get();
        if (!user || portalType !== 'admin') return false;
        return permissions.some((p) => (user as AdminUser).permissions?.includes(p) ?? false);
      },

      hasRole: (role) => {
        const { user } = get();
        if (!user) return false;
        if ('role' in user) return user.role === role;
        return false;
      },

      getPermissionsForRole: (role) => ADMIN_ROLE_PERMISSIONS[role] ?? [],
    }),
    {
      name: 'vaidyah-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
      partialize: (state) => ({
        language: state.language,
        // Persist tokens and auth state so sessions survive page reloads.
        // User profile (PII) is NOT persisted — it can be re-fetched on load.
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        portalType: state.portalType,
      }),
    },
  ),
);

export default useAuthStore;
