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
    <Card loading={loading} styles={{ body: { padding: 20 } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
        <div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
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
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
