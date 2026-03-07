'use client';

import { Typography } from 'antd';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

export function PageHeader({ title, subtitle, extra }: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ margin: 0, letterSpacing: '-0.02em', fontWeight: 700 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 14, marginTop: 2, display: 'block' }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      {extra && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{extra}</div>}
    </div>
  );
}
