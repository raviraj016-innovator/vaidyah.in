'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  BankOutlined,
  HeartOutlined,
  ThunderboltOutlined,
  ExperimentOutlined,
  WarningOutlined,
  FireOutlined,
  ContactsOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import api from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Emergency type options
// ---------------------------------------------------------------------------

const EMERGENCY_TYPES = [
  { value: 'cardiac', label: 'Cardiac', labelHi: 'हृदय संबंधी', icon: <HeartOutlined />, color: '#dc2626' },
  { value: 'respiratory', label: 'Respiratory', labelHi: 'श्वसन', icon: <ThunderboltOutlined />, color: '#f97316' },
  { value: 'stroke', label: 'Stroke', labelHi: 'स्ट्रोक', icon: <ExperimentOutlined />, color: '#7c3aed' },
  { value: 'trauma', label: 'Trauma', labelHi: 'आघात', icon: <WarningOutlined />, color: '#ef4444' },
  { value: 'obstetric', label: 'Obstetric', labelHi: 'प्रसूति', icon: <MedicineBoxOutlined />, color: '#ec4899' },
  { value: 'snakebite', label: 'Snakebite', labelHi: 'सर्पदंश', icon: <FireOutlined />, color: '#84cc16' },
  { value: 'critical_vitals', label: 'Critical Vitals', labelHi: 'गंभीर वाइटल्स', icon: <AlertOutlined />, color: '#dc2626' },
  { value: 'other', label: 'Other', labelHi: 'अन्य', icon: <AlertOutlined />, color: '#6b7280' },
];


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
  const storeSessionId = useSessionStore((s) => s.sessionId);

  const [ambulanceRequested, setAmbulanceRequested] = useState(false);
  const [ambulanceEta, setAmbulanceEta] = useState<string | null>(null);
  const [moContacted, setMoContacted] = useState(false);
  const [hospitalNotified, setHospitalNotified] = useState(false);
  const [selectedEmergencyType, setSelectedEmergencyType] = useState<string>('critical_vitals');

  // Fetch emergency data from API
  const { data: emergencyData } = useQuery({
    queryKey: ['nurse', 'emergency', sessionId],
    queryFn: fetchWithFallback<{ success: boolean; data: any }>(
      `/emergency/${sessionId}`,
    ),
    staleTime: 30_000,
  });

  const apiEmergency = emergencyData?.data;
  const emergency = {
    patientName: apiEmergency?.patient_name ?? patient?.name ?? '--',
    age: apiEmergency?.patient_age ?? patient?.age ?? '--',
    gender: apiEmergency?.patient_gender ?? patient?.gender ?? '--',
    phone: apiEmergency?.patient_phone ?? patient?.phone ?? '--',
    emergencyContact: apiEmergency?.emergency_contact ?? null,
    bloodGroup: apiEmergency?.blood_group ?? null,
    emergencyType: apiEmergency?.alert_type ?? 'Unknown',
    emergencyTypeHi: apiEmergency?.alert_type_hi ?? '',
    description: apiEmergency?.description ?? '',
    descriptionHi: apiEmergency?.description_hi ?? '',
    vitals: apiEmergency?.vitals
      ? {
          bp: `${apiEmergency.vitals.bp_systolic ?? '--'}/${apiEmergency.vitals.bp_diastolic ?? '--'} mmHg`,
          heartRate: `${apiEmergency.vitals.pulse ?? '--'} bpm`,
          temperature: `${apiEmergency.vitals.temperature ?? '--'}\u00b0F`,
          spO2: `${apiEmergency.vitals.spo2 ?? '--'}%`,
        }
      : { bp: '--/-- mmHg', heartRate: '-- bpm', temperature: '--\u00b0F', spO2: '--%' },
    timeline: apiEmergency?.timeline ?? [],
  };
  const patientName = patient?.name ?? emergency.patientName;

  const ambulanceMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/emergency/${sessionId}/ambulance`, {
        emergencyType: selectedEmergencyType,
      });
      return data;
    },
    onSuccess: (data) => {
      setAmbulanceRequested(true);
      if (data?.eta) setAmbulanceEta(data.eta);
      message.success(
        language === 'hi' ? 'एम्बुलेंस अनुरोध भेजा गया' : 'Ambulance request sent',
      );
    },
    onError: (err) => {
      console.error('Failed to request ambulance:', err);
      message.error(language === 'hi' ? 'एम्बुलेंस अनुरोध विफल' : 'Failed to request ambulance');
    },
  });

  const contactMoMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/emergency/${sessionId}/contact-mo`);
      return data;
    },
    onSuccess: () => {
      setMoContacted(true);
      message.success(
        language === 'hi' ? 'चिकित्सा अधिकारी को सूचित किया गया' : 'Medical Officer notified',
      );
    },
    onError: (err) => {
      console.error('Failed to contact Medical Officer:', err);
      message.error(language === 'hi' ? 'संपर्क विफल' : 'Failed to contact Medical Officer');
    },
  });

  const hospitalMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/emergency/${sessionId}/notify-hospital`, {
        emergencyType: selectedEmergencyType,
      });
      return data;
    },
    onSuccess: () => {
      setHospitalNotified(true);
      message.success(
        language === 'hi' ? 'रेफ़रल अस्पताल को सूचित किया गया' : 'Referral hospital notified',
      );
    },
    onError: (err) => {
      console.error('Failed to notify hospital:', err);
      message.error(language === 'hi' ? 'सूचना विफल' : 'Failed to notify hospital');
    },
  });

  const handleRequestAmbulance = () => ambulanceMutation.mutate();
  const handleContactMO = () => contactMoMutation.mutate();
  const handleNotifyHospital = () => hospitalMutation.mutate();

  // Session mismatch validation
  if (storeSessionId && sessionId !== 'new' && storeSessionId !== sessionId) {
    return (
      <Card style={{ marginTop: 40, textAlign: 'center' }}>
        <AlertOutlined style={{ fontSize: 48, color: '#dc2626', marginBottom: 16 }} />
        <Typography.Title level={4} style={{ color: '#dc2626' }}>
          {language === 'hi' ? 'सत्र बेमेल' : 'Session Mismatch'}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          {language === 'hi'
            ? 'यह आपातकालीन अलर्ट वर्तमान सत्र से मेल नहीं खाता। कृपया डैशबोर्ड पर वापस जाएं।'
            : 'This emergency alert does not match the current session. Please return to the dashboard.'}
        </Typography.Paragraph>
        <Button type="primary" onClick={() => router.push('/nurse/dashboard')}>
          {language === 'hi' ? 'डैशबोर्ड पर वापस' : 'Back to Dashboard'}
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'आपातकालीन अलर्ट' : 'Emergency Alert'}
        subtitle={`${language === 'hi' ? 'सत्र' : 'Session'}: ${sessionId}`}
      />

      {/* Emergency Type Selector */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle" align="center">
          <Typography.Text strong>
            {language === 'hi' ? 'आपातकाल प्रकार:' : 'Emergency Type:'}
          </Typography.Text>
          {EMERGENCY_TYPES.map((et) => (
            <Button
              key={et.value}
              type={selectedEmergencyType === et.value ? 'primary' : 'default'}
              icon={et.icon}
              onClick={() => setSelectedEmergencyType(et.value)}
              style={
                selectedEmergencyType === et.value
                  ? { background: et.color, borderColor: et.color }
                  : {}
              }
              size="middle"
            >
              {language === 'hi' ? et.labelHi : et.label}
            </Button>
          ))}
        </Space>
      </Card>

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
              ? (EMERGENCY_TYPES.find((t) => t.value === selectedEmergencyType)?.labelHi ?? emergency.emergencyTypeHi)
              : (EMERGENCY_TYPES.find((t) => t.value === selectedEmergencyType)?.label ?? emergency.emergencyType)}
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
              {emergency.bloodGroup && (
                <Descriptions.Item label={language === 'hi' ? 'रक्त समूह' : 'Blood Group'}>
                  <Tag color="red">{emergency.bloodGroup}</Tag>
                </Descriptions.Item>
              )}
              {emergency.emergencyContact && (
                <Descriptions.Item label={language === 'hi' ? 'आपातकालीन संपर्क' : 'Emergency Contact'}>
                  <Space>
                    <Typography.Text>
                      {emergency.emergencyContact.name} ({emergency.emergencyContact.relation})
                    </Typography.Text>
                  </Space>
                </Descriptions.Item>
              )}
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

              {/* Ambulance ETA Display */}
              {ambulanceRequested && ambulanceEta && (
                <Card
                  size="small"
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    textAlign: 'center',
                  }}
                >
                  <Space direction="vertical" size={4}>
                    <Space>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#16a34a',
                        animation: 'pulse 2s infinite',
                      }} />
                      <Typography.Text strong style={{ color: '#16a34a' }}>
                        {language === 'hi' ? 'एम्बुलेंस भेजी गई' : 'Ambulance Dispatched'}
                      </Typography.Text>
                    </Space>
                    <Typography.Title level={4} style={{ margin: 0, color: '#15803d' }}>
                      {language === 'hi' ? `ETA: ${ambulanceEta}` : `ETA: ${ambulanceEta}`}
                    </Typography.Title>
                  </Space>
                </Card>
              )}

              <Button
                type="default"
                icon={<BankOutlined />}
                size="large"
                block
                onClick={handleNotifyHospital}
                disabled={hospitalNotified || !ambulanceRequested}
                style={
                  !hospitalNotified && ambulanceRequested
                    ? { background: '#059669', borderColor: '#059669', color: '#fff' }
                    : {}
                }
              >
                {hospitalNotified
                  ? language === 'hi'
                    ? 'रेफ़रल अस्पताल को सूचित किया गया'
                    : 'Hospital Notified'
                  : language === 'hi'
                    ? 'रेफ़रल अस्पताल को सूचित करें'
                    : 'Notify Referral Hospital'}
              </Button>

              {emergency.emergencyContact && (
                <a href={`tel:${emergency.emergencyContact.phone}`} style={{ display: 'block' }}>
                  <Button
                    icon={<ContactsOutlined />}
                    size="large"
                    block
                    style={{ background: '#2563eb', borderColor: '#2563eb', color: '#fff' }}
                  >
                    {language === 'hi'
                      ? `आपातकालीन संपर्क: ${emergency.emergencyContact.name}`
                      : `Emergency Contact: ${emergency.emergencyContact.name}`}
                  </Button>
                </a>
              )}
            </Space>
          </Card>

          {/* Status Timeline */}
          <Card
            title={
              language === 'hi' ? 'अलर्ट समयरेखा' : 'Alert Timeline'
            }
          >
            <Timeline
              items={emergency.timeline.map((item: { status: string; label: string; time: string; event: string; eventHi?: string }) => ({
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
                      {language === 'hi' ? (item.eventHi ?? item.event) : item.event}
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
            onClick={async () => {
              try { await api.put(`/emergency/${sessionId}/status`, { status: 'resolved' }); } catch (err) { console.error('Failed to update emergency status:', err); message.error(language === 'hi' ? 'स्थिति अपडेट विफल' : 'Failed to update status'); return; }
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
