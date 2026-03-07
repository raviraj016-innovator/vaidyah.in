'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Badge, Typography } from 'antd';
import {
  HomeOutlined,
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { useTrialStore } from '@/stores/trial-store';

const NAV_ITEMS = [
  { key: '/patient/home', icon: <HomeOutlined />, label: 'Home' },
  { key: '/patient/trials', icon: <SearchOutlined />, label: 'Search Trials' },
  { key: '/patient/notifications', icon: <BellOutlined />, label: 'Notifications' },
  { key: '/patient/profile', icon: <UserOutlined />, label: 'Profile' },
];

export function PatientTabs() {
  const pathname = usePathname();
  const notifications = useTrialStore((s) => s.notifications);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const activeKey =
    NAV_ITEMS.find((item) =>
      item.key === '/patient/home'
        ? pathname === '/patient/home'
        : pathname?.startsWith(item.key),
    )?.key ?? '/patient/home';

  const menuItems = NAV_ITEMS.map((item) => ({
    key: item.key,
    icon:
      item.key === '/patient/notifications' && unreadCount > 0 ? (
        <Badge count={unreadCount} size="small" offset={[4, -2]}>
          {item.icon}
        </Badge>
      ) : (
        item.icon
      ),
    label: <Link href={item.key} prefetch>{item.label}</Link>,
  }));

  if (!mounted) return null;

  // Mobile: bottom tab bar
  if (isMobile) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: 60,
          padding: '4px 0',
          paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <Link
              key={item.key}
              href={item.key}
              prefetch
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: isActive ? '#7c3aed' : '#9ca3af',
                transition: 'color 0.2s',
                textDecoration: 'none',
              }}
            >
              <div style={{ fontSize: 20, lineHeight: 1 }}>
                {item.key === '/patient/notifications' && unreadCount > 0 ? (
                  <Badge count={unreadCount} size="small" offset={[6, -2]}>
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </div>
              <Typography.Text
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: isActive ? '#7c3aed' : '#9ca3af',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.label}
              </Typography.Text>
            </Link>
          );
        })}
      </div>
    );
  }

  // Desktop: vertical side menu
  return (
    <div
      style={{
        width: 220,
        minHeight: '100vh',
        borderRight: '1px solid #f0f0f0',
        background: '#fff',
        paddingTop: 16,
      }}
    >
      <div style={{ padding: '0 16px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(124,58,237,0.2)',
            }}
          >
            <HeartOutlined style={{ fontSize: 14, color: '#fff' }} />
          </div>
          <Typography.Title
            level={4}
            style={{ margin: 0, color: '#0f172a', fontWeight: 700, letterSpacing: '-0.02em' }}
          >
            Vaidyah
          </Typography.Title>
        </div>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, display: 'block', marginTop: 4 }}
        >
          Patient Portal
        </Typography.Text>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[activeKey]}
        items={menuItems}
        style={{ borderInlineEnd: 'none', marginTop: 8 }}
      />
    </div>
  );
}
