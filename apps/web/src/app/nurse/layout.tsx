'use client';

import React from 'react';
import { Layout } from 'antd';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { NurseHeader } from '@/components/layout/nurse-header';

export default function NurseLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredPortal="nurse">
      <Layout style={{ minHeight: '100vh', background: '#fafafa' }}>
        <style>{`
          .nurse-content { padding: 24px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
          @media (max-width: 768px) { .nurse-content { padding: 16px; } }
          @media (max-width: 480px) { .nurse-content { padding: 12px; } }
        `}</style>
        <NurseHeader />
        <Layout.Content className="nurse-content">
          {children}
        </Layout.Content>
      </Layout>
    </AuthGuard>
  );
}
