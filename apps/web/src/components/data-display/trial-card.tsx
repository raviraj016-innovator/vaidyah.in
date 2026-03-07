'use client';

import { Card, Tag, Typography, Space, Progress } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';

interface TrialCardProps {
  id: string;
  title: string;
  summary?: string;
  phase?: string;
  status?: string;
  conditions?: string[];
  matchScore?: number;
  location?: string;
  sponsor?: string;
  onClick?: (id: string) => void;
}

export function TrialCard({
  id,
  title,
  summary,
  phase,
  status,
  conditions,
  matchScore,
  location,
  sponsor,
  onClick,
}: TrialCardProps) {
  const scoreColor =
    matchScore !== undefined && matchScore >= 0.7 ? '#16a34a' : matchScore !== undefined && matchScore >= 0.4 ? '#d97706' : '#6b7280';

  return (
    <Card
      hoverable
      onClick={() => onClick?.(id)}
      styles={{ body: { padding: 16 } }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Typography.Title level={5} style={{ margin: 0, flex: 1 }}>
            {title}
          </Typography.Title>
          {matchScore !== undefined && (
            <Progress
              type="circle"
              percent={Math.round(matchScore * 100)}
              size={44}
              strokeColor={scoreColor}
              format={(p) => `${p}%`}
            />
          )}
        </div>

        {summary && (
          <Typography.Paragraph
            type="secondary"
            ellipsis={{ rows: 2 }}
            style={{ margin: 0, fontSize: 13 }}
          >
            {summary}
          </Typography.Paragraph>
        )}

        <Space wrap size={[4, 4]}>
          {phase && <Tag color="blue">{phase}</Tag>}
          {status && <Tag color="green">{status}</Tag>}
          {conditions?.slice(0, 3).map((c) => (
            <Tag key={c}>{c}</Tag>
          ))}
        </Space>

        <Space size="middle" wrap>
          {location && (
            <Space size={4}>
              <EnvironmentOutlined style={{ color: '#6b7280', fontSize: 12 }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {location}
              </Typography.Text>
            </Space>
          )}
          {sponsor && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {sponsor}
            </Typography.Text>
          )}
        </Space>
      </Space>
    </Card>
  );
}
