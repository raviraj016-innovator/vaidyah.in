'use client';

import React, { useState, useEffect } from 'react';
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

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockKpis = {
  totalPatients: 12847,
  activeConsultations: 234,
  activeCenters: 48,
  triageAccuracy: 94.2,
};

function generateConsultationTrend() {
  const data: { date: string; count: number; type: string }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    data.push({
      date: dateStr,
      count: Math.floor(Math.random() * 40) + 60,
      type: 'Total',
    });
    data.push({
      date: dateStr,
      count: Math.floor(Math.random() * 20) + 30,
      type: 'AI-Assisted',
    });
  }
  return data;
}

const mockTriageDistribution = [
  { category: 'Category A (Emergency)', count: 142, color: '#dc2626' },
  { category: 'Category B (Urgent)', count: 387, color: '#d97706' },
  { category: 'Category C (Non-Urgent)', count: 1204, color: '#16a34a' },
];

const mockTopConditions = [
  { condition: 'Upper Respiratory Infection', count: 342 },
  { condition: 'Hypertension', count: 287 },
  { condition: 'Type 2 Diabetes', count: 234 },
  { condition: 'Gastroenteritis', count: 198 },
  { condition: 'Anemia', count: 176 },
  { condition: 'Urinary Tract Infection', count: 154 },
  { condition: 'Malaria', count: 143 },
  { condition: 'Skin Infection', count: 132 },
  { condition: 'Acute Fever', count: 121 },
  { condition: 'Joint Pain', count: 108 },
];

const mockCenters = [
  { id: '1', name: 'PHC Raipur Central', status: 'online', patients: 45, nurses: 6, connectivity: 'good' },
  { id: '2', name: 'CHC Bilaspur', status: 'online', patients: 32, nurses: 4, connectivity: 'good' },
  { id: '3', name: 'PHC Durg', status: 'degraded', patients: 28, nurses: 3, connectivity: 'intermittent' },
  { id: '4', name: 'Sub-Center Korba', status: 'online', patients: 15, nurses: 2, connectivity: 'good' },
  { id: '5', name: 'PHC Rajnandgaon', status: 'offline', patients: 0, nurses: 2, connectivity: 'offline' },
  { id: '6', name: 'CHC Jagdalpur', status: 'online', patients: 38, nurses: 5, connectivity: 'good' },
  { id: '7', name: 'PHC Ambikapur', status: 'online', patients: 22, nurses: 3, connectivity: 'good' },
  { id: '8', name: 'Sub-Center Kanker', status: 'degraded', patients: 12, nurses: 2, connectivity: 'intermittent' },
];

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
  const { data: kpis, isLoading: kpiLoading } = useQuery({
    queryKey: ['admin', 'dashboard', 'kpis'],
    queryFn: async () => mockKpis,
    staleTime: 60_000,
  });

  const [clientTrendData, setClientTrendData] = useState<
    { date: string; count: number; type: string }[]
  >([]);
  useEffect(() => {
    setClientTrendData(generateConsultationTrend());
  }, []);

  const trendData = clientTrendData.length > 0 ? clientTrendData : undefined;

  const { data: triageData } = useQuery({
    queryKey: ['admin', 'dashboard', 'triageDistribution'],
    queryFn: async () => mockTriageDistribution,
    staleTime: 60_000,
  });

  const { data: conditionsData } = useQuery({
    queryKey: ['admin', 'dashboard', 'topConditions'],
    queryFn: async () => mockTopConditions,
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
              dataSource={mockCenters}
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
                        {center.status.toUpperCase()}
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
