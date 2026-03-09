'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Form, Input, Button, Alert, Typography, Select } from 'antd';
import {
  LockOutlined,
  IdcardOutlined,
  MedicineBoxOutlined,
  BankOutlined,
  SafetyOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { authApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

const { Title, Text } = Typography;

interface HealthCenter {
  id: string;
  name: string;
  district: string;
  state: string;
}


export default function NurseLoginPage() {
  const [form] = Form.useForm();
  const [otpForm] = Form.useForm();
  const router = useRouter();
  const { loginNurse, verifyMfa, guestLogin } = useAuth();
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const mfaRequired = useAuthStore((s) => s.mfaRequired);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const portalType = useAuthStore((s) => s.portalType);
  const { t, language } = useTranslation();
  const [centers, setCenters] = useState<HealthCenter[]>([]);
  const [centersFetched, setCentersFetched] = useState(false);
  const setError = useAuthStore((s) => s.setError);

  // Redirect authenticated nurse users to dashboard (client-side, no full reload)
  useEffect(() => {
    if (isAuthenticated && portalType === 'nurse' && !mfaRequired) {
      router.replace('/nurse/dashboard');
    }
  }, [isAuthenticated, portalType, mfaRequired, router]);

  useEffect(() => {
    if (centersFetched || isAuthenticated) return;

    authApi
      .get('/centers')
      .then((res) => {
        if (res.data?.data?.length) setCenters(res.data.data);
        setCentersFetched(true);
      })
      .catch((err) => {
        console.error('Failed to fetch health centers:', err);
        setCentersFetched(true);
      });
  }, [centersFetched, isAuthenticated]);

  const handleLogin = async (values: { identifier: string; password: string; centerId: string }) => {
    setError(null);
    try { await loginNurse(values.identifier, values.password, values.centerId); }
    catch { /* store handles */ }
  };

  const handleVerifyMfa = async (values: { otp: string }) => {
    setError(null);
    try { await verifyMfa(values.otp); }
    catch { /* store handles */ }
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
          background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8,
          boxShadow: '0 4px 12px rgba(13,148,136,0.2)',
        }}>
          <MedicineBoxOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Title level={3} style={{ margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {t('nurse.login.title') !== 'nurse.login.title' ? t('nurse.login.title') : 'Nurse Portal'}
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14 }}>
          {t('nurse.login.subtitle') !== 'nurse.login.subtitle' ? t('nurse.login.subtitle') : 'Sign in to start consultations'}
        </Text>
      </div>

      {error && <Alert message={error} type="error" showIcon closable style={{ marginBottom: 24 }} />}

      {!mfaRequired ? (
        <Form form={form} layout="vertical" onFinish={handleLogin} autoComplete="off" size="large">
          <Form.Item
            name="identifier"
            label={t('nurse.login.staffId') !== 'nurse.login.staffId' ? t('nurse.login.staffId') : 'Staff ID / Registration Number'}
            rules={[{ required: true, message: 'Please enter your Staff ID' }]}
          >
            <Input prefix={<IdcardOutlined style={{ color: '#9ca3af' }} />} placeholder="e.g. NRS-12345" />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('nurse.login.password') !== 'nurse.login.password' ? t('nurse.login.password') : 'Password'}
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: '#9ca3af' }} />} placeholder="Enter password" />
          </Form.Item>

          <Form.Item
            name="centerId"
            label={t('nurse.login.center') !== 'nurse.login.center' ? t('nurse.login.center') : 'Health Center'}
            rules={[{ required: true, message: 'Please select your center' }]}
          >
            <Select
              placeholder="Select your health center"
              showSearch
              optionFilterProp="label"
              suffixIcon={<BankOutlined style={{ color: '#9ca3af' }} />}
              options={centers.map((c) => ({ value: c.id, label: `${c.name} - ${c.district}` }))}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary" htmlType="submit" loading={isLoading} block
              style={{ height: 46, fontWeight: 600, background: '#0d9488', borderColor: '#0d9488' }}
            >
              {t('nurse.login.signIn') !== 'nurse.login.signIn' ? t('nurse.login.signIn') : 'Sign In'}
            </Button>
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              block
              icon={<RocketOutlined />}
              onClick={() => guestLogin('nurse')}
              style={{ height: 46, fontWeight: 600, borderColor: '#0d9488', color: '#0d9488' }}
            >
              {language === 'hi' ? 'अतिथि के रूप में आज़माएं' : 'Try as Guest'}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link href="/" style={{ color: '#7c3aed', fontSize: 13 }}>
              {t('common.backToPortal') !== 'common.backToPortal' ? t('common.backToPortal') : 'Back to portal selection'}
            </Link>
          </div>
        </Form>
      ) : (
        <Form form={otpForm} layout="vertical" onFinish={handleVerifyMfa} autoComplete="off" size="large">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <SafetyOutlined style={{ fontSize: 40, color: '#0d9488', marginBottom: 12 }} />
            <Text style={{ display: 'block' }}>
              {t('nurse.login.mfaPrompt') !== 'nurse.login.mfaPrompt' ? t('nurse.login.mfaPrompt') : 'Enter the 6-digit code sent to your registered device'}
            </Text>
          </div>

          <Form.Item name="otp" rules={[{ required: true, message: 'Please enter the OTP' }, { len: 6, message: 'OTP must be 6 digits' }]} style={{ display: 'flex', justifyContent: 'center' }}>
            <Input.OTP length={6} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={isLoading} block style={{ height: 46, fontWeight: 600, background: '#0d9488', borderColor: '#0d9488' }}>
              {t('nurse.login.verify') !== 'nurse.login.verify' ? t('nurse.login.verify') : 'Verify & Continue'}
            </Button>
          </Form.Item>
        </Form>
      )}
    </Card>
  );
}
