'use client';

import { Card, Statistic, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  trendLabel?: string;
  suffix?: string;
  prefix?: string;
  loading?: boolean;
  iconColor?: string;
  iconBgColor?: string;
}

export function StatsCard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  suffix,
  prefix,
  loading = false,
  iconColor = '#7c3aed',
  iconBgColor = '#f5f3ff',
}: StatsCardProps) {
  return (
    <>
      <style>{`
        .stats-card .ant-statistic-content-value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
        @media (max-width: 768px) {
          .stats-card .ant-statistic-content-value { font-size: 22px; }
          .stats-card-icon { width: 38px !important; height: 38px !important; font-size: 17px !important; }
        }
        @media (max-width: 480px) {
          .stats-card .ant-statistic-content-value { font-size: 20px; }
          .stats-card-icon { width: 34px !important; height: 34px !important; font-size: 15px !important; }
        }
      `}</style>
      <Card loading={loading} styles={{ body: { padding: 20 } }} className="stats-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
              {title}
            </Typography.Text>
            <Statistic
              value={value}
              suffix={suffix}
              prefix={prefix}
              valueStyle={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}
            />
            {trend !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                {trend >= 0 ? (
                  <ArrowUpOutlined style={{ color: '#16a34a', fontSize: 11 }} />
                ) : (
                  <ArrowDownOutlined style={{ color: '#dc2626', fontSize: 11 }} />
                )}
                <Typography.Text
                  style={{ fontSize: 12, color: trend >= 0 ? '#16a34a' : '#dc2626', fontWeight: 500 }}
                >
                  {Math.abs(trend)}%
                </Typography.Text>
                {trendLabel && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {trendLabel}
                  </Typography.Text>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div
              className="stats-card-icon"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: iconBgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: iconColor,
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
