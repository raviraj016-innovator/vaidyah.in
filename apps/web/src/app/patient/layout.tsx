'use client';

import React from 'react';
import { Layout } from 'antd';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { PatientTabs } from '@/components/layout/patient-tabs';
import { GuestBanner } from '@/components/layout/guest-banner';

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requiredPortal="patient">
      <Layout style={{ minHeight: '100vh', background: '#fafafa' }}>
        <style>{`
          .patient-shell { display: flex; min-height: 100vh; }
          .patient-content { flex: 1; padding: 24px; max-width: 960px; width: 100%; margin: 0 auto; box-sizing: border-box; overflow-x: hidden; }
          @media (max-width: 768px) {
            .patient-content { padding: 16px; padding-bottom: 76px; }
          }
          @media (max-width: 480px) {
            .patient-content { padding: 12px; padding-bottom: 72px; }
          }
        `}</style>
        <GuestBanner />
        <div className="patient-shell">
          <PatientTabs />
          <Layout.Content className="patient-content">
            {children}
          </Layout.Content>
        </div>
      </Layout>
    </AuthGuard>
  );
}
