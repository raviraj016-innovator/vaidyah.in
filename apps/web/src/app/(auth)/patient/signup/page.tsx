'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, Typography, Steps, Divider, App } from 'antd';
import { UserOutlined, PhoneOutlined, SafetyOutlined } from '@ant-design/icons';
import { authApi } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';

const { Title, Text } = Typography;

export default function PatientSignupPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const loginPatient = useAuthStore((s) => s.loginPatient);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [sessionId, setSessionId] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [form] = Form.useForm();

  const handleSendOTP = async (values: { phone: string }) => {
    setLoading(true);
    try {
      const { data } = await authApi.post('/otp/send', { phone: values.phone });
      setSessionId(data.session_id);
      setPhone(values.phone);
      setCurrentStep(1);
      message.success('OTP sent successfully!');
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (values: { otp: string }) => {
    setLoading(true);
    try {
      const { data } = await authApi.post('/otp/verify', {
        session_id: sessionId,
        otp: values.otp,
      });

      // Use the auth store to save tokens and user
      loginPatient(data.user, data.access_token, data.refresh_token);

      message.success('Signup successful!');
      
      // Check if profile is complete
      if (data.user.profileComplete) {
        router.push('/patient/home');
      } else {
        router.push('/patient/onboarding');
      }
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Invalid OTP');
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

      <Steps
        current={currentStep}
        style={{ marginBottom: 32 }}
        size="small"
        items={[
          { title: 'Phone', icon: <PhoneOutlined /> },
          { title: 'Verify', icon: <SafetyOutlined /> },
        ]}
      />

        {currentStep === 0 && (
        <Form form={form} onFinish={handleSendOTP} layout="vertical" size="large">
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
              size="large"
              maxLength={10}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontWeight: 600 }}>
              Send OTP
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text style={{ color: '#94a3b8', fontSize: 13 }}>
              Already have an account?{' '}
              <a href="/patient/login" style={{ color: '#7c3aed', fontWeight: 500 }}>
                Login here
              </a>
            </Text>
          </div>

          <Divider style={{ margin: '16px 0' }} />

          <div style={{ textAlign: 'center' }}>
            <a href="/" style={{ color: '#7c3aed', fontSize: 13 }}>
              Back to portal selection
            </a>
          </div>
        </Form>
      )}

        {currentStep === 1 && (
        <Form form={form} onFinish={handleVerifyOTP} layout="vertical" size="large">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <SafetyOutlined style={{ fontSize: 40, color: '#7c3aed', marginBottom: 12 }} />
            <Text style={{ display: 'block', color: '#64748b' }}>
              OTP sent to <strong style={{ color: '#0f172a' }}>{phone}</strong>
            </Text>
            <Button type="link" onClick={() => setCurrentStep(0)} style={{ padding: 0, marginTop: 4, color: '#7c3aed' }}>
              Change number
            </Button>
          </div>

          <Form.Item
            name="otp"
            rules={[
              { required: true, message: 'Please enter the OTP' },
              { len: 6, message: 'OTP must be 6 digits' },
            ]}
            style={{ display: 'flex', justifyContent: 'center' }}
          >
            <Input.OTP length={6} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontWeight: 600 }}>
              Verify & Signup
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button type="link" onClick={() => handleSendOTP({ phone })} loading={loading} style={{ color: '#7c3aed' }}>
              Resend OTP
            </Button>
          </div>
        </Form>
      )}
    </Card>
  );
}
