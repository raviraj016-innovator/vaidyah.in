'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  App,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  List,
  Timeline,
  Select,
  Button,
  Descriptions,
  Empty,
  Divider,
} from 'antd';
import {
  AudioOutlined,
  AudioMutedOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  MedicineBoxOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, TranscriptEntry } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';

// ---------------------------------------------------------------------------
// Symptom taxonomy for manual entry
// ---------------------------------------------------------------------------

const SYMPTOM_OPTIONS = [
  { value: 'fever', label: 'Fever', labelHi: 'बुखार' },
  { value: 'headache', label: 'Headache', labelHi: 'सिरदर्द' },
  { value: 'cough', label: 'Cough', labelHi: 'खांसी' },
  { value: 'body_pain', label: 'Body Pain', labelHi: 'शरीर दर्द' },
  { value: 'fatigue', label: 'Fatigue', labelHi: 'थकान' },
  { value: 'nausea', label: 'Nausea', labelHi: 'मतली' },
  { value: 'vomiting', label: 'Vomiting', labelHi: 'उल्टी' },
  { value: 'diarrhea', label: 'Diarrhea', labelHi: 'दस्त' },
  { value: 'chest_pain', label: 'Chest Pain', labelHi: 'छाती में दर्द' },
  { value: 'breathlessness', label: 'Breathlessness', labelHi: 'सांस फूलना' },
  { value: 'abdominal_pain', label: 'Abdominal Pain', labelHi: 'पेट दर्द' },
  { value: 'dizziness', label: 'Dizziness', labelHi: 'चक्कर आना' },
  { value: 'sore_throat', label: 'Sore Throat', labelHi: 'गले में दर्द' },
  { value: 'joint_pain', label: 'Joint Pain', labelHi: 'जोड़ों में दर्द' },
  { value: 'rash', label: 'Rash', labelHi: 'दाने' },
];

const SEVERITY_COLORS: Record<string, string> = {
  mild: 'green',
  moderate: 'orange',
  severe: 'red',
};

// ---------------------------------------------------------------------------
// Mock transcript data
// ---------------------------------------------------------------------------

