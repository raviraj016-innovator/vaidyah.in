'use client';

import { useEffect, useState } from 'react';
import { Layout, Typography, Avatar, Dropdown } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { useAuthStore, NurseUser } from '@/stores/auth-store';
import { useAuth } from '@/lib/auth/use-auth';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { SyncStatusBadge } from '@/components/layout/sync-status-badge';

export function NurseHeader() {
  const user = useAuthStore((s) => s.user) as NurseUser | null;
  const { logout } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const userName = user?.name ?? 'Nurse';
  const centerName = user?.centerName ?? 'Health Center';

  return (
    <Layout.Header
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #f0f0f0',
        padding: isMobile ? '0 12px' : '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: 8,
      }}
    >
      {/* Left: Logo + Center Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(124,58,237,0.2)',
            }}
          >
            <HeartOutlined style={{ fontSize: 16, color: '#fff' }} />
          </div>
          {!isMobile && (
            <Typography.Title
              level={4}
              style={{
                margin: 0,
                color: '#0f172a',
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              Vaidyah
            </Typography.Title>
          )}
        </div>
        {!isMobile && (
          <>
            <div
              style={{
                width: 1,
                height: 24,
                background: '#e5e7eb',
                flexShrink: 0,
              }}
            />
            <Typography.Text
              type="secondary"
              style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {centerName}
            </Typography.Text>
          </>
        )}
      </div>

      {/* Right: Sync + Language + User + Logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16, flexShrink: 0 }}>
        {!isMobile && <SyncStatusBadge />}
        <LanguageSwitcher />
        <Dropdown
          menu={{
            items: [
              {
                key: 'user-info',
                label: (
                  <div style={{ padding: '4px 0' }}>
                    <Typography.Text strong>{userName}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {centerName}
                    </Typography.Text>
                  </div>
                ),
                disabled: true,
              },
              { type: 'divider' },
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: 'Logout',
                danger: true,
                onClick: logout,
              },
            ],
          }}
          placement="bottomRight"
          trigger={['click']}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 10, transition: 'background 0.2s' }}
          >
            <Avatar
              size={32}
              icon={<UserOutlined />}
              src={user?.avatar}
              style={{ backgroundColor: '#7c3aed', flexShrink: 0 }}
            />
            {!isMobile && (
              <Typography.Text
                strong
                style={{ fontSize: 13, maxWidth: 120, display: 'inline-block', letterSpacing: '-0.01em' }}
                ellipsis
              >
                {userName}
              </Typography.Text>
            )}
          </div>
        </Dropdown>
      </div>
    </Layout.Header>
  );
}
