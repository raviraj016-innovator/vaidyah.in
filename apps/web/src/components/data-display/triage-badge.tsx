'use client';

import { Tag } from 'antd';

interface TriageBadgeProps {
  category: 'A' | 'B' | 'C';
  label?: string;
  size?: 'small' | 'default' | 'large';
}

const TRIAGE_CONFIG = {
  A: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Emergency' },
  B: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'Urgent' },
  C: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'Non-Urgent' },
};

export function TriageBadge({ category, label, size = 'default' }: TriageBadgeProps) {
  const config = TRIAGE_CONFIG[category] ?? { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'Unknown' };
  const fontSize = size === 'large' ? 16 : size === 'small' ? 11 : 13;
  const padding = size === 'large' ? '4px 16px' : size === 'small' ? '0 6px' : '2px 10px';

  return (
    <Tag
      style={{
        color: config.color,
        backgroundColor: config.bg,
        borderColor: config.border,
        fontWeight: 600,
        fontSize,
        padding,
      }}
    >
      Category {category} - {label ?? config.label}
    </Tag>
  );
}
