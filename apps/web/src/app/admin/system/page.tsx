'use client';

import React from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Typography,
  Progress,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  AlertOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { StatsCard } from '@/components/ui/stats-card';
import { PageHeader } from '@/components/ui/page-header';
import { LineChart } from '@/components/charts/line-chart';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  key: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  responseTime: number;
  version: string;
  lastChecked: string;
  errorRate: number;
}

interface ActiveAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  service: string;
  message: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockServices: ServiceStatus[] = [
  {
    key: 'api-gateway',
    name: 'API Gateway',
    status: 'healthy',
    uptime: '99.97%',
    responseTime: 45,
    version: '2.3.1',
    lastChecked: '30 sec ago',
    errorRate: 0.03,
  },
  {
    key: 'nlu-service',
    name: 'NLU Service',
    status: 'healthy',
    uptime: '99.92%',
    responseTime: 320,
    version: '1.8.0',
    lastChecked: '1 min ago',
    errorRate: 0.08,
  },
  {
    key: 'voice-service',
    name: 'Voice Service',
    status: 'healthy',
    uptime: '99.89%',
    responseTime: 180,
    version: '1.5.2',
    lastChecked: '45 sec ago',
    errorRate: 0.11,
  },
  {
    key: 'clinical-service',
    name: 'Clinical Service',
    status: 'healthy',
    uptime: '99.95%',
    responseTime: 95,
    version: '2.1.0',
    lastChecked: '30 sec ago',
    errorRate: 0.05,
  },
  {
    key: 'trial-service',
    name: 'Trial Matching Service',
    status: 'degraded',
    uptime: '98.45%',
    responseTime: 890,
    version: '1.2.3',
    lastChecked: '2 min ago',
    errorRate: 1.55,
  },
  {
    key: 'integration-service',
    name: 'Integration Service (ABDM)',
    status: 'healthy',
    uptime: '99.78%',
    responseTime: 210,
    version: '1.4.1',
    lastChecked: '1 min ago',
    errorRate: 0.22,
  },
  {
    key: 'prosody-ml',
    name: 'Prosody Analysis (ML)',
    status: 'healthy',
    uptime: '99.85%',
    responseTime: 450,
    version: '0.9.5',
    lastChecked: '30 sec ago',
    errorRate: 0.15,
  },
  {
    key: 'contradiction-ml',
    name: 'Contradiction Detection (ML)',
    status: 'down',
    uptime: '95.20%',
    responseTime: 0,
    version: '0.7.2',
    lastChecked: '5 min ago',
    errorRate: 4.80,
  },
];

const mockAlerts: ActiveAlert[] = [
  {
    id: 'a-001',
    severity: 'error',
    service: 'Contradiction Detection',
    message: 'Service unresponsive. Last successful health check was 5 minutes ago. Auto-restart initiated.',
    timestamp: '2026-03-02 10:42:00',
  },
  {
    id: 'a-002',
    severity: 'warning',
    service: 'Trial Matching Service',
    message: 'Response time exceeding SLA threshold (890ms > 500ms). Possible connection pool exhaustion to OpenSearch cluster.',
    timestamp: '2026-03-02 10:38:00',
  },
  {
    id: 'a-003',
    severity: 'warning',
    service: 'PHC Durg Connectivity',
    message: 'Intermittent connectivity detected for health center PHC Durg. Sync queue growing (142 pending items).',
    timestamp: '2026-03-02 10:25:00',
  },
  {
    id: 'a-004',
    severity: 'info',
    service: 'NLU Service',
    message: 'Bedrock model endpoint switching to new version. Canary deployment at 10% traffic.',
    timestamp: '2026-03-02 10:15:00',
  },
];

