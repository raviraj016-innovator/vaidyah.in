'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  App,
  Card,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Button,
  Typography,
  Space,
  List,
  Avatar,
  Divider,
  Row,
  Col,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  UserOutlined,
  IdcardOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, PatientInfo } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';

// ---------------------------------------------------------------------------
// Mock recent patients
// ---------------------------------------------------------------------------

const MOCK_RECENT_PATIENTS: (PatientInfo & { lastVisit: string })[] = [
  {
    id: 'p-001',
    name: 'Priya Sharma',
    age: 32,
    gender: 'Female',
    phone: '9876543210',
    bloodGroup: 'A+',
    allergies: ['Penicillin'],
    chronicConditions: ['Asthma'],
    lastVisit: '2026-02-28',
  },
  {
    id: 'p-002',
    name: 'Ram Kumar',
    age: 65,
    gender: 'Male',
    phone: '9876543211',
    bloodGroup: 'O+',
    allergies: [],
    chronicConditions: ['Hypertension', 'Type 2 Diabetes'],
    lastVisit: '2026-02-27',
  },
  {
    id: 'p-003',
    name: 'Anita Devi',
    age: 45,
    gender: 'Female',
    phone: '9876543212',
    bloodGroup: 'B+',
    allergies: ['Sulfa drugs'],
    chronicConditions: [],
    lastVisit: '2026-02-25',
  },
  {
    id: 'p-004',
    name: 'Suresh Patel',
    age: 28,
    gender: 'Male',
    phone: '9876543213',
    abdmId: '12-3456-7890-1234',
    bloodGroup: 'AB+',
    allergies: [],
    chronicConditions: [],
    lastVisit: '2026-02-24',
  },
  {
    id: 'p-005',
    name: 'Meena Kumari',
    age: 55,
    gender: 'Female',
    phone: '9876543214',
    bloodGroup: 'O-',
    allergies: ['NSAIDs'],
    chronicConditions: ['Rheumatoid Arthritis'],
    lastVisit: '2026-02-20',
  },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const COMMON_ALLERGIES = [
  'Penicillin',
  'Sulfa drugs',
  'NSAIDs',
  'Aspirin',
  'Latex',
  'Peanuts',
  'Shellfish',
  'Iodine',
];

const COMMON_CONDITIONS = [
  'Hypertension',
  'Type 2 Diabetes',
  'Type 1 Diabetes',
  'Asthma',
  'COPD',
  'Heart Disease',
  'Thyroid',
  'Arthritis',
  'Depression',
  'Epilepsy',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientIntakePage() {
  const router = useRouter();
  const { language } = useTranslation();
  const { message } = App.useApp();
  const startSession = useSessionStore((s) => s.startSession);

  const [form] = Form.useForm();
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<PatientInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ABDM lookup mock
  const handleAbdmLookup = useCallback(
    (value: string) => {
      if (!value.trim()) {
        message.warning(
          language === 'hi'
            ? 'कृपया ABDM Health ID दर्ज करें'
            : 'Please enter an ABDM Health ID',
        );
        return;
      }
      setLookupLoading(true);
      // Simulate API call
      setTimeout(() => {
        if (value === '12-3456-7890-1234') {
          const found = MOCK_RECENT_PATIENTS[3];
          setLookupResult(found);
          form.setFieldsValue({
            name: found.name,
            age: found.age,
            gender: found.gender,
            phone: found.phone,
            bloodGroup: found.bloodGroup,
            allergies: found.allergies,
            chronicConditions: found.chronicConditions,
          });
          message.success(
            language === 'hi' ? 'रोगी मिला!' : 'Patient found!',
          );
        } else {
          setLookupResult(null);
          message.info(
            language === 'hi'
              ? 'कोई रिकॉर्ड नहीं मिला। कृपया मैन्युअल रूप से दर्ज करें।'
              : 'No record found. Please enter details manually.',
          );
        }
        setLookupLoading(false);
      }, 1200);
    },
    [form, language, message],
  );

  // Select recent patient
  const handleSelectRecent = useCallback(
    (patient: PatientInfo & { lastVisit: string }) => {
      form.setFieldsValue({
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        bloodGroup: patient.bloodGroup,
        allergies: patient.allergies ?? [],
        chronicConditions: patient.chronicConditions ?? [],
      });
      message.info(
        language === 'hi'
          ? `${patient.name} का डेटा भरा गया`
          : `Filled data for ${patient.name}`,
      );
    },
    [form, language, message],
  );

  // Submit form
  const handleSubmit = useCallback(
    (values: Record<string, unknown>) => {
      setSubmitting(true);

      const patient: PatientInfo = {
        name: values.name as string,
        age: values.age as number,
        gender: values.gender as string,
        phone: values.phone as string | undefined,
        abdmId: values.abdmId as string | undefined,
        bloodGroup: values.bloodGroup as string | undefined,
        allergies: values.allergies as string[] | undefined,
        chronicConditions: values.chronicConditions as string[] | undefined,
      };

      // Start the session — returns the generated sessionId directly
      const newSessionId = startSession(patient);

      setSubmitting(false);
      router.push(`/nurse/vitals-entry/${newSessionId}`);
    },
    [router, startSession],
  );

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'रोगी पंजीकरण' : 'Patient Intake'}
        subtitle={
          language === 'hi'
            ? 'नया रोगी पंजीकृत करें या मौजूदा रोगी खोजें'
            : 'Register a new patient or look up existing records'
        }
      />

      <Row gutter={[24, 24]}>
        {/* Left Column: ABDM Lookup + Manual Form */}
        <Col xs={24} lg={16}>
          {/* Section 1: ABDM Health ID Lookup */}
          <Card
            title={
              <Space>
                <IdcardOutlined />
                {language === 'hi' ? 'ABDM स्वास्थ्य ID खोजें' : 'ABDM Health ID Lookup'}
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Input.Search
              placeholder={
                language === 'hi'
                  ? 'ABDM Health ID दर्ज करें (उदा. 12-3456-7890-1234)'
                  : 'Enter ABDM Health ID (e.g. 12-3456-7890-1234)'
              }
              enterButton={
                <Button type="primary" icon={<SearchOutlined />} loading={lookupLoading}>
                  {language === 'hi' ? 'खोजें' : 'Lookup'}
                </Button>
              }
              size="large"
              onSearch={handleAbdmLookup}
              loading={lookupLoading}
            />
            {lookupResult && (
              <div style={{ marginTop: 12 }}>
                <Typography.Text type="success">
                  {language === 'hi'
                    ? `रिकॉर्ड मिला: ${lookupResult.name}`
                    : `Record found: ${lookupResult.name}`}
                </Typography.Text>
              </div>
            )}
          </Card>

          {/* Section 2: Manual Entry Form */}
          <Card
            title={
              <Space>
                <UserAddOutlined />
                {language === 'hi' ? 'रोगी विवरण' : 'Patient Details'}
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              requiredMark="optional"
              size="large"
            >
              <Row gutter={16}>
                <Col xs={24} sm={16}>
                  <Form.Item
                    name="name"
                    label={language === 'hi' ? 'पूरा नाम' : 'Full Name'}
                    rules={[
                      {
                        required: true,
                        message:
                          language === 'hi' ? 'नाम आवश्यक है' : 'Name is required',
                      },
                    ]}
                  >
                    <Input
                      placeholder={
                        language === 'hi' ? 'रोगी का नाम' : 'Patient name'
                      }
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={4}>
                  <Form.Item
                    name="age"
                    label={language === 'hi' ? 'उम्र' : 'Age'}
                    rules={[
                      {
                        required: true,
                        message:
                          language === 'hi' ? 'उम्र आवश्यक है' : 'Age is required',
                      },
                    ]}
                  >
                    <InputNumber
                      placeholder="25"
                      min={0}
                      max={130}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={4}>
                  <Form.Item
                    name="gender"
                    label={language === 'hi' ? 'लिंग' : 'Gender'}
                    rules={[
                      {
                        required: true,
                        message:
                          language === 'hi' ? 'लिंग आवश्यक है' : 'Gender is required',
                      },
                    ]}
                  >
                    <Radio.Group>
                      <Radio.Button value="Male">
                        {language === 'hi' ? 'पुरुष' : 'M'}
                      </Radio.Button>
                      <Radio.Button value="Female">
                        {language === 'hi' ? 'महिला' : 'F'}
                      </Radio.Button>
                      <Radio.Button value="Other">
                        {language === 'hi' ? 'अन्य' : 'O'}
                      </Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="phone"
                    label={language === 'hi' ? 'फ़ोन नंबर' : 'Phone Number'}
                  >
                    <Input
                      placeholder="9876543210"
                      maxLength={10}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="bloodGroup"
                    label={language === 'hi' ? 'रक्त समूह' : 'Blood Group'}
                  >
                    <Select
                      placeholder={
                        language === 'hi' ? 'रक्त समूह चुनें' : 'Select blood group'
                      }
                      allowClear
                      options={BLOOD_GROUPS.map((bg) => ({
                        label: bg,
                        value: bg,
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="allergies"
                label={language === 'hi' ? 'एलर्जी' : 'Allergies'}
              >
                <Select
                  mode="tags"
                  placeholder={
                    language === 'hi'
                      ? 'एलर्जी जोड़ें या टाइप करें'
                      : 'Add or type allergies'
                  }
                  options={COMMON_ALLERGIES.map((a) => ({
                    label: a,
                    value: a,
                  }))}
                />
              </Form.Item>

              <Form.Item
                name="chronicConditions"
                label={
                  language === 'hi' ? 'पुरानी बीमारियाँ' : 'Chronic Conditions'
                }
              >
                <Select
                  mode="tags"
                  placeholder={
                    language === 'hi'
                      ? 'बीमारी जोड़ें या टाइप करें'
                      : 'Add or type conditions'
                  }
                  options={COMMON_CONDITIONS.map((c) => ({
                    label: c,
                    value: c,
                  }))}
                />
              </Form.Item>

              <Divider />

              <Form.Item>
                <Space size="middle" wrap>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                    size="large"
                    icon={<UserAddOutlined />}
                  >
                    {language === 'hi'
                      ? 'सत्र शुरू करें'
                      : 'Start Session'}
                  </Button>
                  <Button
                    onClick={() => router.push('/nurse/dashboard')}
                    size="large"
                  >
                    {language === 'hi' ? 'रद्द करें' : 'Cancel'}
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        {/* Right Column: Recent Patients */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <UserOutlined />
                {language === 'hi' ? 'हाल के रोगी' : 'Recent Patients'}
              </Space>
            }
          >
            <List
              dataSource={MOCK_RECENT_PATIENTS}
              renderItem={(patient) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '12px 0' }}
                  onClick={() => handleSelectRecent(patient)}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        style={{
                          backgroundColor:
                            patient.gender === 'Male' ? '#bfdbfe' : '#fce7f3',
                          color:
                            patient.gender === 'Male' ? '#2563eb' : '#db2777',
                        }}
                      >
                        {patient.name.charAt(0)}
                      </Avatar>
                    }
                    title={
                      <Typography.Text strong style={{ fontSize: 14 }}>
                        {patient.name}
                      </Typography.Text>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {language === 'hi' ? 'उम्र' : 'Age'}: {patient.age} &bull;{' '}
                          {patient.gender}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {language === 'hi' ? 'अंतिम भेंट' : 'Last visit'}:{' '}
                          {new Date(patient.lastVisit).toLocaleDateString(
                            language === 'hi' ? 'hi-IN' : 'en-IN',
                          )}
                        </Typography.Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      language === 'hi'
                        ? 'कोई हाल का रोगी नहीं'
                        : 'No recent patients'
                    }
                  />
                ),
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
