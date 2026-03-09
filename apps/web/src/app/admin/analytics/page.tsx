'use client';

import { useState } from 'react';
import { Row, Col, Card, Table, Segmented, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  TeamOutlined,
  FileTextOutlined,
  RiseOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { StatsCard } from '@/components/ui/stats-card';
import { PageHeader } from '@/components/ui/page-header';
import { LineChart } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { PieChart } from '@/components/charts/pie-chart';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';

const { Text } = Typography;

type Period = '7d' | '30d' | '90d';

interface AnalyticsKpis {
  totalConsultations: number;
  uniquePatients: number;
  avgWaitTime: number;
  aiAccuracy: number;
}

interface DiseaseItem {
  disease: string;
  count: number;
}

interface DemographicItem {
  group: string;
  count: number;
}

interface AccuracyPoint {
  date: string;
  accuracy: number;
  model: string;
}

interface WaitTimeItem {
  center: string;
  waitTime: number;
}

interface NursePerformance {
  key: string;
  name: string;
  center: string;
  consultations: number;
  accuracy: number;
  avgTime: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: kpis, isLoading: kpiLoading } = useQuery<AnalyticsKpis>({
    queryKey: ['admin', 'analytics', 'kpis', period],
    queryFn: fetchWithFallback<AnalyticsKpis>(
      `${endpoints.analytics.diseasePrevalence}?period=${period}&type=kpis`,
    ),
    staleTime: 60_000,
  });

  const { data: diseaseData } = useQuery<DiseaseItem[]>({
    queryKey: ['admin', 'analytics', 'diseases', period],
    queryFn: fetchWithFallback<DiseaseItem[]>(
      `${endpoints.analytics.diseasePrevalence}?period=${period}`,
    ),
    staleTime: 60_000,
  });

  const { data: demographicsData } = useQuery<DemographicItem[]>({
    queryKey: ['admin', 'analytics', 'demographics', period],
    queryFn: fetchWithFallback<DemographicItem[]>(
      `${endpoints.analytics.demographics}?period=${period}`,
    ),
    staleTime: 60_000,
  });

  const { data: accuracyData } = useQuery<AccuracyPoint[]>({
    queryKey: ['admin', 'analytics', 'accuracy', period],
    queryFn: fetchWithFallback<AccuracyPoint[]>(
      `${endpoints.analytics.aiAccuracy}?period=${period}`,
    ),
    staleTime: 60_000,
  });

  const { data: waitTimesData } = useQuery<WaitTimeItem[]>({
    queryKey: ['admin', 'analytics', 'waitTimes', period],
    queryFn: fetchWithFallback<WaitTimeItem[]>(
      `${endpoints.analytics.waitTimes}?period=${period}`,
    ),
    staleTime: 60_000,
  });

  const { data: nursePerformance } = useQuery<NursePerformance[]>({
    queryKey: ['admin', 'analytics', 'nursePerformance', period],
    queryFn: fetchWithFallback<NursePerformance[]>(
      `${endpoints.analytics.nursePerformance}?period=${period}`,
    ),
    staleTime: 60_000,
  });

  const performanceColumns: ColumnsType<NursePerformance> = [
    {
      title: 'Nurse',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
      sorter: (a, b) => (a.name ?? '').localeCompare(b.name ?? ''),
    },
    {
      title: 'Center',
      dataIndex: 'center',
      key: 'center',
      responsive: ['md'] as any,
    },
    {
      title: 'Consultations',
      dataIndex: 'consultations',
      key: 'consultations',
      align: 'center',
      sorter: (a, b) => a.consultations - b.consultations,
      defaultSortOrder: 'descend',
    },
    {
      title: 'Accuracy',
      dataIndex: 'accuracy',
      key: 'accuracy',
      align: 'center',
      render: (val: number) => (
        <Text
          style={{
            color: val >= 95 ? '#16a34a' : val >= 90 ? '#d97706' : '#dc2626',
            fontWeight: 600,
          }}
        >
          {Number(val ?? 0).toFixed(1)}%
        </Text>
      ),
      sorter: (a, b) => a.accuracy - b.accuracy,
    },
    {
      title: 'Avg Time',
      dataIndex: 'avgTime',
      key: 'avgTime',
      align: 'center',
      responsive: ['sm'] as any,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Platform-wide performance metrics and health data insights"
        extra={
          <Segmented
            value={period}
            onChange={(val) => setPeriod(val as Period)}
            options={[
              { label: '7 Days', value: '7d' },
              { label: '30 Days', value: '30d' },
              { label: '90 Days', value: '90d' },
            ]}
          />
        }
      />

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Total Consultations"
            value={kpis?.totalConsultations ?? 0}
            icon={<FileTextOutlined />}
            trend={12.5}
            trendLabel={`vs prev ${period}`}
            loading={kpiLoading}
            iconColor="#7c3aed"
            iconBgColor="#eef2ff"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Unique Patients"
            value={kpis?.uniquePatients ?? 0}
            icon={<TeamOutlined />}
            trend={8.3}
            trendLabel={`vs prev ${period}`}
            loading={kpiLoading}
            iconColor="#0d9488"
            iconBgColor="#f0fdfa"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="Avg Wait Time"
            value={kpis?.avgWaitTime ?? 0}
            suffix="min"
            icon={<ClockCircleOutlined />}
            trend={-3.2}
            trendLabel={`vs prev ${period}`}
            loading={kpiLoading}
            iconColor="#d97706"
            iconBgColor="#fffbeb"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatsCard
            title="AI Accuracy"
            value={kpis?.aiAccuracy ?? 0}
            suffix="%"
            icon={<RiseOutlined />}
            trend={1.2}
            trendLabel={`vs prev ${period}`}
            loading={kpiLoading}
            iconColor="#16a34a"
            iconBgColor="#f0fdf4"
          />
        </Col>
      </Row>

      {/* Row 1: Disease Prevalence + Demographics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card title="Disease Prevalence (Top 10)" styles={{ body: { padding: 16 } }}>
            {diseaseData && diseaseData.length > 0 && (
              <BarChart
                data={diseaseData}
                xField="count"
                yField="disease"
                height={400}
                color="#7c3aed"
                label={{
                  position: 'outside',
                  style: { fill: '#6b7280', fontSize: 12 },
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Patient Demographics" styles={{ body: { padding: 16 } }}>
            {demographicsData && demographicsData.length > 0 && (
              <PieChart
                data={demographicsData}
                angleField="count"
                colorField="group"
                height={400}
                innerRadius={0.6}
                color={['#60a5fa', '#34d399', '#7c3aed', '#f59e0b', '#ef4444']}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Row 2: AI Model Accuracy Trend */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card title="AI Model Accuracy Trend" styles={{ body: { padding: 16 } }}>
            {accuracyData && accuracyData.length > 0 && (
              <LineChart
                data={accuracyData}
                xField="date"
                yField="accuracy"
                colorField="model"
                height={350}
                color={['#7c3aed', '#0d9488', '#d97706']}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Row 3: Wait Times by Center + Nurse Performance */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Avg Wait Time by Center (min)" styles={{ body: { padding: 16 } }}>
            {waitTimesData && waitTimesData.length > 0 && (
              <BarChart
                data={waitTimesData}
                xField="waitTime"
                yField="center"
                height={350}
                color="#0d9488"
                label={{
                  text: (d: any) => `${d.waitTime} min`,
                  position: 'outside',
                  style: { fill: '#6b7280', fontSize: 12 },
                }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Nurse Performance" styles={{ body: { padding: 0 } }}>
            <Table
              rowKey={(record) => record.key ?? record.name}
              dataSource={nursePerformance ?? []}
              columns={performanceColumns}
              pagination={false}
              size="middle"
              scroll={{ x: 500 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
