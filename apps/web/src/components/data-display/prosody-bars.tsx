'use client';

import { Progress, Space, Typography } from 'antd';

interface ProsodyScores {
  distress?: number;
  pain?: number;
  anxiety?: number;
  speechRate?: number;
  vocalTremor?: number;
  breathlessness?: number;
  fatigue?: number;
}

interface ProsodyBarsProps {
  scores: ProsodyScores;
}

const PROSODY_LABELS: Record<string, { label: string; color: string }> = {
  distress: { label: 'Distress', color: '#dc2626' },
  pain: { label: 'Pain', color: '#ea580c' },
  anxiety: { label: 'Anxiety', color: '#d97706' },
  speechRate: { label: 'Speech Rate', color: '#2563eb' },
  vocalTremor: { label: 'Vocal Tremor', color: '#7c3aed' },
  breathlessness: { label: 'Breathlessness', color: '#0891b2' },
  fatigue: { label: 'Fatigue', color: '#64748b' },
};

export function ProsodyBars({ scores }: ProsodyBarsProps) {
  const entries = Object.entries(scores).filter(
    ([, val]) => val !== undefined && val !== null,
  );

  if (entries.length === 0) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      {entries.map(([key, value]) => {
        const config = PROSODY_LABELS[key];
        if (!config) return null;
        const numValue = typeof value === 'number' ? value : 0;
        const percent = Math.min(100, Math.max(0, Math.round(numValue * 100)));
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <Typography.Text style={{ fontSize: 12 }}>{config.label}</Typography.Text>
              <Typography.Text style={{ fontSize: 12 }}>{percent}%</Typography.Text>
            </div>
            <Progress
              percent={percent}
              showInfo={false}
              strokeColor={config.color}
              size="small"
            />
          </div>
        );
      })}
    </Space>
  );
}
