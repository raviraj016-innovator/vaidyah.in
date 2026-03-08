'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, type AdminUser, type NurseUser, type PatientUser, type Permission } from '@/stores/auth-store';
import { authApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

export function useAuth() {
  const router = useRouter();

  // Reactive state for UI re-renders
  const portalType = useAuthStore((s) => s.portalType);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const language = useAuthStore((s) => s.language);
  const mfaRequired = useAuthStore((s) => s.mfaRequired);
  const otpSent = useAuthStore((s) => s.otpSent);

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
      if (data.mfa_required) {
        useAuthStore.getState().setMfaRequired(true, data.mfa_session_id);
        return { mfaRequired: true };
      }
      useAuthStore.getState().loginNurse(data.user as NurseUser, data.access_token, data.refresh_token);
      
      // Check if profile is complete
      if (data.user.profileComplete === false) {
        router.push('/nurse/onboarding');
      } else {
        router.push('/nurse/dashboard');
      }
      return { mfaRequired: false };
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

  const verifyMfa = async (otp: string) => {
    const store = useAuthStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const { data } = await authApi.post(endpoints.auth.mfaVerify, {
        session_id: useAuthStore.getState().mfaSessionId,
        otp,
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
        status === 401 ? 'Invalid or expired OTP. Please try again.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Verification failed. Please try again.';
      useAuthStore.getState().setError(message);
      throw err;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
  };

  const sendOtp = async (phone: string) => {
    const store = useAuthStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const { data } = await authApi.post(endpoints.auth.otpSend, {
        phone,
        role: 'patient',
      });
      useAuthStore.getState().setOtpSent(true, data.session_id);
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Failed to send OTP. Please try again.';
      useAuthStore.getState().setError(message);
      throw err;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
  };

  const verifyOtp = async (otp: string) => {
    const store = useAuthStore.getState();
    store.setLoading(true);
    store.setError(null);
    try {
      const { data } = await authApi.post(endpoints.auth.otpVerify, {
        session_id: useAuthStore.getState().otpSessionId,
        otp,
      });
      useAuthStore.getState().loginPatient(data.user as PatientUser, data.access_token, data.refresh_token);
      
      // Check if profile is complete
      if (data.user.profileComplete === false) {
        router.push('/patient/onboarding');
      } else {
        router.push('/patient/home');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 401 ? 'Invalid or expired OTP. Please try again.' :
        status === 429 ? 'Too many attempts. Please try again later.' :
        'Verification failed. Please try again.';
      useAuthStore.getState().setError(message);
      throw err;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
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
    isLoading,
    error,
    language,
    mfaRequired,
    otpSent,
    loginAdmin,
    loginNurse,
    verifyMfa,
    sendOtp,
    verifyOtp,
    logout,
    hasPermission,
    hasAnyPermission,
    hasRole,
    isSuperAdmin: portalType === 'admin' && user !== null && 'role' in user && user.role === 'super_admin',
    isStateAdmin: portalType === 'admin' && user !== null && 'role' in user && user.role === 'state_admin',
  };
}

export default useAuth;
