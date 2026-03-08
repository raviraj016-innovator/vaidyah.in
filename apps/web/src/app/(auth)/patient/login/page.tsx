'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Card, Form, Input, Button, Alert, Typography, Divider, Space } from 'antd';
import { PhoneOutlined, SafetyOutlined, UserOutlined, HeartOutlined, RocketOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

const { Title, Text } = Typography;

export default function PatientLoginPage() {
  const [phoneForm] = Form.useForm();
  const [otpForm] = Form.useForm();
  const { sendOtp, verifyOtp, guestLogin } = useAuth();
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const otpSent = useAuthStore((s) => s.otpSent);
  const setOtpSent = useAuthStore((s) => s.setOtpSent);
  const setError = useAuthStore((s) => s.setError);
  const { t, language } = useTranslation();

  // OTP resend countdown timer
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (resendCountdown <= 0) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [resendCountdown]);

  const handleSendOtp = async (values: { phone: string }) => {
    try {
      await sendOtp(values.phone);
      setResendCountdown(30);
    } catch { /* store handles */ }
  };

  const handleResendOtp = useCallback(async () => {
    const phone = phoneForm.getFieldValue('phone');
    if (!phone) return;
    try {
      await sendOtp(phone);
      setResendCountdown(30);
    } catch { /* store handles */ }
  }, [phoneForm, sendOtp]);

  const handleVerifyOtp = async (values: { otp: string }) => {
    try { await verifyOtp(values.otp); }
    catch { /* store handles */ }
  };

  const handleChangeNumber = () => {
    setOtpSent(false);
    setError(null);
    setResendCountdown(0);
    otpForm.resetFields();
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

      {!otpSent ? (
        <Form form={phoneForm} layout="vertical" onFinish={handleSendOtp} autoComplete="off" size="large">
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

          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary" htmlType="submit" loading={isLoading} block
              style={{ height: 46, fontWeight: 600 }}
            >
              {t('patient.login.sendOtp') !== 'patient.login.sendOtp' ? t('patient.login.sendOtp') : 'Send OTP'}
            </Button>
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              block
              icon={<RocketOutlined />}
              onClick={() => guestLogin('patient')}
              style={{ height: 46, fontWeight: 600, borderColor: '#7c3aed', color: '#7c3aed' }}
            >
              {language === 'hi' ? 'अतिथि के रूप में आज़माएं' : 'Try as Guest'}
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
      ) : (
        <Form form={otpForm} layout="vertical" onFinish={handleVerifyOtp} autoComplete="off" size="large">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <SafetyOutlined style={{ fontSize: 40, color: '#7c3aed', marginBottom: 12 }} />
            <Text style={{ display: 'block' }}>
              {t('patient.login.otpSentMessage') !== 'patient.login.otpSentMessage' ? t('patient.login.otpSentMessage') : 'Enter the 6-digit OTP sent to your phone'}
            </Text>
          </div>

          <Form.Item name="otp" rules={[{ required: true, message: 'Please enter the OTP' }, { len: 6, message: 'OTP must be 6 digits' }]} style={{ display: 'flex', justifyContent: 'center' }}>
            <Input.OTP length={6} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button
              type="primary" htmlType="submit" loading={isLoading} block
              style={{ height: 46, fontWeight: 600 }}
            >
              {t('patient.login.verify') !== 'patient.login.verify' ? t('patient.login.verify') : 'Verify & Login'}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Space direction="vertical" size={4}>
              <Button
                type="link"
                size="small"
                onClick={handleResendOtp}
                disabled={resendCountdown > 0 || isLoading}
                style={{ color: resendCountdown > 0 ? '#94a3b8' : '#7c3aed' }}
              >
                {resendCountdown > 0
                  ? language === 'hi'
                    ? `${resendCountdown}s में पुनः भेजें`
                    : `Resend in ${resendCountdown}s`
                  : language === 'hi'
                    ? 'OTP पुनः भेजें'
                    : 'Resend OTP'}
              </Button>
              <Button type="link" size="small" onClick={handleChangeNumber} style={{ color: '#7c3aed' }}>
                {t('patient.login.changeNumber') !== 'patient.login.changeNumber' ? t('patient.login.changeNumber') : 'Change Phone Number'}
              </Button>
            </Space>
          </div>
        </Form>
      )}
    </Card>
  );
}
