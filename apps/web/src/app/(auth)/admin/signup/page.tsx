'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Form, Input, Button, Alert, Typography, Select, Result } from 'antd';
import {
  LockOutlined,
  MailOutlined,
  DashboardOutlined,
  UserOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/client';

const { Title, Text } = Typography;

export default function AdminSignupPage() {
  const [form] = Form.useForm();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bootstrapAllowed, setBootstrapAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const checkBootstrap = async () => {
      try {
        const response = await authApi.get('/bootstrap/check');
        setBootstrapAllowed(response.data?.allowed ?? false);
      } catch (err) {
        console.error('Failed to check bootstrap status:', err);
        setBootstrapAllowed(false);
      }
    };
    checkBootstrap();
  }, []);

  const handleSubmit = async (values: {
    name: string;
    email: string;
    password: string;
    role: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.post('/bootstrap/admin', values);
      if (response.data?.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/admin/login');
        }, 2000);
      }
    } catch (err: any) {
      const status = err.response?.status;
      const message =
        status === 403
          ? 'Admin signup is disabled. Admins already exist in the system.'
          : status === 409
            ? 'An admin with this email already exists.'
            : err.response?.data?.error?.message || err.response?.data?.message || 'Signup failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (bootstrapAllowed === null) {
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
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid #f0f0f0',
              borderTopColor: '#7c3aed',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
              margin: '0 auto',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <Text style={{ display: 'block', marginTop: 16, color: '#94a3b8' }}>
            Checking system status...
          </Text>
        </div>
      </Card>
    );
  }

  if (bootstrapAllowed === false) {
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
        <Result
          status="403"
          title="Signup Disabled"
          subTitle="Admin accounts already exist in the system. Please contact an existing administrator to create your account."
          extra={
            <Link href="/admin/login">
              <Button type="primary">Go to Login</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  if (success) {
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
        <Result
          status="success"
          title="Admin Account Created!"
          subTitle="Your admin account has been created successfully. Redirecting to sign in..."
          icon={<SafetyOutlined style={{ color: '#16a34a' }} />}
        />
      </Card>
    );
  }

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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
            boxShadow: '0 4px 12px rgba(30,58,95,0.2)',
          }}
        >
          <DashboardOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Create Admin Account
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>
          Bootstrap your first administrator
        </Text>
      </div>

      {error && <Alert message={error} type="error" showIcon closable style={{ marginBottom: 24 }} />}

      <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off" size="large">
        <Form.Item
          name="name"
          label="Full Name"
          rules={[{ required: true, message: 'Please enter your full name' }]}
        >
          <Input prefix={<UserOutlined style={{ color: '#9ca3af' }} />} placeholder="John Doe" />
        </Form.Item>

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
          rules={[
            { required: true, message: 'Please enter a password' },
            { min: 8, message: 'Password must be at least 8 characters' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Enter password (min 8 characters)"
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Please confirm your password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Confirm password"
          />
        </Form.Item>

        <Form.Item
          name="role"
          label="Admin Role"
          initialValue="super_admin"
          rules={[{ required: true, message: 'Please select a role' }]}
        >
          <Select
            options={[
              { label: 'Super Admin', value: 'super_admin' },
              { label: 'State Admin', value: 'state_admin' },
              { label: 'District Admin', value: 'district_admin' },
            ]}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={isLoading}
            block
            style={{ height: 46, fontWeight: 600 }}
          >
            Create Admin Account
          </Button>
        </Form.Item>

        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 8 }}>
            Already have an account?
          </Text>
          <Link href="/admin/login" style={{ color: '#7c3aed', fontSize: 13 }}>
            Sign in instead
          </Link>
        </div>
      </Form>
    </Card>
  );
}
