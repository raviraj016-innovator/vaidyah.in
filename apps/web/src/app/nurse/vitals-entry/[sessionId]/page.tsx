'use client';

import { useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { App, Card, Typography, Descriptions, Tag, Space, Empty, Form } from 'antd';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, VitalsData } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';
import { VitalsForm } from '@/components/forms/vitals-form';
import VoiceVitalsInput from '@/components/voice-bot/VoiceVitalsInput';
import api from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

export default function VitalsEntryPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? (params.sessionId[0] ?? '') : (params.sessionId ?? '');
  const { language } = useTranslation();

  const { message } = App.useApp();
  const patient = useSessionStore((s) => s.patient);
  const setVitals = useSessionStore((s) => s.setVitals);
  const submitVitals = useSessionStore((s) => s.submitVitals);

  // Shared form instance so voice input can auto-fill the form
  const [form] = Form.useForm<VitalsData>();

  const handleVitalsDetected = useCallback(
    (detected: Partial<VitalsData>) => {
      form.setFieldsValue(detected);
    },
    [form],
  );

  const handleSubmit = useCallback(
    async (values: VitalsData) => {
      // POST vitals to backend first, then update store on success
      try {
        await api.post(endpoints.sessions.vitals(sessionId), {
          heartRate: values.heartRate,
          systolicBp: values.systolic,
          diastolicBp: values.diastolic,
          temperature: values.temperature,
          spO2: values.spO2,
          respiratoryRate: values.respiratoryRate,
          bloodGlucose: values.bloodGlucose,
          weight: values.weight,
          height: values.height,
          painScore: values.painScore,
        });

        setVitals(values);
        submitVitals();

        message.success(
          language === 'hi'
            ? 'वाइटल्स सफलतापूर्वक दर्ज किए गए'
            : 'Vitals recorded successfully',
        );
        router.push(`/nurse/triage-result/${sessionId}`);
      } catch (err) {
        console.error('Failed to save vitals to backend:', err);
        message.error(
          language === 'hi'
            ? 'वाइटल्स सहेजने में विफल। कृपया पुनः प्रयास करें।'
            : 'Failed to save vitals. Please try again.',
        );
      }
    },
    [setVitals, submitVitals, router, sessionId, language],
  );

  const handleCancel = useCallback(() => {
    router.push('/nurse/dashboard');
  }, [router]);

  // No active session guard
  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty
          description={
            language === 'hi'
              ? 'कोई सक्रिय सत्र नहीं। कृपया पहले रोगी पंजीकरण करें।'
              : 'No active session. Please register a patient first.'
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
        title={language === 'hi' ? 'वाइटल्स दर्ज करें' : 'Record Vitals'}
        subtitle={
          language === 'hi'
            ? `सत्र: ${sessionId}`
            : `Session: ${sessionId}`
        }
      />

      {/* Patient Info Summary */}
      <Card style={{ marginBottom: 24 }}>
        <Descriptions
          column={{ xs: 1, sm: 2, md: 4 }}
          size="small"
          title={
            <Space>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {patient.name}
              </Typography.Text>
              {patient.bloodGroup && (
                <Tag color="red">{patient.bloodGroup}</Tag>
              )}
            </Space>
          }
        >
          <Descriptions.Item label={language === 'hi' ? 'उम्र' : 'Age'}>
            {patient.age} {language === 'hi' ? 'वर्ष' : 'years'}
          </Descriptions.Item>
          <Descriptions.Item label={language === 'hi' ? 'लिंग' : 'Gender'}>
            {patient.gender}
          </Descriptions.Item>
          <Descriptions.Item label={language === 'hi' ? 'फ़ोन' : 'Phone'}>
            {patient.phone || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={language === 'hi' ? 'एलर्जी' : 'Allergies'}>
            {patient.allergies && patient.allergies.length > 0 ? (
              <Space wrap>
                {patient.allergies.map((a) => (
                  <Tag key={a} color="orange">
                    {a}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Typography.Text type="secondary">
                {language === 'hi' ? 'कोई नहीं' : 'None'}
              </Typography.Text>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Voice Vitals — primary input (hands-free) */}
      <VoiceVitalsInput
        onVitalsDetected={handleVitalsDetected}
        language={language === 'hi' ? 'hi' : 'en'}
      />

      {/* Vitals Form — secondary/manual input, auto-filled by voice */}
      <Card
        title={
          language === 'hi' ? 'वाइटल साइन्स' : 'Vital Signs'
        }
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {language === 'hi'
              ? 'वॉइस से भरा गया — नीचे सत्यापित करें'
              : 'Auto-filled by voice — verify below'}
          </Typography.Text>
        }
      >
        <VitalsForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          externalForm={form}
        />
      </Card>
    </div>
  );
}
