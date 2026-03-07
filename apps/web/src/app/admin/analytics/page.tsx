'use client';

import React, { useState, useMemo } from 'react';
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

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Mock Data Generators
// ---------------------------------------------------------------------------

type Period = '7d' | '30d' | '90d';

function generateKpis(period: Period) {
  const multiplier = period === '7d' ? 1 : period === '30d' ? 4 : 12;
  return {
    totalConsultations: 234 * multiplier,
    uniquePatients: 189 * multiplier,
    avgWaitTime: period === '7d' ? 12.4 : period === '30d' ? 14.2 : 15.8,
    aiAccuracy: period === '7d' ? 94.8 : period === '30d' ? 93.5 : 92.1,
  };
}

function generateDiseasePrevalence() {
  return [
    { disease: 'Upper Respiratory Infection', count: 342 },
    { disease: 'Hypertension', count: 287 },
    { disease: 'Type 2 Diabetes', count: 234 },
    { disease: 'Gastroenteritis', count: 198 },
    { disease: 'Anemia', count: 176 },
    { disease: 'Urinary Tract Infection', count: 154 },
    { disease: 'Malaria', count: 143 },
    { disease: 'Skin Infections', count: 132 },
    { disease: 'Acute Fever (Dengue/Viral)', count: 121 },
    { disease: 'Musculoskeletal Pain', count: 108 },
  ];
}

function generateDemographics() {
  return [
    { group: 'Children (0-14)', count: 2340 },
    { group: 'Youth (15-24)', count: 1890 },
    { group: 'Adults (25-44)', count: 3560 },
    { group: 'Middle Age (45-64)', count: 2870 },
    { group: 'Elderly (65+)', count: 1420 },
  ];
}

function generateAccuracyTrend(period: Period) {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const step = period === '90d' ? 7 : 1;
  const data: { date: string; accuracy: number; model: string }[] = [];
  const now = new Date();

  for (let i = days; i >= 0; i -= step) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    data.push({
      date: dateStr,
      accuracy: 91 + Math.random() * 6,
      model: 'NLU',
    });
    data.push({
      date: dateStr,
      accuracy: 88 + Math.random() * 8,
      model: 'Triage',
    });
    data.push({
      date: dateStr,
      accuracy: 85 + Math.random() * 10,
      model: 'Prosody',
    });
  }
  return data;
}

function generateWaitTimesByCenter() {
  return [
    { center: 'PHC Raipur', waitTime: 8.2 },
    { center: 'CHC Bilaspur', waitTime: 12.5 },
    { center: 'PHC Durg', waitTime: 15.3 },
    { center: 'SC Korba', waitTime: 6.1 },
    { center: 'CHC Jagdalpur', waitTime: 10.8 },
    { center: 'DH Ambikapur', waitTime: 18.4 },
    { center: 'SC Kanker', waitTime: 7.3 },
  ];
}

interface NursePerformance {
  key: string;
  name: string;
  center: string;
  consultations: number;
  accuracy: number;
  avgTime: string;
}

const mockNursePerformance: NursePerformance[] = [
  { key: '1', name: 'Sunita Patel', center: 'PHC Raipur', consultations: 245, accuracy: 96.2, avgTime: '12 min' },
  { key: '2', name: 'Anjali Tiwari', center: 'CHC Bilaspur', consultations: 198, accuracy: 94.8, avgTime: '14 min' },
  { key: '3', name: 'Meena Dewangan', center: 'CHC Jagdalpur', consultations: 187, accuracy: 95.1, avgTime: '13 min' },
  { key: '4', name: 'Lakshmi Nag', center: 'DH Ambikapur', consultations: 176, accuracy: 93.4, avgTime: '15 min' },
  { key: '5', name: 'Kavita Sahu', center: 'SC Korba', consultations: 145, accuracy: 92.8, avgTime: '11 min' },
  { key: '6', name: 'Priya Das', center: 'PHC Durg', consultations: 132, accuracy: 91.5, avgTime: '16 min' },
  { key: '7', name: 'Rekha Thakur', center: 'SC Kanker', consultations: 98, accuracy: 90.2, avgTime: '18 min' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: kpis, isLoading: kpiLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'kpis', period],
    queryFn: async () => generateKpis(period),
  });

  const { data: diseaseData } = useQuery({
    queryKey: ['admin', 'analytics', 'diseases', period],
    queryFn: async () => generateDiseasePrevalence(),
  });

  const { data: demographicsData } = useQuery({
    queryKey: ['admin', 'analytics', 'demographics', period],
    queryFn: async () => generateDemographics(),
  });

  const { data: accuracyData } = useQuery({
    queryKey: ['admin', 'analytics', 'accuracy', period],
    queryFn: async () => generateAccuracyTrend(period),
  });

  const { data: waitTimesData } = useQuery({
    queryKey: ['admin', 'analytics', 'waitTimes', period],
    queryFn: async () => generateWaitTimesByCenter(),
  });

  const performanceColumns: ColumnsType<NursePerformance> = [
    {
      title: 'Nurse',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
      sorter: (a, b) => a.name.localeCompare(b.name),
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
          {val.toFixed(1)}%
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
            {diseaseData && (
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
            {demographicsData && (
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
            {accuracyData && (
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
            {waitTimesData && (
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
              rowKey="key"
              dataSource={mockNursePerformance}
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
