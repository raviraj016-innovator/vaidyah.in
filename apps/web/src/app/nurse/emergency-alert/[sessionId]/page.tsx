'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  App,
  Card,
  Typography,
  Space,
  Button,
  Descriptions,
  Timeline,
  Tag,
  Divider,
  Row,
  Col,
} from 'antd';
import {
  PhoneOutlined,
  AlertOutlined,
  MedicineBoxOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';

// ---------------------------------------------------------------------------
// Mock emergency data
// ---------------------------------------------------------------------------

const MOCK_EMERGENCY = {
  patientName: 'Ram Kumar',
  age: 65,
  gender: 'Male',
  phone: '9876543211',
  emergencyType: 'Critical Vitals',
  emergencyTypeHi: 'गंभीर वाइटल्स',
  description:
    'Severe hypertension detected. BP reading 180/110 mmHg with complaints of headache and blurred vision.',
  descriptionHi:
    'गंभीर उच्च रक्तचाप का पता चला। BP 180/110 mmHg सिरदर्द और धुंधली दृष्टि की शिकायत के साथ।',
  vitals: {
    bp: '180/110 mmHg',
    heartRate: '98 bpm',
    temperature: '99.2\u00b0F',
    spO2: '94%',
  },
  timeline: [
    {
      time: new Date(Date.now() - 600000).toISOString(),
      event: 'Emergency detected during vitals recording',
      eventHi: 'वाइटल्स रिकॉर्डिंग के दौरान आपातकाल का पता चला',
      status: 'completed' as const,
    },
    {
      time: new Date(Date.now() - 540000).toISOString(),
      event: 'Auto-alert sent to Medical Officer',
      eventHi: 'चिकित्सा अधिकारी को ऑटो-अलर्ट भेजा गया',
      status: 'completed' as const,
    },
    {
      time: new Date(Date.now() - 300000).toISOString(),
      event: 'Patient stabilized and monitored',
      eventHi: 'रोगी को स्थिर किया गया और निगरानी की गई',
      status: 'completed' as const,
    },
    {
      time: new Date().toISOString(),
      event: 'Awaiting Medical Officer response',
      eventHi: 'चिकित्सा अधिकारी की प्रतिक्रिया की प्रतीक्षा',
      status: 'pending' as const,
    },
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmergencyAlertPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? (params.sessionId[0] ?? '') : (params.sessionId ?? '');
  const { language } = useTranslation();
  const { message } = App.useApp();

  const patient = useSessionStore((s) => s.patient);

  const [ambulanceRequested, setAmbulanceRequested] = useState(false);
  const [moContacted, setMoContacted] = useState(false);

  const emergency = MOCK_EMERGENCY;
  const patientName = patient?.name ?? emergency.patientName;

  const handleRequestAmbulance = () => {
    setAmbulanceRequested(true);
    message.success(
      language === 'hi'
        ? 'एम्बुलेंस अनुरोध भेजा गया'
        : 'Ambulance request sent',
    );
  };

  const handleContactMO = () => {
    setMoContacted(true);
    message.success(
      language === 'hi'
        ? 'चिकित्सा अधिकारी को सूचित किया गया'
        : 'Medical Officer notified',
    );
  };

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'आपातकालीन अलर्ट' : 'Emergency Alert'}
        subtitle={`${language === 'hi' ? 'सत्र' : 'Session'}: ${sessionId}`}
      />

      {/* Emergency Banner */}
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          border: '2px solid #dc2626',
        }}
        className="emergency-banner"
        styles={{ body: { padding: '24px 32px' } }}
      >
        <Space direction="vertical" size={8}>
          <Space>
            <AlertOutlined style={{ fontSize: 28, color: '#fff' }} />
            <Typography.Title level={3} style={{ color: '#fff', margin: 0 }}>
              {language === 'hi' ? 'आपातकालीन अलर्ट' : 'EMERGENCY ALERT'}
            </Typography.Title>
          </Space>
          <Tag
            color="yellow"
            style={{ fontSize: 14, padding: '4px 16px', fontWeight: 600 }}
          >
            {language === 'hi'
              ? emergency.emergencyTypeHi
              : emergency.emergencyType}
          </Tag>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15 }}>
            {language === 'hi'
              ? emergency.descriptionHi
              : emergency.description}
          </Typography.Text>
        </Space>
      </Card>

      <Row gutter={[24, 24]}>
        {/* Left: Patient Info + Vitals */}
        <Col xs={24} lg={14}>
          {/* Patient Info */}
          <Card
            title={
              <Space>
                <UserOutlined />
                {language === 'hi' ? 'रोगी की जानकारी' : 'Patient Information'}
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label={language === 'hi' ? 'नाम' : 'Name'}>
                <Typography.Text strong>{patientName}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
                {patient?.age ?? emergency.age}{' '}
                {language === 'hi' ? 'वर्ष' : 'years'}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'लिंग' : 'Gender'}>
                {patient?.gender ?? emergency.gender}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'फ़ोन' : 'Phone'}>
                {patient?.phone ?? emergency.phone}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0' }} />

            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              {language === 'hi' ? 'वर्तमान वाइटल्स' : 'Current Vitals'}
            </Typography.Text>
            <Row gutter={[16, 8]}>
              <Col xs={12} sm={12}>
                <Card
                  size="small"
                  style={{
                    background: '#fef2f2',
                    borderColor: '#fecaca',
                  }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Blood Pressure
                  </Typography.Text>
                  <br />
                  <Typography.Text strong style={{ fontSize: 18, color: '#dc2626' }}>
                    {emergency.vitals.bp}
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={12} sm={12}>
                <Card size="small">
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Heart Rate
                  </Typography.Text>
                  <br />
                  <Typography.Text strong style={{ fontSize: 18 }}>
                    {emergency.vitals.heartRate}
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={12} sm={12}>
                <Card size="small">
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    Temperature
                  </Typography.Text>
                  <br />
                  <Typography.Text strong style={{ fontSize: 18 }}>
                    {emergency.vitals.temperature}
                  </Typography.Text>
                </Card>
              </Col>
              <Col xs={12} sm={12}>
                <Card
                  size="small"
                  style={{
                    background: '#fffbeb',
                    borderColor: '#fde68a',
                  }}
                >
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    SpO2
                  </Typography.Text>
                  <br />
                  <Typography.Text strong style={{ fontSize: 18, color: '#d97706' }}>
                    {emergency.vitals.spO2}
                  </Typography.Text>
                </Card>
              </Col>
            </Row>
          </Card>

          {/* Call 108 */}
          <Card style={{ marginBottom: 16, textAlign: 'center' }}>
            <a href="tel:108">
              <Button
                type="primary"
                danger
                size="large"
                icon={<PhoneOutlined />}
                style={{
                  height: 64,
                  fontSize: 20,
                  fontWeight: 700,
                  minWidth: 200,
                  width: '100%',
                  maxWidth: 320,
                  borderRadius: 12,
                }}
              >
                {language === 'hi' ? '108 पर कॉल करें' : 'Call 108'}
              </Button>
            </a>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginTop: 8, fontSize: 13 }}
            >
              {language === 'hi'
                ? 'राष्ट्रीय एम्बुलेंस सेवा'
                : 'National Ambulance Service'}
            </Typography.Text>
          </Card>
        </Col>

        {/* Right: Escalation + Timeline */}
        <Col xs={24} lg={10}>
          {/* Escalation Options */}
          <Card
            title={
              language === 'hi' ? 'एस्केलेशन विकल्प' : 'Escalation Options'
            }
            style={{ marginBottom: 16 }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Button
                type="primary"
                icon={<MedicineBoxOutlined />}
                size="large"
                block
                onClick={handleContactMO}
                disabled={moContacted}
                style={
                  moContacted
                    ? {}
                    : { background: '#7c3aed', borderColor: '#7c3aed' }
                }
              >
                {moContacted
                  ? language === 'hi'
                    ? 'चिकित्सा अधिकारी को सूचित किया गया'
                    : 'Medical Officer Notified'
                  : language === 'hi'
                    ? 'चिकित्सा अधिकारी से संपर्क करें'
                    : 'Contact Medical Officer'}
              </Button>

              <Button
                type="default"
                icon={<CarOutlined />}
                size="large"
                block
                onClick={handleRequestAmbulance}
                disabled={ambulanceRequested}
                danger={!ambulanceRequested}
              >
                {ambulanceRequested
                  ? language === 'hi'
                    ? 'एम्बुलेंस अनुरोध भेजा गया'
                    : 'Ambulance Requested'
                  : language === 'hi'
                    ? 'एम्बुलेंस अनुरोध करें'
                    : 'Request Ambulance'}
              </Button>
            </Space>
          </Card>

          {/* Status Timeline */}
          <Card
            title={
              language === 'hi' ? 'अलर्ट समयरेखा' : 'Alert Timeline'
            }
          >
            <Timeline
              items={emergency.timeline.map((item) => ({
                color:
                  item.status === 'completed'
                    ? 'green'
                    : 'blue',
                dot:
                  item.status === 'completed' ? (
                    <CheckCircleOutlined style={{ fontSize: 14 }} />
                  ) : (
                    <ClockCircleOutlined style={{ fontSize: 14 }} />
                  ),
                children: (
                  <div>
                    <Typography.Text style={{ fontSize: 13 }}>
                      {language === 'hi' ? item.eventHi : item.event}
                    </Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(item.time).toLocaleTimeString(
                        language === 'hi' ? 'hi-IN' : 'en-IN',
                        { hour: '2-digit', minute: '2-digit' },
                      )}
                    </Typography.Text>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>

      {/* Bottom Action */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Button onClick={() => router.push('/nurse/dashboard')}>
            {language === 'hi' ? 'डैशबोर्ड पर वापस' : 'Back to Dashboard'}
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => {
              message.success(
                language === 'hi'
                  ? 'आपातकाल स्थिति अपडेट किया गया'
                  : 'Emergency status updated',
              );
              router.push('/nurse/dashboard');
            }}
          >
            {language === 'hi' ? 'स्थिति अपडेट करें' : 'Update Status'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
