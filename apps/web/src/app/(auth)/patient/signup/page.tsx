'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Form, Input, Button, Card, Typography, Divider, App } from 'antd';
import { UserOutlined, PhoneOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth-store';

const { Title, Text } = Typography;

export default function PatientSignupPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const loginPatient = useAuthStore((s) => s.loginPatient);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSignup = async (values: { name: string; phone: string; password: string }) => {
    setLoading(true);
    try {
      const { data } = await authApi.post(endpoints.auth.patientSignup, {
        name: values.name,
        phone: values.phone,
        password: values.password,
      });

      loginPatient(data.user, data.access_token, data.refresh_token);
      message.success('Account created successfully!');

      if (data.user.profileComplete) {
        router.push('/patient/home');
      } else {
        router.push('/patient/onboarding');
      }
    } catch (error: any) {
      const status = error.response?.status;
      const serverMsg = error.response?.data?.error?.message;
      const msg =
        status === 409 ? (serverMsg || 'Phone number already registered. Please login instead.') :
        status === 429 ? 'Too many attempts. Please try again later.' :
        serverMsg || 'Signup failed. Please try again.';
      message.error(msg);
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
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
          boxShadow: '0 4px 12px rgba(124,58,237,0.2)',
        }}>
          <UserOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          Patient Signup
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>
          Create your account to access healthcare services
        </Text>
      </div>

      <Form form={form} onFinish={handleSignup} layout="vertical" size="large">
        <Form.Item
          name="name"
          label="Full Name"
          rules={[
            { required: true, message: 'Please enter your name' },
            { min: 2, message: 'Name must be at least 2 characters' },
          ]}
        >
          <Input
            prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Enter your full name"
          />
        </Form.Item>

        <Form.Item
          name="phone"
          label="Phone Number"
          rules={[
            { required: true, message: 'Please enter your phone number' },
            { pattern: /^[6-9]\d{9}$/, message: 'Please enter a valid 10-digit phone number' },
          ]}
        >
          <Input
            prefix={<PhoneOutlined style={{ color: '#9ca3af' }} />}
            placeholder="9876543210"
            maxLength={10}
          />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[
            { required: true, message: 'Please enter a password' },
            { min: 6, message: 'Password must be at least 6 characters' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Create a password"
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
            placeholder="Confirm your password"
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 16 }}>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontWeight: 600 }}>
            Create Account
          </Button>
        </Form.Item>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text style={{ color: '#94a3b8', fontSize: 13 }}>
            Already have an account?{' '}
            <Link href="/patient/login" style={{ color: '#7c3aed', fontWeight: 500 }}>
              Login here
            </Link>
          </Text>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ textAlign: 'center' }}>
          <Link href="/" style={{ color: '#7c3aed', fontSize: 13 }}>
            Back to portal selection
          </Link>
        </div>
      </Form>
    </Card>
  );
}
