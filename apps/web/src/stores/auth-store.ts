'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalType = 'admin' | 'nurse' | 'patient';

export type AdminRole = 'super_admin' | 'state_admin' | 'district_admin' | 'center_admin' | 'doctor' | 'viewer';
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
  profileComplete?: boolean;
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
  profileComplete?: boolean;
}

export interface PatientUser {
  id: string;
  name: string;
  phone: string;
  abdmId?: string;
  age?: number;
  gender?: string;
  location?: string | { city?: string; state?: string; pincode?: string };
  conditions?: string[];
  medications?: string[];
  allergies?: string[];
  familyHistory?: string[];
  profileComplete: boolean;
}

export type AuthUser = AdminUser | NurseUser | PatientUser;

// ---------------------------------------------------------------------------
// Guest demo profiles
// ---------------------------------------------------------------------------

export const GUEST_ADMIN: AdminUser = {
  id: 'guest-admin',
  email: 'guest@vaidyah.demo',
  name: 'Dr. Demo Admin',
  role: 'super_admin',
  permissions: [
    'centers:read', 'centers:write', 'centers:delete',
    'users:read', 'users:write', 'users:delete',
    'consultations:read', 'consultations:write',
    'trials:read', 'trials:write', 'trials:sync',
    'analytics:read', 'system:read', 'system:manage',
  ],
  state: 'Maharashtra',
  district: 'Pune',
  lastLogin: new Date().toISOString(),
  profileComplete: true,
};

export const GUEST_NURSE: NurseUser = {
  id: 'guest-nurse',
  name: 'Nurse Demo',
  registrationNumber: 'NRS-DEMO-001',
  role: 'senior_nurse',
  centerId: 'demo-center-1',
  centerName: 'PHC Koregaon Park',
  phone: '9876543210',
  qualifications: ['GNM', 'BSc Nursing'],
  profileComplete: true,
};

export const GUEST_PATIENT: PatientUser = {
  id: 'guest-patient',
  name: 'Patient Demo',
  phone: '9876543210',
  age: 35,
  gender: 'male',
  location: { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  conditions: ['Type 2 Diabetes', 'Hypertension'],
  medications: ['Metformin 500mg', 'Amlodipine 5mg'],
  allergies: ['Penicillin'],
  familyHistory: ['Diabetes', 'Heart Disease'],
  profileComplete: true,
};

const GUEST_TOKEN = 'guest-demo-token';

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
  center_admin: [
    'centers:read', 'centers:write',
    'users:read', 'users:write',
    'consultations:read', 'consultations:write',
    'trials:read', 'analytics:read', 'system:read',
  ],
  doctor: [
    'consultations:read', 'consultations:write',
    'trials:read', 'analytics:read',
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

  isGuest: boolean;

  // Actions
  loginAdmin: (user: AdminUser, token: string, refreshToken: string) => void;
  loginNurse: (user: NurseUser, token: string, refreshToken: string) => void;
  loginPatient: (user: PatientUser, token: string, refreshToken: string) => void;
  loginAsGuest: (portal: PortalType) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLanguage: (lang: 'en' | 'hi') => void;
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
      isGuest: false,
      isLoading: false,
      error: null,
      language: 'en',
      loginAdmin: (user, token, refreshToken) => {
        set({
          portalType: 'admin',
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isGuest: false,
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
          isGuest: false,
          isLoading: false,
          error: null,
        });
      },

      loginPatient: (user, token, refreshToken) => {
        set({
          portalType: 'patient',
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isGuest: false,
          isLoading: false,
          error: null,
        });
      },

      loginAsGuest: (portal) => {
        const guestUsers: Record<PortalType, AuthUser> = {
          admin: GUEST_ADMIN,
          nurse: GUEST_NURSE,
          patient: GUEST_PATIENT,
        };
        set({
          portalType: portal,
          user: guestUsers[portal],
          token: GUEST_TOKEN,
          refreshToken: null,
          isAuthenticated: true,
          isGuest: true,
          isLoading: false,
          error: null,
        });
      },

      logout: () => {
        set({
          portalType: null,
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isGuest: false,
          isLoading: false,
          error: null,
        });
      },

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setLanguage: (language) => set({ language }),

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
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        isGuest: state.isGuest,
        portalType: state.portalType,
        user: state.user,
      }),
    },
  ),
);

export default useAuthStore;
