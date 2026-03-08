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
  Badge,
  Avatar,
  Typography,
  Popconfirm,
  App,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  StopOutlined,
  SearchOutlined,
  UserOutlined,
  CheckCircleOutlined,
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

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  center: string;
  centerId: string;
  languages: string[];
  qualifications: string;
  lastActive: string;
  status: 'active' | 'inactive';
  avatar?: string;
}


const ROLE_OPTIONS = [
  { label: 'All Roles', value: '' },
  { label: 'Super Admin', value: 'super_admin' },
  { label: 'State Admin', value: 'state_admin' },
  { label: 'District Admin', value: 'district_admin' },
  { label: 'Viewer', value: 'viewer' },
  { label: 'Senior Nurse', value: 'senior_nurse' },
  { label: 'Nurse', value: 'nurse' },
  { label: 'ANM', value: 'anm' },
  { label: 'Staff Nurse', value: 'staff_nurse' },
];

const ADMIN_ROLES = ['super_admin', 'state_admin', 'district_admin', 'viewer'];

const CENTER_OPTIONS = [
  { label: 'All Centers', value: '' },
  { label: 'PHC Raipur Central', value: 'hc-001' },
  { label: 'CHC Bilaspur', value: 'hc-002' },
  { label: 'PHC Durg', value: 'hc-003' },
  { label: 'Sub-Center Korba', value: 'hc-004' },
  { label: 'PHC Rajnandgaon', value: 'hc-005' },
  { label: 'CHC Jagdalpur', value: 'hc-006' },
  { label: 'District Hospital Ambikapur', value: 'hc-007' },
];

const LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Chhattisgarhi',
  'Gondi',
  'Halbi',
  'Surgujiya',
  'Marathi',
];

