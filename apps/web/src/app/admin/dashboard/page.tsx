'use client';

import React from 'react';
import { Row, Col, Card, List, Badge, Typography, Tag, Space } from 'antd';
import {
  TeamOutlined,
  FileTextOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WifiOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { StatsCard } from '@/components/ui/stats-card';
import { PageHeader } from '@/components/ui/page-header';
import { LineChart } from '@/components/charts/line-chart';
import { PieChart } from '@/components/charts/pie-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';

const { Text } = Typography;

interface DashboardKpis {
  totalPatients: number;
  activeConsultations: number;
  activeCenters: number;
  triageAccuracy: number;
}

interface TrendPoint {
  date: string;
  count: number;
  type: string;
}

interface TriageCategory {
  category: string;
  count: number;
}

interface ConditionItem {
  condition: string;
  count: number;
}

interface CenterStatus {
  id: string;
  name: string;
  status: string;
  nurses: number;
  patients: number;
  connectivity: string;
}

const statusColor: Record<string, string> = {
  online: 'green',
  degraded: 'orange',
  offline: 'red',
};

const connectivityIcon: Record<string, React.ReactNode> = {
  good: <WifiOutlined style={{ color: '#16a34a' }} />,
  intermittent: <ExclamationCircleOutlined style={{ color: '#d97706' }} />,
  offline: <WifiOutlined style={{ color: '#dc2626' }} />,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminDashboardPage() {
  const { data: kpis, isLoading: kpiLoading } = useQuery<DashboardKpis>({
    queryKey: ['admin', 'dashboard', 'kpis'],
    queryFn: fetchWithFallback<DashboardKpis>(endpoints.dashboard.kpis),
    staleTime: 60_000,
  });

  const { data: trendData } = useQuery<TrendPoint[]>({
    queryKey: ['admin', 'dashboard', 'consultationTrend'],
    queryFn: fetchWithFallback<TrendPoint[]>(endpoints.dashboard.consultationsTrend),
    staleTime: 60_000,
  });

  const { data: triageData } = useQuery<TriageCategory[]>({
    queryKey: ['admin', 'dashboard', 'triageDistribution'],
    queryFn: fetchWithFallback<TriageCategory[]>(endpoints.dashboard.triageSummary),
    staleTime: 60_000,
  });

  const { data: conditionsData } = useQuery<ConditionItem[]>({
    queryKey: ['admin', 'dashboard', 'topConditions'],
    queryFn: fetchWithFallback<ConditionItem[]>(endpoints.dashboard.topConditions),
    staleTime: 60_000,
  });

  const { data: centers } = useQuery<CenterStatus[]>({
    queryKey: ['admin', 'dashboard', 'centersStatus'],
    queryFn: fetchWithFallback<CenterStatus[]>(endpoints.dashboard.centersMap),
    staleTime: 60_000,
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of the Vaidyah healthcare platform"
      />

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Total Patients"
            value={kpis?.totalPatients ?? 0}
            icon={<TeamOutlined />}
            trend={12.5}
            trendLabel="vs last month"
            loading={kpiLoading}
            iconColor="#2563eb"
            iconBgColor="#eff6ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Active Consultations"
            value={kpis?.activeConsultations ?? 0}
            icon={<FileTextOutlined />}
            trend={8.3}
            trendLabel="vs last week"
            loading={kpiLoading}
            iconColor="#0d9488"
            iconBgColor="#f0fdfa"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Active Centers"
            value={kpis?.activeCenters ?? 0}
            icon={<BankOutlined />}
            trend={2.1}
            trendLabel="vs last month"
            loading={kpiLoading}
            iconColor="#7c3aed"
            iconBgColor="#f5f3ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Triage Accuracy"
            value={kpis?.triageAccuracy ?? 0}
            suffix="%"
            icon={<CheckCircleOutlined />}
            trend={1.8}
            trendLabel="vs last month"
            loading={kpiLoading}
            iconColor="#16a34a"
            iconBgColor="#f0fdf4"
          />
        </Col>
      </Row>

      {/* Charts Row 1: Consultation Trend + Triage Distribution */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={16}>
          <Card title="Consultation Trends (30 Days)" styles={{ body: { padding: 16 } }}>
            {trendData && (
              <LineChart
                data={trendData}
                xField="date"
                yField="count"
                colorField="type"
                height={320}
                color={['#7c3aed', '#0d9488']}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Triage Distribution" styles={{ body: { padding: 16 } }}>
            {triageData && (
              <PieChart
                data={triageData}
                angleField="count"
                colorField="category"
                height={320}
                innerRadius={0.65}
                color={['#dc2626', '#d97706', '#16a34a']}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Charts Row 2: Top Conditions + Center Status */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Top 10 Conditions" styles={{ body: { padding: 16 } }}>
            {conditionsData && (
              <BarChart
                data={conditionsData}
                xField="count"
                yField="condition"
                height={400}
                color="#7c3aed"
                label={{ position: 'outside', style: { fill: '#6b7280', fontSize: 12 } }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="Health Center Status"
            styles={{ body: { padding: 0 } }}
          >
            <List
              dataSource={centers}
              renderItem={(center) => (
                <List.Item
                  key={center.id}
                  style={{ padding: '12px 16px' }}
                  extra={
                    <Space size={8} wrap>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <TeamOutlined style={{ marginRight: 4 }} />
                        {center.nurses} nurses
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        {center.patients} today
                      </Text>
                      {connectivityIcon[center.connectivity]}
                    </Space>
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <Badge
                        status={
                          center.status === 'online'
                            ? 'success'
                            : center.status === 'degraded'
                              ? 'warning'
                              : 'error'
                        }
                      />
                    }
                    title={
                      <Text style={{ fontSize: 14 }}>{center.name}</Text>
                    }
                    description={
                      <Tag
                        color={statusColor[center.status]}
                        style={{ fontSize: 11 }}
                      >
                        {(center.status ?? '').toUpperCase()}
                      </Tag>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
