'use client';

import React from 'react';
import { Alert, Button } from 'antd';
import { useAuthStore } from '@/stores/auth-store';
import { useAuth } from '@/lib/auth/use-auth';

export function GuestBanner() {
  const isGuest = useAuthStore((s) => s.isGuest);
  const { logout } = useAuth();

  if (!isGuest) return null;

  return (
    <Alert
      banner
      type="info"
      showIcon={false}
      style={{
        textAlign: 'center',
        background: 'linear-gradient(90deg, #7c3aed, #6d28d9)',
        color: '#fff',
        borderRadius: 0,
        border: 'none',
        padding: '8px 16px',
        fontSize: 13,
      }}
      message={
        <span style={{ color: '#fff' }}>
          You are in <strong>Guest Demo Mode</strong> — data is simulated and API calls may not work.{' '}
          <Button
            type="link"
            size="small"
            onClick={logout}
            style={{ color: '#e9d5ff', padding: 0, fontWeight: 600, fontSize: 13 }}
          >
            Exit Guest Mode
          </Button>
        </span>
      }
    />
  );
}
