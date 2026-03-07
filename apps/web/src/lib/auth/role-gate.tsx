'use client';

import { ReactNode, useMemo } from 'react';
import { useAuthStore, Permission, AdminUser } from '@/stores/auth-store';

interface RoleGateProps {
  /** Single permission to check */
  permission?: Permission;
  /** Multiple permissions to check */
  permissions?: Permission[];
  /** If true, ALL permissions must be present; otherwise ANY is sufficient */
  requireAll?: boolean;
  /** Set to true to explicitly allow auth-only gating (no permission check). Without this, RoleGate denies access when no permissions are specified. */
  authOnly?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({
  permission,
  permissions,
  requireAll = false,
  authOnly = false,
  children,
  fallback = null,
}: RoleGateProps) {
  // Select reactive state (not function refs) so component re-renders on auth changes
  const user = useAuthStore((s) => s.user);
  const portalType = useAuthStore((s) => s.portalType);

  const userPermissions = useMemo(() => {
    if (!user || portalType !== 'admin') return [];
    return (user as AdminUser).permissions ?? [];
  }, [user, portalType]);

  if (!user) return <>{fallback}</>;

  if (permission) {
    return userPermissions.includes(permission) ? <>{children}</> : <>{fallback}</>;
  }

  if (permissions) {
    if (requireAll) {
      const hasAll = permissions.every((p) => userPermissions.includes(p));
      return hasAll ? <>{children}</> : <>{fallback}</>;
    }
    const hasAny = permissions.some((p) => userPermissions.includes(p));
    return hasAny ? <>{children}</> : <>{fallback}</>;
  }

  // Deny by default unless authOnly is explicitly set
  if (!authOnly) return <>{fallback}</>;

  return <>{children}</>;
}

export default RoleGate;
