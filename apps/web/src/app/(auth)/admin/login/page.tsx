'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { LockOutlined, MailOutlined, DashboardOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/use-auth';
import { useAuthStore } from '@/stores/auth-store';

const { Title, Text } = Typography;

export default function AdminLoginPage() {
  const [form] = Form.useForm();
  const { loginAdmin } = useAuth();
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);

  const handleSubmit = async (values: { email: string; password: string }) => {
    setError(null);
    try {
      await loginAdmin(values.email, values.password);
    } catch {
      // Error handled by store
    }
  };

  return (
    <Card
      style={{
        width: '100%',
        maxWidth: 440,
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}
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
          <DashboardOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>Admin Portal</Title>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>Sign in to manage your health centers</Text>
      </div>

      {error && (
        <Alert message={error} type="error" showIcon closable style={{ marginBottom: 24 }} />
      )}

      <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off" size="large">
        <Form.Item
          name="email"
          label="Email Address"
          rules={[
            { required: true, message: 'Please enter your email' },
            { type: 'email', message: 'Please enter a valid email' },
          ]}
        >
          <Input prefix={<MailOutlined style={{ color: '#9ca3af' }} />} placeholder="admin@vaidyah.in" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Please enter your password' }]}
        >
          <Input.Password prefix={<LockOutlined style={{ color: '#9ca3af' }} />} placeholder="Enter password" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={isLoading}
            block
            style={{ height: 46, fontWeight: 600 }}
          >
            Sign In
          </Button>
        </Form.Item>

        <div style={{ textAlign: 'center' }}>
          <Link href="/" style={{ color: '#7c3aed', fontSize: 13 }}>
            Back to portal selection
          </Link>
        </div>
      </Form>
    </Card>
  );
}
