'use client';

import React, { useState, useMemo } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Space,
  Button,
  Select,
  DatePicker,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { TriageBadge } from '@/components/data-display/triage-badge';
import { ConsultationDrawer } from '@/components/data-display/consultation-drawer';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ---------------------------------------------------------------------------
// Types (matching ConsultationDrawer's ConsultationData interface)
// ---------------------------------------------------------------------------

interface ConsultationRecord {
  id: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  consultationDate: string;
  centerId: string;
  centerName: string;
  nurseId: string;
  nurseName: string;
  status: string;
  triageCategory: 'A' | 'B' | 'C';
  duration: string;
  symptoms: string[];
  vitals: {
    temperature: number;
    bloodPressureSystolic: number;
    bloodPressureDiastolic: number;
    heartRate: number;
    respiratoryRate: number;
    spO2: number;
  };
  triageResult: {
    category: 'A' | 'B' | 'C';
    urgencyScore: number;
    redFlags: string[];
    reasoning: string;
  };
  soapNote: {
    subjective: {
      chiefComplaint: string;
      historyOfPresentIllness: string;
    };
    objective: {
      vitalSigns: string;
      physicalExamination: string;
    };
    assessment: {
      primaryDiagnosis: string;
      differentialDiagnoses: string[];
    };
    plan: {
      medications: string[];
      followUp: string;
    };
  };
}


const CENTER_OPTIONS = [
  { label: 'All Centers', value: '' },
  { label: 'PHC Raipur Central', value: 'hc-001' },
  { label: 'CHC Bilaspur', value: 'hc-002' },
  { label: 'PHC Durg', value: 'hc-003' },
  { label: 'Sub-Center Korba', value: 'hc-004' },
  { label: 'CHC Jagdalpur', value: 'hc-006' },
  { label: 'District Hospital Ambikapur', value: 'hc-007' },
];

