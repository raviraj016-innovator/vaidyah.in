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
    <>
      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; }
        .page-header-title { margin: 0 !important; letter-spacing: -0.02em; font-weight: 700 !important; }
        @media (max-width: 480px) {
          .page-header { margin-bottom: 20px; gap: 8px; }
          .page-header-title { font-size: 20px !important; }
        }
      `}</style>
      <div className="page-header">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography.Title level={3} className="page-header-title">
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
    </>
  );
}
