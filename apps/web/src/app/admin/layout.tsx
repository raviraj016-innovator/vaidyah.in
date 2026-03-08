'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Input, Badge, Avatar, Dropdown, Typography, Button, Drawer } from 'antd';
import type { MenuProps } from 'antd';
import {
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { AuthGuard } from '@/lib/auth/auth-guard';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { GuestBanner } from '@/components/layout/guest-banner';
import { useAuthStore, AdminUser } from '@/stores/auth-store';
import { useAuth } from '@/lib/auth/use-auth';

const { Header, Content } = Layout;
const { Text } = Typography;

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user) as AdminUser | null;
  const { logout } = useAuth();
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const mobile = w <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setSiderCollapsed(true);
      } else if (w <= 1024) {
        // Auto-collapse on small laptops/tablets
        setSiderCollapsed(true);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const siderWidth = isMobile ? 0 : siderCollapsed ? 80 : 250;

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
    },
  ];

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      logout();
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <GuestBanner />
      {/* Desktop sidebar */}
      {!isMobile && <AdminSidebar onCollapse={setSiderCollapsed} />}

      {/* Mobile drawer sidebar */}
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={280}
          styles={{ body: { padding: 0 } }}
        >
          <AdminSidebar onCollapse={() => setDrawerOpen(false)} inline />
        </Drawer>
      )}

      <Layout style={{ marginLeft: siderWidth, transition: 'margin-left 0.2s' }}>
        <Header
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: isMobile ? '0 12px' : '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            height: 64,
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                style={{ flexShrink: 0 }}
              />
            )}
            <Input
              prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
              placeholder={isMobile ? 'Search...' : 'Search patients, centers, consultations...'}
              style={{ maxWidth: isMobile ? '100%' : 380, borderRadius: 10 }}
              allowClear
              variant="filled"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, flexShrink: 0 }}>
            <Badge count={3} size="small">
              <BellOutlined
                style={{ fontSize: 18, color: '#6b7280', cursor: 'pointer' }}
              />
            </Badge>

            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              trigger={['click']}
              placement="bottomRight"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 10, transition: 'background 0.2s' }}>
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  src={user?.avatar}
                  style={{ backgroundColor: '#7c3aed', flexShrink: 0 }}
                />
                {!isMobile && (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.3 }}>
                    <Text
                      strong
                      style={{
                        display: 'block',
                        fontSize: 13,
                        whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {user?.name ?? 'Admin'}
                    </Text>
                    <Text
                      type="secondary"
                      style={{ fontSize: 11 }}
                    >
                      {user?.role?.replace(/_/g, ' ') ?? 'admin'}
                    </Text>
                  </div>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          style={{
            padding: isMobile ? 12 : 24,
            background: '#fafafa',
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requiredPortal="admin">
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthGuard>
  );
}
