'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout, Menu, Typography, Avatar, Dropdown, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  BankOutlined,
  TeamOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ApiOutlined,
  ExperimentOutlined,
  LogoutOutlined,
  UserOutlined,
  HeartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuthStore, AdminUser } from '@/stores/auth-store';
import { useAuth } from '@/lib/auth/use-auth';

const { Sider } = Layout;
const { Text } = Typography;

const MENU_ITEMS: MenuProps['items'] = [
  {
    key: '/admin/dashboard',
    icon: <DashboardOutlined />,
    label: <Link href="/admin/dashboard" prefetch>Dashboard</Link>,
  },
  {
    key: '/admin/centers',
    icon: <BankOutlined />,
    label: <Link href="/admin/centers" prefetch>Health Centers</Link>,
  },
  {
    key: '/admin/users',
    icon: <TeamOutlined />,
    label: <Link href="/admin/users" prefetch>Users</Link>,
  },
  {
    key: '/admin/consultations',
    icon: <FileTextOutlined />,
    label: <Link href="/admin/consultations" prefetch>Consultations</Link>,
  },
  {
    key: '/admin/trials',
    icon: <ExperimentOutlined />,
    label: <Link href="/admin/trials" prefetch>Clinical Trials</Link>,
  },
  {
    key: '/admin/analytics',
    icon: <BarChartOutlined />,
    label: <Link href="/admin/analytics" prefetch>Analytics</Link>,
  },
  {
    key: '/admin/system',
    icon: <ApiOutlined />,
    label: <Link href="/admin/system" prefetch>System Health</Link>,
  },
];

const SIDEBAR_WIDTH = 250;
const SIDEBAR_COLLAPSED_WIDTH = 80;

interface AdminSidebarProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  /** When true, render as inline (for mobile drawer) without fixed positioning */
  inline?: boolean;
}

export function AdminSidebar({ collapsed: controlledCollapsed, onCollapse, inline = false }: AdminSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user) as AdminUser | null;
  const { logout } = useAuth();

  // Use controlled state from parent, fallback to false for inline/drawer mode
  const collapsed = inline ? false : (controlledCollapsed ?? false);

  const handleCollapse = (value: boolean) => {
    onCollapse?.(value);
  };

  const matchedItem = (MENU_ITEMS ?? []).find(
    (item) => item && 'key' in item && pathname.startsWith(item.key as string),
  );
  const selectedKey = matchedItem && 'key' in matchedItem
    ? (matchedItem.key as string)
    : '/admin/dashboard';

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
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
    <Sider
      collapsible={!inline}
      collapsed={collapsed}
      onCollapse={handleCollapse}
      trigger={null}
      width={inline ? '100%' : SIDEBAR_WIDTH}
      collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
      style={{
        background: '#fff',
        borderRight: inline ? 'none' : '1px solid #f0f0f0',
        height: '100vh',
        position: inline ? 'relative' : 'fixed',
        left: inline ? undefined : 0,
        top: inline ? undefined : 0,
        bottom: inline ? undefined : 0,
        zIndex: inline ? undefined : 90,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '0 16px' : '0 20px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(124,58,237,0.2)',
            }}
          >
            <HeartOutlined style={{ fontSize: 16, color: '#fff' }} />
          </div>
          {!collapsed && (
            <Text strong style={{ fontSize: 18, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
              Vaidyah
            </Text>
          )}
        </div>
        {!inline && !collapsed && (
          <Button
            type="text"
            icon={<MenuFoldOutlined />}
            onClick={() => handleCollapse(true)}
            size="small"
          />
        )}
        {!inline && collapsed && (
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={() => handleCollapse(false)}
            size="small"
          />
        )}
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          style={{ border: 'none' }}
        />
      </div>

      {/* User info at bottom */}
      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          padding: collapsed ? '12px 8px' : '12px 16px',
        }}
      >
        <Dropdown
          menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
          trigger={['click']}
          placement="topRight"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              padding: '8px',
              borderRadius: 10,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f3ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <Avatar
              size={34}
              icon={<UserOutlined />}
              src={user?.avatar}
              style={{ backgroundColor: '#7c3aed', flexShrink: 0 }}
            />
            {!collapsed && (
              <div style={{ overflow: 'hidden' }}>
                <Text
                  strong
                  style={{
                    display: 'block',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {user?.name ?? 'Admin User'}
                </Text>
                <Text
                  type="secondary"
                  style={{
                    display: 'block',
                    fontSize: 11,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.role?.replace(/_/g, ' ') ?? 'Administrator'}
                </Text>
              </div>
            )}
          </div>
        </Dropdown>
      </div>
    </Sider>
  );
}

export { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH };
export default AdminSidebar;