function generateResponseTimeTrend() {
  const data: { time: string; responseTime: number; service: string }[] = [];
  const services = ['API Gateway', 'NLU Service', 'Voice Service', 'Clinical Service', 'Trial Service'];
  const baseTimes: Record<string, number> = {
    'API Gateway': 45,
    'NLU Service': 320,
    'Voice Service': 180,
    'Clinical Service': 95,
    'Trial Service': 500,
  };

  for (let h = 0; h < 24; h++) {
    const timeStr = `${h.toString().padStart(2, '0')}:00`;
    for (const svc of services) {
      const base = baseTimes[svc];
      const jitter = (Math.random() - 0.5) * base * 0.4;
      // Simulate a spike for Trial Service between 10-12
      const spike = svc === 'Trial Service' && h >= 10 && h <= 12 ? base * 0.8 : 0;
      data.push({
        time: timeStr,
        responseTime: Math.max(10, Math.round(base + jitter + spike)),
        service: svc,
      });
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SystemHealthPage() {
  const { data: services } = useQuery({
    queryKey: ['admin', 'system', 'services'],
    queryFn: fetchWithFallback(endpoints.system.services, mockServices),
    staleTime: 30_000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['admin', 'system', 'alerts'],
    queryFn: fetchWithFallback(endpoints.system.alerts, mockAlerts),
    staleTime: 30_000,
  });

  const activeServices = services ?? mockServices;
  const activeAlerts = alerts ?? mockAlerts;

  const healthyCount = activeServices.filter((s) => s.status === 'healthy').length;
  const degradedCount = activeServices.filter((s) => s.status === 'degraded').length;
  const downCount = activeServices.filter((s) => s.status === 'down').length;
  const avgResponseTime = Math.round(
    activeServices.filter((s) => s.responseTime > 0).reduce((sum, s) => sum + s.responseTime, 0) /
      (activeServices.filter((s) => s.responseTime > 0).length || 1),
  );

  const { data: responseTrendData } = useQuery({
    queryKey: ['admin', 'system', 'responseTrend'],
    queryFn: fetchWithFallback(endpoints.system.responseTimes, generateResponseTimeTrend()),
    staleTime: 60_000,
  });

  const statusTagColor: Record<string, string> = {
    healthy: 'green',
    degraded: 'orange',
    down: 'red',
  };

  const statusIcon: Record<string, React.ReactNode> = {
    healthy: <CheckCircleOutlined />,
    degraded: <ExclamationCircleOutlined />,
    down: <CloseCircleOutlined />,
  };

  const columns: ColumnsType<ServiceStatus> = [
    {
      title: 'Service',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag
          icon={statusIcon[status]}
          color={statusTagColor[status]}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Tag>
      ),
      filters: [
        { text: 'Healthy', value: 'healthy' },
        { text: 'Degraded', value: 'degraded' },
        { text: 'Down', value: 'down' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Uptime',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 100,
      align: 'center',
      render: (uptime: string) => {
        const val = parseFloat(uptime);
        return (
          <Text
            style={{
              color: val >= 99.9 ? '#16a34a' : val >= 99 ? '#d97706' : '#dc2626',
              fontWeight: 600,
            }}
          >
            {uptime}
          </Text>
        );
      },
    },
    {
      title: 'Response Time',
      dataIndex: 'responseTime',
      key: 'responseTime',
      width: 130,
      responsive: ['md'] as any,
      align: 'center',
      render: (ms: number) =>
        ms === 0 ? (
          <Text type="danger">N/A</Text>
        ) : (
          <Text
            style={{
              color: ms <= 200 ? '#16a34a' : ms <= 500 ? '#d97706' : '#dc2626',
            }}
          >
            {ms} ms
          </Text>
        ),
      sorter: (a, b) => a.responseTime - b.responseTime,
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 90,
      responsive: ['lg'] as any,
      align: 'center',
      render: (ver: string) => (
        <Tag style={{ fontSize: 11 }}>v{ver}</Tag>
      ),
    },
    {
      title: 'Last Checked',
      dataIndex: 'lastChecked',
      key: 'lastChecked',
      width: 120,
      responsive: ['md'] as any,
      render: (val: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {val}
        </Text>
      ),
    },
  ];

  const alertTypeMap: Record<string, 'error' | 'warning' | 'info'> = {
    error: 'error',
    warning: 'warning',
    info: 'info',
  };

  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle="Real-time monitoring of all Vaidyah platform services"
      />

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Healthy Services"
            value={healthyCount}
            suffix={`/ ${activeServices.length}`}
            icon={<CheckCircleOutlined />}
            loading={false}
            iconColor="#16a34a"
            iconBgColor="#f0fdf4"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Avg Response Time"
            value={avgResponseTime}
            suffix="ms"
            icon={<ClockCircleOutlined />}
            loading={false}
            iconColor="#2563eb"
            iconBgColor="#eff6ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Active Alerts"
            value={activeAlerts.length}
            icon={<AlertOutlined />}
            loading={false}
            iconColor="#d97706"
            iconBgColor="#fffbeb"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Degraded / Down"
            value={degradedCount + downCount}
            icon={<WarningOutlined />}
            loading={false}
            iconColor={degradedCount + downCount > 0 ? '#dc2626' : '#16a34a'}
            iconBgColor={degradedCount + downCount > 0 ? '#fef2f2' : '#f0fdf4'}
          />
        </Col>
      </Row>

      {/* Service Status Table */}
      <Card
        title="Service Status"
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="key"
          dataSource={activeServices}
          columns={columns}
          pagination={false}
          size="middle"
          scroll={{ x: 500 }}
        />
      </Card>

      {/* Response Times Chart */}
      <Card
        title="Response Times (24h)"
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: 16 } }}
      >
        {responseTrendData && (
          <LineChart
            data={responseTrendData}
            xField="time"
            yField="responseTime"
            colorField="service"
            height={350}
            color={['#7c3aed', '#0d9488', '#d97706', '#2563eb', '#dc2626']}
          />
        )}
      </Card>

      {/* Error Rates + Active Alerts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Error Rates by Service">
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              {activeServices.map((service) => {
                const color =
                  service.errorRate <= 0.1
                    ? '#16a34a'
                    : service.errorRate <= 1
                      ? '#d97706'
                      : '#dc2626';
                return (
                  <div key={service.key}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ fontSize: 13 }}>{service.name}</Text>
                      <Text
                        style={{ fontSize: 13, fontWeight: 600, color }}
                      >
                        {service.errorRate.toFixed(2)}%
                      </Text>
                    </div>
                    <Progress
                      percent={Math.min(service.errorRate * 10, 100)}
                      showInfo={false}
                      strokeColor={color}
                      trailColor="#f3f4f6"
                      size="small"
                    />
                  </div>
                );
              })}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Active Alerts">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              {activeAlerts.map((alert) => (
                <Alert
                  key={alert.id}
                  type={alertTypeMap[alert.severity]}
                  showIcon
                  message={
                    <Space size={8}>
                      <Text strong>{alert.service}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {alert.timestamp}
                      </Text>
                    </Space>
                  }
                  description={alert.message}
                  style={{ borderRadius: 8 }}
                />
              ))}
              {activeAlerts.length === 0 && (
                <Alert
                  type="success"
                  showIcon
                  message="All systems operational"
                  description="No active alerts at this time."
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
