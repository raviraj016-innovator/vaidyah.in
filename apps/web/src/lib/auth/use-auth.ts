'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, type AdminUser, type NurseUser, type PatientUser, type Permission } from '@/stores/auth-store';
import { authApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

// Demo mode: when backend is unreachable, use mock data.
// Next.js rewrite proxy returns 500/502/503/504 when the upstream is down,
// or Axios throws a network error if the proxy itself is unreachable.
function isBackendUnavailable(err: any): boolean {
  if (!err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || err.message === 'Network Error')) {
    return true;
  }
  const status = err.response?.status;
  if (status && [500, 502, 503, 504].includes(status)) {
    // Check if the response is an HTML error page (proxy error) vs a real API error
    const ct = err.response?.headers?.['content-type'] ?? '';
    if (!ct.includes('application/json')) return true;
  }
  return false;
}

const DEMO_TOKEN = 'demo-jwt-token';
const DEMO_REFRESH = 'demo-refresh-token';

const demoAdmin: AdminUser = {
  id: 'admin-demo-001',
  name: 'Dr. Priya Sharma',
  email: 'admin@vaidyah.demo',
  role: 'super_admin',
  permissions: [
    'centers:read', 'centers:write', 'centers:delete',
    'users:read', 'users:write', 'users:delete',
    'consultations:read', 'consultations:write',
    'trials:read', 'trials:write', 'trials:sync',
    'analytics:read',
    'system:read', 'system:manage',
  ],
  lastLogin: new Date().toISOString(),
};

const demoNurse: NurseUser = {
  id: 'nurse-demo-001',
  name: 'Anjali Devi',
  registrationNumber: 'NRS-2024-0042',
  role: 'staff_nurse',
  centerId: 'center-demo-001',
  centerName: 'PHC Motihari',
};

const demoPatient: PatientUser = {
  id: 'patient-demo-001',
  name: 'Rajesh Kumar',
  phone: '+919876543210',
  abdmId: '91-1234-5678-9012',
  profileComplete: true,
};

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
      router.push('/admin/dashboard');
    } catch (err: any) {
      if (isBackendUnavailable(err)) {
        useAuthStore.getState().loginAdmin(demoAdmin, DEMO_TOKEN, DEMO_REFRESH);
        router.push('/admin/dashboard');
        return;
      }
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
      router.push('/nurse/dashboard');
      return { mfaRequired: false };
    } catch (err: any) {
      if (isBackendUnavailable(err)) {
        useAuthStore.getState().loginNurse(demoNurse, DEMO_TOKEN, DEMO_REFRESH);
        router.push('/nurse/dashboard');
        return { mfaRequired: false };
      }
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
      router.push('/nurse/dashboard');
    } catch (err: any) {
      if (isBackendUnavailable(err)) {
        useAuthStore.getState().loginNurse(demoNurse, DEMO_TOKEN, DEMO_REFRESH);
        router.push('/nurse/dashboard');
        return;
      }
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
      if (isBackendUnavailable(err)) {
        // Demo mode: simulate OTP sent
        useAuthStore.getState().setOtpSent(true, 'demo-otp-session');
        return;
      }
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
      router.push('/patient/home');
    } catch (err: any) {
      if (isBackendUnavailable(err)) {
        // Demo mode: any OTP works
        useAuthStore.getState().loginPatient(demoPatient, DEMO_TOKEN, DEMO_REFRESH);
        router.push('/patient/home');
        return;
      }
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
