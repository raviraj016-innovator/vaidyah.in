import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, AdminRole, Permission } from '../store/authStore';
import { authApi } from '../config/api';

// ---------------------------------------------------------------------------
// Auth hook with role checking utilities
// ---------------------------------------------------------------------------

export function useAuth() {
  const navigate = useNavigate();
  const {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout: storeLogout,
    setLoading,
    hasPermission,
    hasAnyPermission,
    hasRole,
    hasAnyRole,
  } = useAuthStore();

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const { data } = await authApi.post('/login', { email, password });

        login(
          {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            permissions: data.user.permissions,
            avatar: data.user.avatar,
            centerId: data.user.center_id,
            state: data.user.state,
            district: data.user.district,
            lastLogin: data.user.last_login,
          },
          data.access_token,
          data.refresh_token,
        );

        navigate('/');
      } catch (error) {
        setLoading(false);
        throw error;
      }
    },
    [login, navigate, setLoading],
  );

  const handleLogout = useCallback(async () => {
    try {
      if (token) {
        await authApi.post('/logout', {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Ignore logout API errors
    } finally {
      storeLogout();
      navigate('/login');
    }
  }, [token, storeLogout, navigate]);

  const requirePermission = useCallback(
    (permission: Permission): boolean => {
      if (!isAuthenticated || !user) return false;
      return hasPermission(permission);
    },
    [isAuthenticated, user, hasPermission],
  );

  const requireRole = useCallback(
    (role: AdminRole): boolean => {
      if (!isAuthenticated || !user) return false;
      return hasRole(role);
    },
    [isAuthenticated, user, hasRole],
  );

  const requireAnyRole = useCallback(
    (roles: AdminRole[]): boolean => {
      if (!isAuthenticated || !user) return false;
      return hasAnyRole(roles);
    },
    [isAuthenticated, user, hasAnyRole],
  );

  const isSuperAdmin = user?.role === 'super_admin';
  const isStateAdmin = user?.role === 'state_admin';
  const isDistrictAdmin = user?.role === 'district_admin';

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    isSuperAdmin,
    isStateAdmin,
    isDistrictAdmin,
    login: handleLogin,
    logout: handleLogout,
    hasPermission,
    hasAnyPermission,
    hasRole,
    hasAnyRole,
    requirePermission,
    requireRole,
    requireAnyRole,
  };
}

export default useAuth;
