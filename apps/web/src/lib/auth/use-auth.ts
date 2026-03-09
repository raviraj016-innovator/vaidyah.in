'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, type AdminUser, type NurseUser, type PatientUser, type Permission, type PortalType } from '@/stores/auth-store';
import { authApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

export function useAuth() {
  const router = useRouter();

  // Reactive state for UI re-renders
  const portalType = useAuthStore((s) => s.portalType);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isGuest = useAuthStore((s) => s.isGuest);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const language = useAuthStore((s) => s.language);

  const loginAdmin = async (email: string, password: string) => {
    const store = useAuthStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const { data } = await authApi.post(endpoints.auth.login, {
        email,
        password,
        role: 'admin',
      });
      store.loginAdmin(data.user as AdminUser, data.access_token, data.refresh_token);
      
      // Check if profile is complete
      if (data.user.profileComplete === false) {
        router.push('/admin/onboarding');
      } else {
        router.push('/admin/dashboard');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 ? 'Invalid credentials. Please check your email and password.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Login failed. Please try again.';
      useAuthStore.getState().setError(message);
      throw err;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
  };

  const loginNurse = async (identifier: string, password: string, centerId: string) => {
    const store = useAuthStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const { data } = await authApi.post(endpoints.auth.login, {
        identifier,
        password,
        centerId,
        role: 'nurse',
      });
      useAuthStore.getState().loginNurse(data.user as NurseUser, data.access_token, data.refresh_token);

      // Check if profile is complete
      if (data.user.profileComplete === false) {
        router.push('/nurse/onboarding');
      } else {
        router.push('/nurse/dashboard');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 ? 'Invalid credentials. Please try again.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Login failed. Please try again.';
      useAuthStore.getState().setError(message);
      throw err;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
  };

  const loginPatient = async (phone: string, password: string) => {
    const store = useAuthStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const { data } = await authApi.post(endpoints.auth.login, {
        phone,
        password,
        role: 'patient',
      });
      useAuthStore.getState().loginPatient(data.user as PatientUser, data.access_token, data.refresh_token);

      if (data.user.profileComplete === false) {
        router.push('/patient/onboarding');
      } else {
        router.push('/patient/home');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 ? 'Invalid credentials. Please check your phone number and password.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Login failed. Please try again.';
      useAuthStore.getState().setError(message);
      throw err;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
  };

  const guestLogin = (portal: PortalType) => {
    useAuthStore.getState().loginAsGuest(portal);
    const destinations: Record<PortalType, string> = {
      admin: '/admin/dashboard',
      nurse: '/nurse/dashboard',
      patient: '/patient/home',
    };
    router.push(destinations[portal]);
  };

  const logout = () => {
    useAuthStore.getState().logout();
    router.push('/');
  };

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!user || portalType !== 'admin') return false;
      return (user as AdminUser).permissions?.includes(permission) ?? false;
    },
    [user, portalType],
  );

  const hasAnyPermission = useCallback(
    (permissions: Permission[]) => {
      if (!user || portalType !== 'admin') return false;
      return permissions.some((p) => (user as AdminUser).permissions?.includes(p) ?? false);
    },
    [user, portalType],
  );

  const hasRole = useCallback(
    (role: string) => {
      if (!user) return false;
      if (portalType === 'admin') return (user as AdminUser).role === role;
      if (portalType === 'nurse') return 'role' in user && (user as any).role === role;
      return false;
    },
    [user, portalType],
  );

  return {
    portalType,
    user,
    isAuthenticated,
    isGuest,
    isLoading,
    error,
    language,
    loginAdmin,
    loginNurse,
    loginPatient,
    guestLogin,
    logout,
    hasPermission,
    hasAnyPermission,
    hasRole,
    isSuperAdmin: portalType === 'admin' && user !== null && 'role' in user && user.role === 'super_admin',
    isStateAdmin: portalType === 'admin' && user !== null && 'role' in user && user.role === 'state_admin',
  };
}

export default useAuth;