const MOCK_TRANSCRIPT: TranscriptEntry[] = [
  {
    id: 't-001',
    speaker: 'nurse',
    text: 'Hello, please tell me what brings you here today.',
    textHi: 'नमस्ते, कृपया बताएं आज आप यहाँ क्यों आए हैं।',
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 't-002',
    speaker: 'patient',
    text: 'I have been having a high fever for the last 3 days with body aches.',
    textHi: 'मुझे पिछले 3 दिनों से तेज़ बुखार और शरीर में दर्द हो रहा है।',
    timestamp: new Date(Date.now() - 280000).toISOString(),
    emotions: { anxiety: 0.6, sadness: 0.3 },
  },
  {
    id: 't-003',
    speaker: 'nurse',
    text: 'I see. Have you taken any medication for the fever?',
    textHi: 'मैं समझी। क्या आपने बुखार के लिए कोई दवा ली है?',
    timestamp: new Date(Date.now() - 260000).toISOString(),
  },
  {
    id: 't-004',
    speaker: 'patient',
    text: 'Yes, I took paracetamol but the fever keeps coming back.',
    textHi: 'हाँ, मैंने पैरासिटामोल ली लेकिन बुखार बार-बार आ रहा है।',
    timestamp: new Date(Date.now() - 240000).toISOString(),
    emotions: { anxiety: 0.7, frustration: 0.5 },
  },
  {
    id: 't-005',
    speaker: 'system',
    text: 'Detected symptoms: Fever (severe, 3 days), Body Pain (moderate)',
    textHi: 'पहचाने गए लक्षण: बुखार (गंभीर, 3 दिन), शरीर दर्द (मध्यम)',
    timestamp: new Date(Date.now() - 230000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsultationPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? (params.sessionId[0] ?? '') : (params.sessionId ?? '');
  const { language } = useTranslation();
  const { message } = App.useApp();

  const patient = useSessionStore((s) => s.patient);
  const vitals = useSessionStore((s) => s.vitals);
  const symptoms = useSessionStore((s) => s.symptoms);
  const transcript = useSessionStore((s) => s.transcript);
  const isRecording = useSessionStore((s) => s.isRecording);
  const addSymptom = useSessionStore((s) => s.addSymptom);
  const removeSymptom = useSessionStore((s) => s.removeSymptom);
  const addTranscriptEntry = useSessionStore((s) => s.addTranscriptEntry);
  const setRecording = useSessionStore((s) => s.setRecording);

  const [isPaused, setIsPaused] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);

  // Load mock transcript & symptoms on mount if store is empty
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (transcript.length === 0) {
      MOCK_TRANSCRIPT.forEach((entry) => addTranscriptEntry(entry));
    }
    if (symptoms.length === 0) {
      addSymptom({ id: 'fever', name: 'Fever', severity: 'severe', duration: '3 days' });
      addSymptom({ id: 'body_pain', name: 'Body Pain', severity: 'moderate' });
    }
  }, [transcript, symptoms, addTranscriptEntry, addSymptom]);

  const currentTranscript = transcript.length > 0 ? transcript : MOCK_TRANSCRIPT;

  const handleAddSymptom = useCallback(
    (value: string) => {
      const opt = SYMPTOM_OPTIONS.find((o) => o.value === value);
      if (!opt) return;
      if (symptoms.some((s) => s.id === value)) {
        message.warning(
          language === 'hi' ? 'लक्षण पहले से जोड़ा गया है' : 'Symptom already added',
        );
        return;
      }
      addSymptom({ id: value, name: opt.label, severity: 'moderate' });
    },
    [addSymptom, symptoms, language, message],
  );

  const handleStartRecording = () => {
    setRecording(true);
    setIsPaused(false);
    message.info(
      language === 'hi' ? 'रिकॉर्डिंग शुरू...' : 'Recording started...',
    );
  };

  const handleStopRecording = () => {
    setRecording(false);
    setIsPaused(false);
    message.info(
      language === 'hi' ? 'रिकॉर्डिंग रोकी गई' : 'Recording stopped',
    );
  };

  const handlePauseResume = () => {
    setIsPaused((prev) => !prev);
  };

  const handleRequestTriage = () => {
    setTriageLoading(true);
    const hide = message.loading(
      language === 'hi'
        ? 'ट्राइएज AI प्रोसेस कर रहा है...'
        : 'Triage AI processing...',
      0,
    );
    setTimeout(() => {
      hide();
      setTriageLoading(false);
      router.push(`/nurse/triage-result/${sessionId}`);
    }, 2000);
  };

  // No active session guard
  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty
          description={
            language === 'hi'
              ? 'कोई सक्रिय सत्र नहीं'
              : 'No active session'
          }
        />
        <div style={{ marginTop: 16 }}>
          <Typography.Link onClick={() => router.push('/nurse/patient-intake')}>
            {language === 'hi' ? 'रोगी पंजीकरण पर जाएँ' : 'Go to Patient Intake'}
          </Typography.Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'परामर्श' : 'Consultation'}
        subtitle={`${patient.name} | ${language === 'hi' ? 'सत्र' : 'Session'}: ${sessionId}`}
        extra={
          <Tag
            color={isRecording ? (isPaused ? 'orange' : 'red') : 'default'}
            style={{ fontSize: 13, padding: '4px 12px' }}
          >
            {isRecording
              ? isPaused
                ? language === 'hi'
                  ? 'रुका हुआ'
                  : 'Paused'
                : language === 'hi'
                  ? 'रिकॉर्डिंग चल रही है'
                  : 'Recording'
              : language === 'hi'
                ? 'रिकॉर्डिंग बंद'
                : 'Not Recording'}
          </Tag>
        }
      />

      <Row gutter={[16, 16]}>
        {/* Left Panel (60%) */}
        <Col xs={24} lg={14}>
          {/* Patient Info + Vitals Summary */}
          <Card style={{ marginBottom: 16 }}>
            <Descriptions
              column={{ xs: 1, sm: 2, md: 3 }}
              size="small"
              title={
                <Space>
                  <MedicineBoxOutlined />
                  <Typography.Text strong>
                    {language === 'hi' ? 'रोगी की जानकारी' : 'Patient Info'}
                  </Typography.Text>
                </Space>
              }
            >
              <Descriptions.Item label={language === 'hi' ? 'नाम' : 'Name'}>
                {patient.name}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
                {patient.age} {language === 'hi' ? 'वर्ष' : 'yrs'}, {patient.gender}
              </Descriptions.Item>
              <Descriptions.Item label="BP">
                {vitals.systolic != null && vitals.diastolic != null
                  ? `${vitals.systolic}/${vitals.diastolic} mmHg`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={language === 'hi' ? 'तापमान' : 'Temp'}>
                {vitals.temperature != null
                  ? `${vitals.temperature}${vitals.temperatureUnit === 'F' ? '\u00b0F' : '\u00b0C'}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="HR">
                {vitals.heartRate != null ? `${vitals.heartRate} bpm` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="SpO2">
                {vitals.spO2 != null ? `${vitals.spO2}%` : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Detected Symptoms */}
          <Card
            title={
              <Space>
                <AlertOutlined />
                {language === 'hi' ? 'पहचाने गए लक्षण' : 'Detected Symptoms'}
              </Space>
            }
            style={{ marginBottom: 16 }}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {symptoms.length}{' '}
                {language === 'hi' ? 'लक्षण' : 'symptoms'}
              </Typography.Text>
            }
          >
            <List
              dataSource={symptoms}
              renderItem={(symptom) => (
                <List.Item
                  actions={[
                    <Button
                      key="remove"
                      type="link"
                      danger
                      size="small"
                      onClick={() => removeSymptom(symptom.id)}
                    >
                      {language === 'hi' ? 'हटाएं' : 'Remove'}
                    </Button>,
                  ]}
                >
                  <Space>
                    <Typography.Text strong>{symptom.name}</Typography.Text>
                    <Tag color={SEVERITY_COLORS[symptom.severity] ?? 'default'}>
                      {symptom.severity}
                    </Tag>
                    {symptom.duration && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        ({symptom.duration})
                      </Typography.Text>
                    )}
                  </Space>
                </List.Item>
              )}
              locale={{
                emptyText: language === 'hi' ? 'कोई लक्षण नहीं' : 'No symptoms detected',
              }}
            />

            <Divider style={{ margin: '12px 0' }} />

            {/* Add symptom manually */}
            <Space>
              <Select
                placeholder={
                  language === 'hi' ? 'लक्षण जोड़ें' : 'Add symptom'
                }
                style={{ width: '100%', maxWidth: 220 }}
                showSearch
                optionFilterProp="label"
                options={SYMPTOM_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: language === 'hi' ? opt.labelHi : opt.label,
                }))}
                onSelect={(value) => { if (value) handleAddSymptom(value); }}
                value={undefined}
              />
            </Space>
          </Card>
        </Col>

        {/* Right Panel (40%) */}
        <Col xs={24} lg={10}>
          {/* Transcript */}
          <Card
            title={
              language === 'hi'
                ? 'बातचीत का प्रतिलेख'
                : 'Conversation Transcript'
            }
            style={{ marginBottom: 16 }}
            styles={{
              body: {
                maxHeight: 400,
                overflowY: 'auto',
              },
            }}
          >
            <Timeline
              items={currentTranscript.map((entry) => ({
                key: entry.id,
                color:
                  entry.speaker === 'nurse'
                    ? 'blue'
                    : entry.speaker === 'patient'
                      ? 'green'
                      : 'gray',
                dot:
                  entry.speaker === 'system' ? (
                    <ClockCircleOutlined style={{ fontSize: 14 }} />
                  ) : undefined,
                children: (
                  <div>
                    <Space style={{ marginBottom: 4 }}>
                      <Tag
                        color={
                          entry.speaker === 'nurse'
                            ? 'blue'
                            : entry.speaker === 'patient'
                              ? 'green'
                              : 'default'
                        }
                        style={{ fontSize: 11 }}
                      >
                        {entry.speaker === 'nurse'
                          ? language === 'hi'
                            ? 'नर्स'
                            : 'Nurse'
                          : entry.speaker === 'patient'
                            ? language === 'hi'
                              ? 'रोगी'
                              : 'Patient'
                            : language === 'hi'
                              ? 'सिस्टम'
                              : 'System'}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                        {new Date(entry.timestamp).toLocaleTimeString(
                          language === 'hi' ? 'hi-IN' : 'en-IN',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </Typography.Text>
                    </Space>
                    <Typography.Paragraph
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontStyle:
                          entry.speaker === 'system' ? 'italic' : 'normal',
                      }}
                    >
                      {language === 'hi' && entry.textHi
                        ? entry.textHi
                        : entry.text}
                    </Typography.Paragraph>
                    {entry.emotions && (
                      <Space wrap style={{ marginTop: 4 }}>
                        {Object.entries(entry.emotions).map(([emotion, score]) => (
                          <Tag
                            key={emotion}
                            style={{ fontSize: 10 }}
                            color={score > 0.5 ? 'orange' : 'default'}
                          >
                            {emotion}: {Math.round(score * 100)}%
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                ),
              }))}
            />
          </Card>

          {/* Recording Controls */}
          <Card
            title={
              language === 'hi' ? 'रिकॉर्डिंग नियंत्रण' : 'Recording Controls'
            }
          >
            <Space size="middle" wrap style={{ width: '100%', justifyContent: 'center' }}>
              {!isRecording ? (
                <Button
                  type="primary"
                  icon={<AudioOutlined />}
                  size="large"
                  onClick={handleStartRecording}
                  style={{ minWidth: 160 }}
                >
                  {language === 'hi' ? 'रिकॉर्ड शुरू करें' : 'Start Recording'}
                </Button>
              ) : (
                <>
                  <Button
                    icon={
                      isPaused ? (
                        <PlayCircleOutlined />
                      ) : (
                        <PauseCircleOutlined />
                      )
                    }
                    size="large"
                    onClick={handlePauseResume}
                  >
                    {isPaused
                      ? language === 'hi'
                        ? 'जारी रखें'
                        : 'Resume'
                      : language === 'hi'
                        ? 'रोकें'
                        : 'Pause'}
                  </Button>
                  <Button
                    danger
                    icon={<AudioMutedOutlined />}
                    size="large"
                    onClick={handleStopRecording}
                  >
                    {language === 'hi' ? 'बंद करें' : 'Stop'}
                  </Button>
                </>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Bottom Action Bar */}
      <Card style={{ marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Button
            onClick={() => router.push('/nurse/dashboard')}
          >
            {language === 'hi' ? 'डैशबोर्ड पर वापस' : 'Back to Dashboard'}
          </Button>
          <Space size="middle" wrap>
            <Button
              type="primary"
              size="large"
              loading={triageLoading}
              onClick={handleRequestTriage}
              icon={<AlertOutlined />}
              style={{ background: '#d97706', borderColor: '#d97706' }}
            >
              {language === 'hi' ? 'ट्राइएज अनुरोध करें' : 'Request Triage'}
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                if (isRecording) {
                  setRecording(false);
                }
                // Advance status so SOAP page knows consultation phase is done
                useSessionStore.getState().submitVitals();
                message.success(
                  language === 'hi'
                    ? 'परामर्श पूर्ण'
                    : 'Consultation completed',
                );
                router.push(`/nurse/soap-summary/${sessionId}`);
              }}
            >
              {language === 'hi'
                ? 'परामर्श पूर्ण करें'
                : 'Complete Consultation'}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
}
