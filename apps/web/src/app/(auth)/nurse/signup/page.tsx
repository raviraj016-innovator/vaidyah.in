'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Form, Input, Button, Alert, Typography, Select, Result } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  MailOutlined,
  MedicineBoxOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { authApi } from '@/lib/api/client';

const { Title, Text } = Typography;

interface HealthCenter {
  id: string;
  name: string;
  district: string;
  state: string;
}

export default function NurseSignupPage() {
  const [form] = Form.useForm();
  const { language } = useTranslation();
  const [centers, setCenters] = useState<HealthCenter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    authApi
      .get('/centers')
      .then((res) => {
        if (res.data?.data?.length) setCenters(res.data.data);
      })
      .catch((err) => {
        console.error('Failed to fetch centers:', err);
      });
  }, []);

  const handleSignup = async (values: {
    name: string;
    email: string;
    password: string;
    centerId: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      await authApi.post('/nurse/signup', values);
      setSuccess(true);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.response?.data?.message;
      if (status === 409) {
        setError(msg || 'A user with this email already exists.');
      } else if (status === 429) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(msg || 'Signup failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

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
          title={language === 'hi' ? 'पंजीकरण सफल!' : 'Registration Successful!'}
          subTitle={
            language === 'hi'
              ? 'आपका खाता व्यवस्थापक अनुमोदन की प्रतीक्षा में है। अनुमोदन के बाद आप लॉगिन कर सकते हैं।'
              : 'Your account is pending admin approval. You will be able to login once approved.'
          }
          extra={
            <Link href="/nurse/login">
              <Button type="primary" style={{ background: '#0d9488', borderColor: '#0d9488' }}>
                {language === 'hi' ? 'लॉगिन पेज पर जाएं' : 'Go to Login'}
              </Button>
            </Link>
          }
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <LanguageSwitcher />
      </div>

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
            background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
            boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
          }}
        >
          <MedicineBoxOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {language === 'hi' ? 'नर्स पंजीकरण' : 'Nurse Registration'}
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>
          {language === 'hi'
            ? 'खाता बनाएं - व्यवस्थापक अनुमोदन के बाद लॉगिन करें'
            : 'Create an account - login after admin approval'}
        </Text>
      </div>

      {error && (
        <Alert message={error} type="error" showIcon closable style={{ marginBottom: 24 }} />
      )}

      <Form form={form} layout="vertical" onFinish={handleSignup} autoComplete="off" size="large">
        <Form.Item
          name="name"
          label={language === 'hi' ? 'पूरा नाम' : 'Full Name'}
          rules={[{ required: true, message: 'Please enter your full name' }]}
        >
          <Input
            prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
            placeholder={language === 'hi' ? 'अपना नाम दर्ज करें' : 'Enter your full name'}
          />
        </Form.Item>

        <Form.Item
          name="email"
          label={language === 'hi' ? 'ईमेल' : 'Email'}
          rules={[
            { required: true, message: 'Please enter your email' },
            { type: 'email', message: 'Please enter a valid email' },
          ]}
        >
          <Input
            prefix={<MailOutlined style={{ color: '#9ca3af' }} />}
            placeholder="e.g. nurse@example.com"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={language === 'hi' ? 'पासवर्ड' : 'Password'}
          rules={[
            { required: true, message: 'Please enter a password' },
            { min: 6, message: 'Password must be at least 6 characters' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
            placeholder={language === 'hi' ? 'पासवर्ड दर्ज करें' : 'Enter password'}
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label={language === 'hi' ? 'पासवर्ड पुष्टि' : 'Confirm Password'}
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
            placeholder={language === 'hi' ? 'पासवर्ड दोबारा दर्ज करें' : 'Re-enter password'}
          />
        </Form.Item>

        <Form.Item
          name="centerId"
          label={language === 'hi' ? 'स्वास्थ्य केंद्र' : 'Health Center'}
          rules={[{ required: true, message: 'Please select your center' }]}
        >
          <Select
            placeholder={
              language === 'hi' ? 'अपना स्वास्थ्य केंद्र चुनें' : 'Select your health center'
            }
            showSearch
            optionFilterProp="label"
            suffixIcon={<BankOutlined style={{ color: '#9ca3af' }} />}
            options={centers.map((c) => ({
              value: c.id,
              label: `${c.name} - ${c.district}`,
            }))}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            style={{ height: 46, fontWeight: 600, background: '#0d9488', borderColor: '#0d9488' }}
          >
            {language === 'hi' ? 'पंजीकरण करें' : 'Sign Up'}
          </Button>
        </Form.Item>

        <div style={{ textAlign: 'center' }}>
          <Text style={{ color: '#64748b', fontSize: 13 }}>
            {language === 'hi' ? 'पहले से खाता है?' : 'Already have an account?'}{' '}
            <Link href="/nurse/login" style={{ color: '#0d9488', fontWeight: 500 }}>
              {language === 'hi' ? 'लॉगिन करें' : 'Sign In'}
            </Link>
          </Text>
        </div>
      </Form>
    </Card>
  );
}
