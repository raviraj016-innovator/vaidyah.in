'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  Select,
  Space,
  App,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  MedicineBoxOutlined,
  CheckCircleOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { authApi } from '@/lib/api/client';
import api from '@/lib/api/client';

const { Title, Text } = Typography;

const NURSE_QUALIFICATIONS = [
  'GNM (General Nursing and Midwifery)',
  'B.Sc Nursing',
  'M.Sc Nursing',
  'Post Basic B.Sc Nursing',
  'ANM (Auxiliary Nurse Midwife)',
  'Diploma in Nursing',
];

export default function NurseOnboardingPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [centers, setCenters] = useState<any[]>([]);
  const [centersLoading, setCentersLoading] = useState(true);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCenters();
  }, []);

  const fetchCenters = async () => {
    setCentersLoading(true);
    try {
      const { data } = await api.get('/centers');
      setCenters(data.data || []);
    } catch (error) {
      console.error('Failed to fetch centers:', error);
    } finally {
      setCentersLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      await authApi.patch('/me/profile', values);
      
      message.success('Profile completed successfully!');
      
      setTimeout(() => {
        router.push('/nurse/dashboard');
      }, 1000);
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      style={{ width: '100%', maxWidth: 500, borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
      styles={{ body: { padding: 40 } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 32 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, #059669, #10b981)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
          boxShadow: '0 4px 12px rgba(5,150,105,0.2)',
        }}>
          <MedicineBoxOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Complete Your Profile
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
          Set up your healthcare professional account
        </Text>
      </div>

      <Form form={form} onFinish={handleSubmit} layout="vertical" size="large">
        <Form.Item
          name="name"
          label="Full Name"
          rules={[{ required: true, message: 'Please enter your full name' }]}
        >
          <Input prefix={<UserOutlined style={{ color: '#9ca3af' }} />} placeholder="Enter your full name" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email Address"
          rules={[
            { required: true, message: 'Please enter your email' },
            { type: 'email', message: 'Please enter a valid email' },
          ]}
        >
          <Input prefix={<MailOutlined style={{ color: '#9ca3af' }} />} placeholder="nurse@example.com" />
        </Form.Item>

        <Form.Item
          name="phone"
          label="Phone Number"
          rules={[
            { required: true, message: 'Please enter your phone number' },
            { pattern: /^[6-9]\d{9}$/, message: 'Please enter a valid 10-digit mobile number' },
          ]}
        >
          <Input prefix={<PhoneOutlined style={{ color: '#9ca3af' }} />} placeholder="9876543210" maxLength={10} />
        </Form.Item>

        <Form.Item
          name="centerId"
          label="Health Center"
          rules={[{ required: true, message: 'Please select your health center' }]}
        >
          <Select
            placeholder="Select your health center"
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={centers.map(center => ({
              label: `${center.name} - ${center.district}, ${center.state}`,
              value: center.id,
            }))}
            loading={centersLoading}
          />
        </Form.Item>

        <Form.Item
          name="qualifications"
          label="Qualifications"
          rules={[{ required: true, message: 'Please select your qualifications' }]}
        >
          <Select
            mode="multiple"
            placeholder="Select your qualifications"
            options={NURSE_QUALIFICATIONS.map(q => ({ label: q, value: q }))}
          />
        </Form.Item>

        <Form.Item
          name="registrationNumber"
          label="Nursing Council Registration Number"
          tooltip="Your state nursing council registration number"
        >
          <Input placeholder="Enter registration number (optional)" />
        </Form.Item>

        <div style={{ background: '#f0f9ff', padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            <CheckCircleOutlined style={{ color: '#2563eb', marginRight: 8 }} />
            This information helps us assign you to the right health center and verify your credentials.
          </Text>
        </div>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontWeight: 600 }}>
            Complete Profile & Continue
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
