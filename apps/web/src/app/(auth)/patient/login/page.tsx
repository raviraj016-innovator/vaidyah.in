'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Form, Input, Button, Alert, Typography, Divider, Space } from 'antd';
import { PhoneOutlined, LockOutlined, HeartOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

const { Title, Text } = Typography;

export default function PatientLoginPage() {
  const [form] = Form.useForm();
  const { loginPatient } = useAuth();
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);
  const { t, language } = useTranslation();

  const handleLogin = async (values: { phone: string; password: string }) => {
    setError(null);
    try {
      await loginPatient(values.phone, values.password);
    } catch { /* store handles */ }
  };

  return (
    <Card
      style={{ width: '100%', maxWidth: 440, borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
      styles={{ body: { padding: 40 } }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <LanguageSwitcher />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 32 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
          boxShadow: '0 4px 12px rgba(124,58,237,0.2)',
        }}>
          <HeartOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {t('patient.login.title') !== 'patient.login.title' ? t('patient.login.title') : 'Patient Portal'}
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>
          {t('patient.login.subtitle') !== 'patient.login.subtitle' ? t('patient.login.subtitle') : 'Access your health records securely'}
        </Text>
      </div>

      {error && <Alert message={error} type="error" showIcon closable style={{ marginBottom: 24 }} />}

      <Form form={form} layout="vertical" onFinish={handleLogin} autoComplete="off" size="large">
        <Form.Item
          name="phone"
          label={t('patient.login.phone') !== 'patient.login.phone' ? t('patient.login.phone') : 'Phone Number'}
          rules={[
            { required: true, message: 'Please enter your phone number' },
            { pattern: /^[6-9]\d{9}$/, message: 'Please enter a valid 10-digit mobile number' },
          ]}
        >
          <Space.Compact style={{ width: '100%' }}>
            <Button disabled style={{ pointerEvents: 'none', fontWeight: 500 }}>+91</Button>
            <Input prefix={<PhoneOutlined style={{ color: '#9ca3af' }} />} placeholder="9876543210" maxLength={10} />
          </Space.Compact>
        </Form.Item>

        <Form.Item
          name="password"
          label={language === 'hi' ? 'पासवर्ड' : 'Password'}
          rules={[{ required: true, message: 'Please enter your password' }]}
        >
          <Input.Password prefix={<LockOutlined style={{ color: '#9ca3af' }} />} placeholder="Enter password" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 12 }}>
          <Button
            type="primary" htmlType="submit" loading={isLoading} block
            style={{ height: 46, fontWeight: 600 }}
          >
            {language === 'hi' ? 'साइन इन करें' : 'Sign In'}
          </Button>
        </Form.Item>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text style={{ color: '#94a3b8', fontSize: 13 }}>
            Don't have an account?{' '}
            <Link href="/patient/signup" style={{ color: '#7c3aed', fontWeight: 500 }}>
              Create Account
            </Link>
          </Text>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ textAlign: 'center' }}>
          <Link href="/" style={{ color: '#7c3aed', fontSize: 13 }}>
            {t('common.backToPortal') !== 'common.backToPortal' ? t('common.backToPortal') : 'Back to portal selection'}
          </Link>
        </div>
      </Form>
    </Card>
  );
}
