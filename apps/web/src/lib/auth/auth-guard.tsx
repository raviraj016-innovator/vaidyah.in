'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, PortalType } from '@/stores/auth-store';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredPortal: PortalType;
}

export function AuthGuard({ children, requiredPortal }: AuthGuardProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const portalType = useAuthStore((s) => s.portalType);
  const userRole = useAuthStore((s) => s.user && 'role' in s.user ? s.user.role : null);

  // Initialize synchronously — avoids 1-frame spinner flash when store is already hydrated
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    // Double-check in case it finished between useState init and effect
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  // Redirect only after hydration is complete
  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace(`/${requiredPortal}/login`);
      return;
    }
    if (portalType !== requiredPortal) {
      router.replace('/');
      return;
    }
    const portalRoleMap: Record<PortalType, string[]> = {
      admin: ['super_admin', 'state_admin', 'district_admin', 'viewer'],
      nurse: ['nurse', 'anm', 'staff_nurse', 'senior_nurse', 'junior_nurse'],
      patient: [],
    };
    const allowedRoles = portalRoleMap[requiredPortal];
    if (allowedRoles.length > 0 && userRole && !allowedRoles.includes(userRole as string)) {
      router.replace('/');
    }
  }, [hydrated, isAuthenticated, portalType, userRole, requiredPortal, router]);

  if (!hydrated || !isAuthenticated || portalType !== requiredPortal) {
    // Lightweight CSS-only spinner — no antd import, renders instantly
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #f0f0f0',
          borderTopColor: '#7c3aed', borderRadius: '50%',
          animation: 'auth-spin 0.6s linear infinite',
        }} />
        <style>{`@keyframes auth-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}

export default AuthGuard;
