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

  if (!mounted) {
    return (
      <Space size={6} align="center">
        <Badge status="processing" />
        <Typography.Text style={{ fontSize: 12, color: '#6b7280' }}>Checking...</Typography.Text>
      </Space>
    );
  }

  return (
    <Space size={6} align="center">
      <Badge status={online ? 'success' : 'error'} />
      {online ? (
        <Space size={4}>
          <WifiOutlined style={{ color: '#16a34a', fontSize: 14 }} />
          <Typography.Text style={{ fontSize: 12, color: '#16a34a' }}>Online</Typography.Text>
        </Space>
      ) : (
        <Space size={4}>
          <DisconnectOutlined style={{ color: '#dc2626', fontSize: 14 }} />
          <Typography.Text style={{ fontSize: 12, color: '#dc2626' }}>Offline</Typography.Text>
        </Space>
      )}
    </Space>
  );
}
