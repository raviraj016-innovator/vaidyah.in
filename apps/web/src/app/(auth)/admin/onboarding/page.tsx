'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  Steps,
  Select,
  App,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { authApi } from '@/lib/api/client';

const { Title, Text } = Typography;

export default function AdminOnboardingPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      await authApi.patch('/me/profile', values);
      message.success('Profile completed successfully!');
      
      setTimeout(() => {
        router.push('/admin/dashboard');
      }, 1000);
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      style={{ width: '100%', maxWidth: 440, borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
      styles={{ body: { padding: 40 } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 32 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
          boxShadow: '0 4px 12px rgba(30,58,95,0.2)',
        }}>
          <UserOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Complete Your Profile
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
          Set up your administrator account
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
          <Input prefix={<MailOutlined style={{ color: '#9ca3af' }} />} placeholder="admin@example.com" />
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

        <div style={{ background: '#f0f9ff', padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            <CheckCircleOutlined style={{ color: '#2563eb', marginRight: 8 }} />
            This information will be used for system notifications and account recovery.
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
