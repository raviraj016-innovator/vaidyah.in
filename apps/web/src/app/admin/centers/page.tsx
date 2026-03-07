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
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  Typography,
  Descriptions,
  Popconfirm,
  App,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  EnvironmentOutlined,
  WifiOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { RoleGate } from '@/lib/auth/role-gate';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';
import api from '@/lib/api/client';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthCenter {
  id: string;
  name: string;
  type: 'PHC' | 'CHC' | 'Sub-Center' | 'District Hospital';
  state: string;
  district: string;
  status: 'active' | 'inactive' | 'maintenance';
  staffCount: number;
  dailyAvg: number;
  connectivity: 'good' | 'intermittent' | 'offline';
  latitude: number;
  longitude: number;
  totalPatients: number;
  activeSince: string;
  lastSync: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const INITIAL_CENTERS: HealthCenter[] = [
  {
    id: 'hc-001',
    name: 'PHC Raipur Central',
    type: 'PHC',
    state: 'Chhattisgarh',
    district: 'Raipur',
    status: 'active',
    staffCount: 6,
    dailyAvg: 45,
    connectivity: 'good',
    latitude: 21.2514,
    longitude: 81.6296,
    totalPatients: 3420,
    activeSince: '2024-01-15',
    lastSync: '2 min ago',
  },
  {
    id: 'hc-002',
    name: 'CHC Bilaspur',
    type: 'CHC',
    state: 'Chhattisgarh',
    district: 'Bilaspur',
    status: 'active',
    staffCount: 4,
    dailyAvg: 32,
    connectivity: 'good',
    latitude: 22.0796,
    longitude: 82.1391,
    totalPatients: 2180,
    activeSince: '2024-02-20',
    lastSync: '5 min ago',
  },
  {
    id: 'hc-003',
    name: 'PHC Durg',
    type: 'PHC',
    state: 'Chhattisgarh',
    district: 'Durg',
    status: 'active',
    staffCount: 3,
    dailyAvg: 28,
    connectivity: 'intermittent',
    latitude: 21.1904,
    longitude: 81.2849,
    totalPatients: 1890,
    activeSince: '2024-03-10',
    lastSync: '15 min ago',
  },
  {
    id: 'hc-004',
    name: 'Sub-Center Korba',
    type: 'Sub-Center',
    state: 'Chhattisgarh',
    district: 'Korba',
    status: 'active',
    staffCount: 2,
    dailyAvg: 15,
    connectivity: 'good',
    latitude: 22.3595,
    longitude: 82.7501,
    totalPatients: 980,
    activeSince: '2024-04-05',
    lastSync: '8 min ago',
  },
  {
    id: 'hc-005',
    name: 'PHC Rajnandgaon',
    type: 'PHC',
    state: 'Chhattisgarh',
    district: 'Rajnandgaon',
    status: 'inactive',
    staffCount: 2,
    dailyAvg: 0,
    connectivity: 'offline',
    latitude: 21.0974,
    longitude: 81.028,
    totalPatients: 560,
    activeSince: '2024-05-12',
    lastSync: '3 days ago',
  },
  {
    id: 'hc-006',
    name: 'CHC Jagdalpur',
    type: 'CHC',
    state: 'Chhattisgarh',
    district: 'Bastar',
    status: 'active',
    staffCount: 5,
    dailyAvg: 38,
    connectivity: 'good',
    latitude: 19.0784,
    longitude: 82.0198,
    totalPatients: 2750,
    activeSince: '2024-01-28',
    lastSync: '1 min ago',
  },
  {
    id: 'hc-007',
    name: 'District Hospital Ambikapur',
    type: 'District Hospital',
    state: 'Chhattisgarh',
    district: 'Surguja',
    status: 'active',
    staffCount: 12,
    dailyAvg: 78,
    connectivity: 'good',
    latitude: 23.1186,
    longitude: 83.1988,
    totalPatients: 5430,
    activeSince: '2023-12-01',
    lastSync: '30 sec ago',
  },
  {
    id: 'hc-008',
    name: 'Sub-Center Kanker',
    type: 'Sub-Center',
    state: 'Chhattisgarh',
    district: 'Kanker',
    status: 'maintenance',
    staffCount: 2,
    dailyAvg: 12,
    connectivity: 'intermittent',
    latitude: 20.272,
    longitude: 81.4913,
    totalPatients: 640,
    activeSince: '2024-06-01',
    lastSync: '2 hours ago',
  },
];

const STATE_OPTIONS = [
  { label: 'All States', value: '' },
  { label: 'Chhattisgarh', value: 'Chhattisgarh' },
  { label: 'Madhya Pradesh', value: 'Madhya Pradesh' },
  { label: 'Maharashtra', value: 'Maharashtra' },
];

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Maintenance', value: 'maintenance' },
];

