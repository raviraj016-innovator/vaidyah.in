'use client';

import { useEffect, useState } from 'react';
import { Badge, Typography, Space } from 'antd';
import { WifiOutlined, DisconnectOutlined } from '@ant-design/icons';

export function SyncStatusBadge() {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Render a single consistent structure; only the values change after mount
  const statusType = !mounted ? 'processing' : online ? 'success' : 'error';
  const label = !mounted ? 'Checking...' : online ? 'Online' : 'Offline';
  const labelColor = !mounted ? '#6b7280' : online ? '#16a34a' : '#dc2626';
  const icon = !mounted ? null : online
    ? <WifiOutlined style={{ color: '#16a34a', fontSize: 14 }} />
    : <DisconnectOutlined style={{ color: '#dc2626', fontSize: 14 }} />;

  return (
    <Space size={6} align="center" suppressHydrationWarning>
      <Badge status={statusType} />
      {icon}
      <Typography.Text style={{ fontSize: 12, color: labelColor }}>{label}</Typography.Text>
    </Space>
  );
}
