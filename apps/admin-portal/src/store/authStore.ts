import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminRole = 'super_admin' | 'state_admin' | 'district_admin' | 'viewer';

export type Permission =
  | 'centers:read'
  | 'centers:write'
  | 'centers:delete'
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'consultations:read'
  | 'consultations:write'
  | 'trials:read'
  | 'trials:write'
  | 'trials:sync'
  | 'analytics:read'
  | 'system:read'
  | 'system:manage';

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

// ---------------------------------------------------------------------------
// Role -> Permissions mapping
// ---------------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
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
    'centers:read',
    'users:read',
    'consultations:read',
    'trials:read',
    'analytics:read',
    'system:read',
  ],
  viewer: [
    'centers:read',
    'users:read',
    'consultations:read',
    'analytics:read',
    'system:read',
  ],
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasHydrated: boolean;

  // Actions
  setUser: (user: AdminUser) => void;
  setTokens: (token: string, refreshToken: string) => void;
  login: (user: AdminUser, token: string, refreshToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasRole: (role: AdminRole) => boolean;
  hasAnyRole: (roles: AdminRole[]) => boolean;
  getPermissionsForRole: (role: AdminRole) => Permission[];
}

// ---------------------------------------------------------------------------
// Zustand store with persistence
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      _hasHydrated: false,

      setUser: (user) => set({ user }),

      setTokens: (token, refreshToken) => {
        set({ token, refreshToken });
      },

      login: (user, token, refreshToken) => {
        set({
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        return user.permissions.includes(permission);
      },

      hasAnyPermission: (permissions) => {
        const { user } = get();
        if (!user) return false;
        return permissions.some((p) => user.permissions.includes(p));
      },

      hasRole: (role) => {
        const { user } = get();
        if (!user) return false;
        return user.role === role;
      },

      hasAnyRole: (roles) => {
        const { user } = get();
        if (!user) return false;
        return roles.includes(user.role);
      },

      getPermissionsForRole: (role) => ROLE_PERMISSIONS[role] ?? [],
    }),
    {
      name: 'vaidyah-admin-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist tokens, auth state, and user so sessions survive page reloads.
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
      onRehydrateStorage: () => {
        return () => {
          useAuthStore.setState({ _hasHydrated: true });
        };
      },
    },
  ),
);

export default useAuthStore;
