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
  DatePicker,
  Space,
  Tag,
  App,
} from 'antd';
import {
  UserOutlined,
  EnvironmentOutlined,
  MedicineBoxOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { authApi } from '@/lib/api/client';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const COMMON_CONDITIONS = [
  'Diabetes', 'Hypertension', 'Asthma', 'Heart Disease', 'Thyroid',
  'Arthritis', 'Cancer', 'Kidney Disease', 'Liver Disease', 'COPD',
];

const COMMON_ALLERGIES = [
  'Penicillin', 'Aspirin', 'Ibuprofen', 'Peanuts', 'Shellfish',
  'Latex', 'Pollen', 'Dust', 'Pet Dander', 'Sulfa Drugs',
];

export default function PatientOnboardingPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [personalForm] = Form.useForm();
  const [locationForm] = Form.useForm();
  const [medicalForm] = Form.useForm();

  const [personalInfo, setPersonalInfo] = useState<any>(null);
  const [locationInfo, setLocationInfo] = useState<any>(null);

  const handlePersonalInfo = async (values: any) => {
    setPersonalInfo(values);
    setCurrentStep(1);
  };

  const handleLocationInfo = async (values: any) => {
    setLocationInfo(values);
    setCurrentStep(2);
  };

  const goBackToStep = (step: number) => {
    setCurrentStep(step);
    if (step === 0 && personalInfo) {
      setTimeout(() => personalForm.setFieldsValue(personalInfo), 0);
    } else if (step === 1 && locationInfo) {
      setTimeout(() => locationForm.setFieldsValue(locationInfo), 0);
    }
  };

  const handleMedicalInfo = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...personalInfo,
        ...locationInfo,
        ...values,
        dateOfBirth: personalInfo?.dateOfBirth?.format('YYYY-MM-DD'),
      };

      await authApi.patch('/me/profile', payload);

      message.success('Profile completed successfully!');

      setTimeout(() => {
        router.push('/patient/home');
      }, 1000);
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Failed to complete profile');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { title: 'Personal', icon: <UserOutlined /> },
    { title: 'Location', icon: <EnvironmentOutlined /> },
    { title: 'Medical', icon: <MedicineBoxOutlined /> },
  ];

  return (
    <Card
      style={{ width: '100%', maxWidth: 600, borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
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
          Complete Your Profile
        </Title>
        <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
          Help us provide you with personalized healthcare
        </Text>
      </div>

      <Steps current={currentStep} items={steps} style={{ marginBottom: 32 }} size="small" />

      {currentStep === 0 && (
        <Form form={personalForm} onFinish={handlePersonalInfo} layout="vertical" size="large">
          <Form.Item
            name="name"
            label="Full Name"
            rules={[{ required: true, message: 'Please enter your full name' }]}
          >
            <Input placeholder="Enter your full name" />
          </Form.Item>

          <Form.Item
            name="dateOfBirth"
            label="Date of Birth"
            rules={[{ required: true, message: 'Please select your date of birth' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder="Select date of birth"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
              format="DD/MM/YYYY"
            />
          </Form.Item>

          <Form.Item
            name="gender"
            label="Gender"
            rules={[{ required: true, message: 'Please select your gender' }]}
          >
            <Select placeholder="Select gender">
              <Select.Option value="male">Male</Select.Option>
              <Select.Option value="female">Female</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="abdmId" label="ABDM Health ID (Optional)">
            <Input placeholder="Enter your ABDM Health ID" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block style={{ height: 46, fontWeight: 600 }}>
              Next
            </Button>
          </Form.Item>
        </Form>
      )}

      {currentStep === 1 && (
        <Form form={locationForm} onFinish={handleLocationInfo} layout="vertical" size="large">
          <Form.Item
            name="address"
            label="Address"
            rules={[{ required: true, message: 'Please enter your address' }]}
          >
            <Input.TextArea rows={3} placeholder="Enter your complete address" />
          </Form.Item>

          <Space style={{ width: '100%' }} size="middle">
            <Form.Item
              name="district"
              label="District"
              rules={[{ required: true, message: 'Required' }]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input placeholder="District" />
            </Form.Item>

            <Form.Item
              name="pincode"
              label="Pincode"
              rules={[
                { required: true, message: 'Required' },
                { pattern: /^[1-9][0-9]{5}$/, message: 'Invalid pincode' },
              ]}
              style={{ flex: 1, marginBottom: 0 }}
            >
              <Input placeholder="Pincode" maxLength={6} />
            </Form.Item>
          </Space>

          <Form.Item
            name="state"
            label="State"
            rules={[{ required: true, message: 'Please select your state' }]}
            style={{ marginTop: 24 }}
          >
            <Select placeholder="Select state" showSearch>
              {INDIAN_STATES.map((state) => (
                <Select.Option key={state} value={state}>
                  {state}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Space style={{ width: '100%', marginTop: 16 }}>
            <Button onClick={() => goBackToStep(0)} style={{ flex: 1 }}>
              Back
            </Button>
            <Button type="primary" htmlType="submit" style={{ flex: 1, height: 46, fontWeight: 600 }}>
              Next
            </Button>
          </Space>
        </Form>
      )}

      {currentStep === 2 && (
        <Form form={medicalForm} onFinish={handleMedicalInfo} layout="vertical" size="large">
          <Form.Item name="conditions" label="Medical Conditions (if any)">
            <Select
              mode="tags"
              placeholder="Select or type conditions"
              style={{ width: '100%' }}
            >
              {COMMON_CONDITIONS.map((condition) => (
                <Select.Option key={condition} value={condition}>
                  {condition}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="medications" label="Current Medications (if any)">
            <Select
              mode="tags"
              placeholder="Enter medications"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item name="allergies" label="Allergies (if any)">
            <Select
              mode="tags"
              placeholder="Select or type allergies"
              style={{ width: '100%' }}
            >
              {COMMON_ALLERGIES.map((allergy) => (
                <Select.Option key={allergy} value={allergy}>
                  {allergy}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="familyHistory" label="Family Medical History (if any)">
            <Input.TextArea rows={3} placeholder="Enter relevant family medical history" />
          </Form.Item>

          <Space style={{ width: '100%', marginTop: 16 }}>
            <Button onClick={() => goBackToStep(1)} style={{ flex: 1 }}>
              Back
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<CheckCircleOutlined />}
              style={{ flex: 1, height: 46, fontWeight: 600 }}
            >
              Complete
            </Button>
          </Space>
        </Form>
      )}
    </Card>
  );
}