const TYPE_OPTIONS = [
  { label: 'PHC', value: 'PHC' },
  { label: 'CHC', value: 'CHC' },
  { label: 'Sub-Center', value: 'Sub-Center' },
  { label: 'District Hospital', value: 'District Hospital' },
];

const CONNECTIVITY_OPTIONS = [
  { label: 'Good', value: 'good' },
  { label: 'Intermittent', value: 'intermittent' },
  { label: 'Offline', value: 'offline' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CentersPage() {
  const { message: messageApi } = App.useApp();
  const queryClient = useQueryClient();

  const { data: fetchedCenters } = useQuery({
    queryKey: ['admin', 'centers'],
    queryFn: fetchWithFallback<HealthCenter[]>(endpoints.centers.list, INITIAL_CENTERS),
    staleTime: 30_000,
  });

  const [centers, setCenters] = useState<HealthCenter[]>(INITIAL_CENTERS);

  // Sync fetched data into local state (allows optimistic mutations)
  React.useEffect(() => {
    if (fetchedCenters && fetchedCenters !== INITIAL_CENTERS) {
      setCenters(fetchedCenters);
    }
  }, [fetchedCenters]);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<HealthCenter | null>(null);
  const [form] = Form.useForm();

  // Filtered data
  const filteredCenters = useMemo(() => {
    return centers.filter((c) => {
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.district.toLowerCase().includes(search.toLowerCase());
      const matchState = !stateFilter || c.state === stateFilter;
      const matchStatus = !statusFilter || c.status === statusFilter;
      return matchSearch && matchState && matchStatus;
    });
  }, [centers, search, stateFilter, statusFilter]);

  // Open modal for create
  const handleAdd = () => {
    setEditingCenter(null);
    form.resetFields();
    form.setFieldsValue({ status: 'active', connectivity: 'good' });
    setModalOpen(true);
  };

  // Open modal for edit
  const handleEdit = (center: HealthCenter) => {
    setEditingCenter(center);
    form.resetFields();
    form.setFieldsValue(center);
    setModalOpen(true);
  };

  // Delete center
  const handleDelete = async (id: string) => {
    setCenters((prev) => prev.filter((c) => c.id !== id));
    messageApi.success('Center deleted successfully');
    try { await api.delete(endpoints.centers.delete(id)); } catch { /* demo mode */ }
    queryClient.invalidateQueries({ queryKey: ['admin', 'centers'] });
  };

  // Save (create or update)
  const handleSave = () => {
    form.validateFields().then(async (values) => {
      if (editingCenter) {
        setCenters((prev) =>
          prev.map((c) =>
            c.id === editingCenter.id ? { ...c, ...values } : c,
          ),
        );
        messageApi.success('Center updated successfully');
        try { await api.put(endpoints.centers.update(editingCenter.id), values); } catch { /* demo mode */ }
      } else {
        const newCenter: HealthCenter = {
          ...values,
          id: `hc-${Date.now()}`,
          staffCount: 0,
          dailyAvg: 0,
          totalPatients: 0,
          activeSince: new Date().toISOString().split('T')[0],
          lastSync: 'Never',
        };
        setCenters((prev) => [newCenter, ...prev]);
        messageApi.success('Center created successfully');
        try { await api.post(endpoints.centers.create, values); } catch { /* demo mode */ }
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'centers'] });
      setModalOpen(false);
      form.resetFields();
    }).catch(() => {
      // Validation failed — AntD already shows field errors
    });
  };

  // Table columns
  const columns: ColumnsType<HealthCenter> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record) => (
        <div>
          <Text strong>{name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.type}
          </Text>
        </div>
      ),
    },
    {
      title: 'State / District',
      key: 'location',
      render: (_, record) => (
        <Space size={4}>
          <EnvironmentOutlined style={{ color: '#9ca3af', fontSize: 12 }} />
          <Text style={{ fontSize: 13 }}>
            {record.district}, {record.state}
          </Text>
        </Space>
      ),
      sorter: (a, b) => a.district.localeCompare(b.district),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          active: 'green',
          inactive: 'red',
          maintenance: 'orange',
        };
        return (
          <Tag color={colorMap[status] ?? 'default'}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Tag>
        );
      },
      filters: [
        { text: 'Active', value: 'active' },
        { text: 'Inactive', value: 'inactive' },
        { text: 'Maintenance', value: 'maintenance' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Staff',
      dataIndex: 'staffCount',
      key: 'staffCount',
      width: 80,
      responsive: ['md'] as any,
      align: 'center',
      sorter: (a, b) => a.staffCount - b.staffCount,
      render: (count: number) => (
        <Space size={4}>
          <TeamOutlined style={{ fontSize: 12, color: '#9ca3af' }} />
          {count}
        </Space>
      ),
    },
    {
      title: 'Daily Avg',
      dataIndex: 'dailyAvg',
      key: 'dailyAvg',
      width: 90,
      responsive: ['md'] as any,
      align: 'center',
      sorter: (a, b) => a.dailyAvg - b.dailyAvg,
    },
    {
      title: 'Connectivity',
      dataIndex: 'connectivity',
      key: 'connectivity',
      width: 120,
      responsive: ['lg'] as any,
      render: (conn: string) => {
        const colorMap: Record<string, string> = {
          good: 'green',
          intermittent: 'orange',
          offline: 'red',
        };
        return (
          <Space size={4}>
            <WifiOutlined style={{ color: colorMap[conn] === 'green' ? '#16a34a' : colorMap[conn] === 'orange' ? '#d97706' : '#dc2626' }} />
            <Tag color={colorMap[conn]}>{conn.charAt(0).toUpperCase() + conn.slice(1)}</Tag>
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <RoleGate permission="centers:write">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
          </RoleGate>
          <RoleGate permission="centers:delete">
            <Popconfirm
              title="Delete this center?"
              description="This action cannot be undone."
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                icon={<DeleteOutlined />}
                size="small"
                danger
              />
            </Popconfirm>
          </RoleGate>
        </Space>
      ),
    },
  ];

  // Expandable row
  const expandedRowRender = (record: HealthCenter) => (
    <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} bordered>
      <Descriptions.Item label="Total Patients">{record.totalPatients.toLocaleString()}</Descriptions.Item>
      <Descriptions.Item label="Active Since">{record.activeSince}</Descriptions.Item>
      <Descriptions.Item label="Last Sync">{record.lastSync}</Descriptions.Item>
      <Descriptions.Item label="Coordinates">
        {record.latitude != null && record.longitude != null
          ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`
          : 'N/A'}
      </Descriptions.Item>
      <Descriptions.Item label="Type">{record.type}</Descriptions.Item>
      <Descriptions.Item label="Connectivity">{record.connectivity}</Descriptions.Item>
    </Descriptions>
  );

  return (
    <div>
      <PageHeader
        title="Health Centers"
        subtitle="Manage and monitor all health centers in the network"
        extra={
          <RoleGate permission="centers:write">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Center
            </Button>
          </RoleGate>
        }
      />

      {/* Filters */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10} md={8}>
            <Input
              prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
              placeholder="Search centers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={7} md={5}>
            <Select
              value={stateFilter}
              onChange={setStateFilter}
              options={STATE_OPTIONS}
              style={{ width: '100%' }}
              placeholder="State"
            />
          </Col>
          <Col xs={12} sm={7} md={5}>
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
          dataSource={filteredCenters}
          columns={columns}
          expandable={{ expandedRowRender }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} centers`,
          }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingCenter ? 'Edit Health Center' : 'Add Health Center'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText={editingCenter ? 'Update' : 'Create'}
        width={600}
        afterClose={() => { form.resetFields(); setEditingCenter(null); }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Center Name"
            rules={[{ required: true, message: 'Please enter center name' }]}
          >
            <Input placeholder="e.g. PHC Raipur Central" />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="type"
                label="Type"
                rules={[{ required: true, message: 'Please select type' }]}
              >
                <Select options={TYPE_OPTIONS} placeholder="Select type" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="status"
                label="Status"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: 'Active', value: 'active' },
                    { label: 'Inactive', value: 'inactive' },
                    { label: 'Maintenance', value: 'maintenance' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="state"
                label="State"
                rules={[{ required: true, message: 'Please enter state' }]}
              >
                <Input placeholder="e.g. Chhattisgarh" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="district"
                label="District"
                rules={[{ required: true, message: 'Please enter district' }]}
              >
                <Input placeholder="e.g. Raipur" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="connectivity" label="Connectivity">
                <Select options={CONNECTIVITY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="latitude" label="Latitude">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="21.2514"
                  step={0.0001}
                  min={-90}
                  max={90}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="longitude" label="Longitude">
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="81.6296"
                  step={0.0001}
                  min={-180}
                  max={180}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
