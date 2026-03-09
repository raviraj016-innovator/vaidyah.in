'use client';

import React from 'react';
import { Layout, Tooltip, Button } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { NurseHeader } from '@/components/layout/nurse-header';
import { GuestBanner } from '@/components/layout/guest-banner';
import { useVoiceBotStore } from '@/stores/voice-bot-store';
import { useSessionStore } from '@/stores/session-store';
import VoiceBot from '@/components/voice-bot/VoiceBot';

function NurseLayoutInner({ children }: { children: React.ReactNode }) {
  const voiceBotOpen = useVoiceBotStore((s) => s.open);
  const setVoiceBotOpen = useVoiceBotStore((s) => s.setOpen);
  const patient = useSessionStore((s) => s.patient);

  return (
    <Layout style={{ minHeight: '100vh', background: '#fafafa' }}>
      <style>{`
        .nurse-content { padding: 24px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
        @media (max-width: 768px) { .nurse-content { padding: 16px; } }
        @media (max-width: 480px) { .nurse-content { padding: 12px; } }
      `}</style>
      <GuestBanner />
      <NurseHeader />
      <Layout.Content className="nurse-content">
        {children}
      </Layout.Content>

      {/* Voice Chatbot — available on all nurse pages when a session is active */}
      {patient && (
        <>
          <VoiceBot open={voiceBotOpen} onClose={() => setVoiceBotOpen(false)} />
          <Tooltip title="Voice Chatbot" placement="left">
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={<SoundOutlined style={{ fontSize: 22 }} />}
              onClick={() => setVoiceBotOpen(true)}
              style={{
                position: 'fixed',
                bottom: 32,
                right: 32,
                width: 56,
                height: 56,
                zIndex: 100,
                background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
                border: 'none',
                boxShadow: '0 4px 16px rgba(124, 58, 237, 0.4)',
              }}
            />
          </Tooltip>
        </>
      )}
    </Layout>
  );
}

export default function NurseLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredPortal="nurse">
      <NurseLayoutInner>{children}</NurseLayoutInner>
    </AuthGuard>
  );
}