const roleColorMap: Record<string, string> = {
  super_admin: 'purple',
  state_admin: 'blue',
  district_admin: 'cyan',
  viewer: 'default',
  senior_nurse: 'green',
  nurse: 'lime',
  anm: 'gold',
  staff_nurse: 'geekblue',
};

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { message: messageApi } = App.useApp();
  const queryClient = useQueryClient();

  const { data: fetchedUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchWithFallback<UserRecord[]>(endpoints.users.list),
    staleTime: 30_000,
  });

  const [users, setUsers] = useState<UserRecord[]>([]);

  React.useEffect(() => {
    if (fetchedUsers) {
      setUsers(fetchedUsers);
    }
  }, [fetchedUsers]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [centerFilter, setCenterFilter] = useState('');
  const [userTypeTab, setUserTypeTab] = useState<'all' | 'admins' | 'staff'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form] = Form.useForm();

  // Filtered data
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = !roleFilter || u.role === roleFilter;
      const matchCenter = !centerFilter || u.centerId === centerFilter;
      return matchSearch && matchRole && matchCenter;
    });
  }, [users, search, roleFilter, centerFilter]);

  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (user: UserRecord) => {
    setEditingUser(user);
    form.resetFields();
    form.setFieldsValue(user);
    setModalOpen(true);
  };

  const handleDeactivate = async (id: string) => {
    const user = users.find((u) => u.id === id);
    const newStatus = user?.status === 'active' ? 'inactive' : 'active';
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: newStatus } : u)),
    );
    messageApi.success('User status updated');
    try { await api.patch(endpoints.users.update(id), { status: newStatus }); } catch (err) { console.error('Failed to update user status:', err); throw err; }
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const handleSave = () => {
    form.validateFields().then(async (values) => {
      const centerOption = CENTER_OPTIONS.find((c) => c.value === values.centerId);
      const centerName = centerOption?.label ?? values.centerId;

      if (editingUser) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id ? { ...u, ...values, center: centerName } : u,
          ),
        );
        messageApi.success('User updated successfully');
        try { await api.put(endpoints.users.update(editingUser.id), values); } catch (err) { console.error('Failed to update user:', err); throw err; }
      } else {
        const newUser: UserRecord = {
          ...values,
          id: `u-${Date.now()}`,
          center: centerName,
          lastActive: 'Never',
          status: 'active',
        };
        setUsers((prev) => [newUser, ...prev]);
        messageApi.success('User created successfully');
        try { await api.post(endpoints.users.create, values); } catch (err) { console.error('Failed to create user:', err); throw err; }
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setModalOpen(false);
      form.resetFields();
    }).catch(() => {
      // Validation failed — AntD already shows field errors
    });
  };

  const columns: ColumnsType<UserRecord> = [
    {
      title: 'Name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <Space>
          <Avatar
            size={36}
            icon={<UserOutlined />}
            src={record.avatar}
            style={{
              backgroundColor:
                record.status === 'active' ? '#7c3aed' : '#d1d5db',
            }}
          />
          <div>
            <Text strong>{record.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 140,
      render: (role: string) => (
        <Tag color={roleColorMap[role] ?? 'default'}>
          {formatRole(role)}
        </Tag>
      ),
      filters: ROLE_OPTIONS.filter((r) => r.value).map((r) => ({
        text: r.label,
        value: r.value,
      })),
      onFilter: (value, record) => record.role === value,
    },
    {
      title: 'Center',
      dataIndex: 'center',
      key: 'center',
      ellipsis: true,
    },
    {
      title: 'Languages',
      dataIndex: 'languages',
      key: 'languages',
      width: 200,
      responsive: ['md'] as any,
      render: (languages: string[]) => (
        <Space size={[4, 4]} wrap>
          {languages.map((lang) => (
            <Tag key={lang} style={{ fontSize: 11 }}>
              {lang}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Last Active',
      dataIndex: 'lastActive',
      key: 'lastActive',
      width: 130,
      responsive: ['lg'] as any,
      render: (val: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {val}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Badge
          status={status === 'active' ? 'success' : 'error'}
          text={
            <Text style={{ fontSize: 13 }}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          }
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <RoleGate permission="users:write">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEdit(record)}
            />
          </RoleGate>
          <RoleGate permission="users:write">
            <Popconfirm
              title={
                record.status === 'active'
                  ? 'Deactivate this user?'
                  : 'Activate this user?'
              }
              onConfirm={() => handleDeactivate(record.id)}
              okText="Confirm"
            >
              <Button
                type="text"
                icon={
                  record.status === 'active' ? (
                    <StopOutlined />
                  ) : (
                    <CheckCircleOutlined />
                  )
                }
                size="small"
                danger={record.status === 'active'}
              />
            </Popconfirm>
          </RoleGate>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage administrators, nurses, and staff accounts"
        extra={
          <RoleGate permission="users:write">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add User
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
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={7} md={5}>
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Role"
            />
          </Col>
          <Col xs={12} sm={7} md={5}>
            <Select
              value={centerFilter}
              onChange={setCenterFilter}
              options={CENTER_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Center"
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={filteredUsers}
          columns={columns}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} users`,
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingUser ? 'Edit User' : 'Add User'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText={editingUser ? 'Update' : 'Create'}
        width={600}
        afterClose={() => { form.resetFields(); setEditingUser(null); }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Full Name"
            rules={[{ required: true, message: 'Please enter full name' }]}
          >
            <Input placeholder="e.g. Dr. Priya Sharma" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input placeholder="e.g. priya.sharma@vaidyah.in" />
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="role"
                label="Role"
                rules={[{ required: true, message: 'Please select a role' }]}
              >
                <Select
                  options={ROLE_OPTIONS.filter((r) => r.value)}
                  placeholder="Select role"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="centerId"
                label="Center"
                rules={[
                  { required: true, message: 'Please select a center' },
                ]}
              >
                <Select
                  options={CENTER_OPTIONS.filter((c) => c.value)}
                  placeholder="Select center"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="languages"
            label="Languages"
            rules={[
              {
                required: true,
                message: 'Please select at least one language',
              },
            ]}
          >
            <Select
              mode="multiple"
              placeholder="Select languages"
              options={LANGUAGE_OPTIONS.map((l) => ({ label: l, value: l }))}
            />
          </Form.Item>

          <Form.Item name="qualifications" label="Qualifications">
            <Input placeholder="e.g. MBBS, GNM, BSc Nursing" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