const TRIAGE_OPTIONS = [
  { label: 'All Triage', value: '' },
  { label: 'Category A (Emergency)', value: 'A' },
  { label: 'Category B (Urgent)', value: 'B' },
  { label: 'Category C (Non-Urgent)', value: 'C' },
];

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Completed', value: 'completed' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Pending Review', value: 'pending_review' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsultationsPage() {
  const [centerFilter, setCenterFilter] = useState('');
  const [triageFilter, setTriageFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<ConsultationRecord | null>(null);

  const { data: fetchedData } = useQuery({
    queryKey: ['admin', 'consultations'],
    queryFn: fetchWithFallback<ConsultationRecord[]>(endpoints.consultations.list),
    staleTime: 30_000,
  });

  // Ensure consultations is always an array
  const consultations: ConsultationRecord[] = useMemo(() => {
    if (!fetchedData) return [];
    if (Array.isArray(fetchedData)) return fetchedData;
    // If data is wrapped in a data property
    if (fetchedData && typeof fetchedData === 'object' && 'data' in fetchedData) {
      const wrapped = fetchedData as { data: unknown };
      return Array.isArray(wrapped.data) ? wrapped.data : [];
    }
    return [];
  }, [fetchedData]);

  const filteredConsultations = useMemo(() => {
    if (!Array.isArray(consultations)) {
      console.error('consultations is not an array:', consultations);
      return [];
    }
    return consultations.filter((c) => {
      const matchCenter = !centerFilter || c.centerId === centerFilter;
      const matchTriage = !triageFilter || c.triageCategory === triageFilter;
      const matchStatus = !statusFilter || c.status === statusFilter;
      let matchDate = true;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const consultDate = dayjs(c.consultationDate);
        matchDate =
          !consultDate.isBefore(dateRange[0].startOf('day')) &&
          !consultDate.isAfter(dateRange[1].endOf('day'));
      }
      return matchCenter && matchTriage && matchStatus && matchDate;
    });
  }, [consultations, centerFilter, triageFilter, statusFilter, dateRange]);

  const handleRowClick = (record: ConsultationRecord) => {
    setSelectedConsultation(record);
    setDrawerOpen(true);
  };

  const statusColorMap: Record<string, string> = {
    completed: 'green',
    in_progress: 'blue',
    pending_review: 'orange',
  };

  const columns: ColumnsType<ConsultationRecord> = [
    {
      title: 'Patient',
      key: 'patient',
      render: (_, record) => (
        <Space>
          <UserOutlined style={{ color: '#9ca3af' }} />
          <div>
            <Text strong>{record.patientName}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.patientAge} yrs, {record.patientGender}
            </Text>
          </div>
        </Space>
      ),
      sorter: (a, b) => (a.patientName ?? '').localeCompare(b.patientName ?? ''),
    },
    {
      title: 'Center',
      dataIndex: 'centerName',
      key: 'center',
      ellipsis: true,
      responsive: ['md'],
    },
    {
      title: 'Date',
      dataIndex: 'consultationDate',
      key: 'date',
      width: 160,
      render: (val: string) => (
        <Space size={4}>
          <ClockCircleOutlined style={{ fontSize: 12, color: '#9ca3af' }} />
          <Text style={{ fontSize: 13 }}>{val}</Text>
        </Space>
      ),
      sorter: (a, b) =>
        new Date(a.consultationDate).getTime() -
        new Date(b.consultationDate).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Triage',
      key: 'triage',
      width: 180,
      responsive: ['sm'] as any,
      render: (_, record) => (
        <TriageBadge category={record.triageCategory} size="small" />
      ),
      filters: [
        { text: 'Category A', value: 'A' },
        { text: 'Category B', value: 'B' },
        { text: 'Category C', value: 'C' },
      ],
      onFilter: (value, record) => record.triageCategory === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={statusColorMap[status] ?? 'default'}>
          {(status ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      width: 90,
      align: 'center',
      responsive: ['lg'],
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          size="small"
          onClick={(e) => { e.stopPropagation(); handleRowClick(record); }}
        />
      ),
    },
  ];

  // Map the consultation record to the shape ConsultationDrawer expects
  const drawerData = selectedConsultation
    ? {
        id: selectedConsultation.id,
        patientName: selectedConsultation.patientName,
        patientAge: selectedConsultation.patientAge,
        patientGender: selectedConsultation.patientGender,
        consultationDate: selectedConsultation.consultationDate,
        centerId: selectedConsultation.centerId,
        centerName: selectedConsultation.centerName,
        nurseId: selectedConsultation.nurseId,
        nurseName: selectedConsultation.nurseName,
        status: selectedConsultation.status,
        symptoms: selectedConsultation.symptoms,
        vitals: selectedConsultation.vitals
          ? {
              temperature: selectedConsultation.vitals.temperature,
              systolic: selectedConsultation.vitals.bloodPressureSystolic,
              diastolic: selectedConsultation.vitals.bloodPressureDiastolic,
              heartRate: selectedConsultation.vitals.heartRate,
              respiratoryRate: selectedConsultation.vitals.respiratoryRate,
              spO2: selectedConsultation.vitals.spO2,
            }
          : undefined,
        triageResult: selectedConsultation.triageResult
          ? {
              ...selectedConsultation.triageResult,
              // Normalize urgency score from 1-10 to 0-100 scale for drawer display
              urgencyScore: selectedConsultation.triageResult.urgencyScore * 10,
            }
          : undefined,
        soapNote: selectedConsultation.soapNote,
      }
    : null;

  return (
    <div>
      <PageHeader
        title="Consultations"
        subtitle="View and review all patient consultations across centers"
      />

      {/* Filters */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={7}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) =>
                setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])
              }
              placeholder={['Start Date', 'End Date']}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              value={centerFilter}
              onChange={setCenterFilter}
              options={CENTER_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Center"
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              value={triageFilter}
              onChange={setTriageFilter}
              options={TRIAGE_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Triage"
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Status"
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={filteredConsultations}
          columns={columns}
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} consultations`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Detail Drawer */}
      <ConsultationDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedConsultation(null);
        }}
        consultation={drawerData}
      />
    </div>
  );
}
