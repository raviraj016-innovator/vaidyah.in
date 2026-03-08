'use client';

import React from 'react';
import { Progress, Space, Typography } from 'antd';

const { Text } = Typography;

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

const LABELS: Record<keyof ProsodyScores, string> = {
  distress: 'Distress',
  pain: 'Pain',
  anxiety: 'Anxiety',
  speechRate: 'Speech Rate',
  vocalTremor: 'Vocal Tremor',
  breathlessness: 'Breathlessness',
  fatigue: 'Fatigue',
};

function barColor(value: number): string {
  if (value >= 0.7) return '#ff4d4f';
  if (value >= 0.4) return '#faad14';
  return '#52c41a';
}

export function ProsodyBars({ scores }: ProsodyBarsProps) {
  const entries = Object.entries(scores).filter(
    ([, v]) => v !== undefined && v !== null,
  ) as [keyof ProsodyScores, number][];

  if (entries.length === 0) return null;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={4}>
      {entries.map(([key, value]) => (
        <div key={key}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {LABELS[key] ?? key}
          </Text>
          <Progress
            percent={Math.round(value * 100)}
            size="small"
            strokeColor={barColor(value)}
            format={(pct) => `${pct}%`}
          />
        </div>
      ))}
    </Space>
  );
}
