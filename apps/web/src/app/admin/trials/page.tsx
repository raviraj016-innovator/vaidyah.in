'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Descriptions,
  Drawer,
  App,
  Statistic,
  Row,
  Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrialRow {
  id: string;
  nct_id: string;
  title: string;
  brief_summary?: string;
  plain_summary?: string;
  conditions: string[];
  phase?: string;
  status?: string;
  sponsor?: string;
  start_date?: string;
  enrollment?: number;
  eligibility?: {
    age_min?: number;
    age_max?: number;
    gender?: string;
  };
  metadata?: {
    categories?: string[];
    age_group?: string;
    race_ethnicity?: string;
  };
}

// ---------------------------------------------------------------------------
// Status color helpers
// ---------------------------------------------------------------------------

function statusColor(s?: string): string {
  if (!s) return 'default';
  const lower = s.toLowerCase();
  if (lower.includes('recruiting')) return 'green';
  if (lower.includes('completed')) return 'blue';
  if (lower.includes('active')) return 'cyan';
  if (lower.includes('suspended') || lower.includes('terminated')) return 'red';
  if (lower.includes('withdrawn')) return 'orange';
  return 'default';
}

function phaseColor(p?: string): string {
  if (!p) return 'default';
  if (p.includes('3') || p.includes('4')) return 'purple';
  if (p.includes('2')) return 'blue';
  if (p.includes('1')) return 'geekblue';
  return 'default';
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminTrialsPage() {
  const { message } = App.useApp();
  const [trials, setTrials] = useState<TrialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // Trial detail drawer
  const [selectedTrial, setSelectedTrial] = useState<TrialRow | null>(null);

  // Fetch trials from API
  const fetchTrials = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get(endpoints.trials.list, {
        params: { page: p, limit: 20 },
      });
      const data = res.data?.data ?? res.data;
      if (Array.isArray(data) && data.length > 0) {
        setTrials(data);
        setTotal(res.data?.meta?.total ?? data.length);
      }
    } catch (err: any) {
      console.error('Failed to fetch trials:', err);
      const status = err.response?.status;
      if (status === 429) {
        message.warning('Too many requests. Please wait a moment and try again.');
      } else if (status === 401) {
        // Auth interceptor handles redirect — don't show duplicate error
      } else {
        message.error('Failed to load trials. Make sure the trial service is running.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrials(page);
  }, [fetchTrials, page]);

  // Filter trials locally for search
  const filteredTrials = trials.filter((t) => {
    const matchesSearch = !search || (t.title ?? '').toLowerCase().includes(search.toLowerCase())
      || (t.nct_id ?? '').toLowerCase().includes(search.toLowerCase())
      || t.conditions?.some(c => c?.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = !statusFilter || t.status?.toLowerCase().includes(statusFilter.toLowerCase());
    return matchesSearch && matchesStatus;
  });

  // Table columns
  const columns: ColumnsType<TrialRow> = [
    {
      title: 'NCT ID',
      dataIndex: 'nct_id',
      key: 'nct_id',
      width: 140,
      render: (id: string) => <Text code style={{ fontSize: 12 }}>{id}</Text>,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => (
        <Text style={{ fontSize: 13 }}>{title}</Text>
      ),
    },
    {
      title: 'Conditions',
      dataIndex: 'conditions',
      key: 'conditions',
      width: 220,
      render: (conds: string[]) => (
        <Space wrap size={[4, 4]}>
          {(conds ?? []).slice(0, 2).map((c) => (
            <Tag key={c} color="blue" style={{ fontSize: 11 }}>{c}</Tag>
          ))}
          {(conds ?? []).length > 2 && (
            <Tag style={{ fontSize: 11 }}>+{conds.length - 2}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Phase',
      dataIndex: 'phase',
      key: 'phase',
      width: 100,
      render: (p: string) => p ? <Tag color={phaseColor(p)}>{p}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: string) => s ? <Tag color={statusColor(s)}>{s}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Sponsor',
      dataIndex: 'sponsor',
      key: 'sponsor',
      width: 160,
      ellipsis: true,
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_: unknown, record: TrialRow) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          size="small"
          onClick={() => setSelectedTrial(record)}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clinical Trials"
        subtitle="Manage clinical trial data — import CSV, browse, and search indexed trials"
      />

      {/* Stats Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Trials"
              value={total}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Recruiting"
              value={trials.filter(t => t.status?.toLowerCase().includes('recruiting')).length}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Completed"
              value={trials.filter(t => t.status?.toLowerCase().includes('completed')).length}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Trials Table */}
      <Card
        title={
          <Space>
            <ExperimentOutlined />
            Trial Database
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchTrials(page)}
            loading={loading}
          >
            Refresh
          </Button>
        }
      >
        {/* Filters */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={16} md={12}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search by title, NCT ID, or condition..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
              style={{ width: '100%' }}
              options={[
                { label: 'Recruiting', value: 'recruiting' },
                { label: 'Completed', value: 'completed' },
                { label: 'Active', value: 'active' },
                { label: 'Suspended', value: 'suspended' },
                { label: 'Terminated', value: 'terminated' },
              ]}
            />
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredTrials}
          rowKey="nct_id"
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            showTotal: (t) => `${t} trials`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>

      {/* Trial Detail Drawer */}
      <Drawer
        title={selectedTrial?.nct_id}
        open={!!selectedTrial}
        onClose={() => setSelectedTrial(null)}
        width={typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 600}
      >
        {selectedTrial && (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                {selectedTrial.title}
              </Typography.Title>
              <Space wrap>
                {selectedTrial.phase && <Tag color={phaseColor(selectedTrial.phase)}>{selectedTrial.phase}</Tag>}
                {selectedTrial.status && <Tag color={statusColor(selectedTrial.status)}>{selectedTrial.status}</Tag>}
              </Space>
            </div>

            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="NCT ID">{selectedTrial.nct_id}</Descriptions.Item>
              <Descriptions.Item label="Sponsor">{selectedTrial.sponsor ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Start Date">{selectedTrial.start_date ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Conditions">
                <Space wrap>
                  {(selectedTrial.conditions ?? []).map((c) => (
                    <Tag key={c} color="blue">{c}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
              {selectedTrial.metadata?.categories && (
                <Descriptions.Item label="Categories">
                  <Space wrap>
                    {selectedTrial.metadata.categories.map((c) => (
                      <Tag key={c} color="purple">{c}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Age Range">
                {selectedTrial.eligibility?.age_min ?? '?'} - {selectedTrial.eligibility?.age_max ?? 'N/A'} years
              </Descriptions.Item>
              <Descriptions.Item label="Gender">
                {selectedTrial.eligibility?.gender ?? 'All'}
              </Descriptions.Item>
              {selectedTrial.metadata?.age_group && (
                <Descriptions.Item label="Age Group">{selectedTrial.metadata.age_group}</Descriptions.Item>
              )}
              {selectedTrial.metadata?.race_ethnicity && (
                <Descriptions.Item label="Race/Ethnicity">{selectedTrial.metadata.race_ethnicity}</Descriptions.Item>
              )}
            </Descriptions>

            {selectedTrial.plain_summary && (
              <div>
                <Text strong>Plain Language Summary</Text>
                <Paragraph style={{ marginTop: 8 }}>{selectedTrial.plain_summary}</Paragraph>
              </div>
            )}

            {selectedTrial.brief_summary && (
              <div>
                <Text strong>Brief Summary</Text>
                <Paragraph style={{ marginTop: 8 }}>{selectedTrial.brief_summary}</Paragraph>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
