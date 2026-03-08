'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Card,
  Typography,
  Space,
  Button,
  Form,
  Input,
  Tag,
  Divider,
  Empty,
  App,
  Steps,
} from 'antd';
import {
  EditOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  PlusCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, SOAPNote, SOAPStatus } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';
import { SOAPDisplay } from '@/components/data-display/soap-display';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import api from '@/lib/api/client';

const { TextArea } = Input;


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SOAPSummaryPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? (params.sessionId[0] ?? '') : (params.sessionId ?? '');
  const { language } = useTranslation();

  const patient = useSessionStore((s) => s.patient);
  const storeSoap = useSessionStore((s) => s.soapNote);
  const setSoapNote = useSessionStore((s) => s.setSoapNote);
  const soapStatus = useSessionStore((s) => s.soapStatus);
  const setSoapStatus = useSessionStore((s) => s.setSoapStatus);
  const completeSession = useSessionStore((s) => s.completeSession);
  const { message, modal } = App.useApp();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm();

  // Fetch SOAP note from API
  const { data: apiSoapData } = useQuery({
    queryKey: ['nurse', 'soap', sessionId],
    queryFn: fetchWithFallback<{ success: boolean; data: any }>(
      `/sessions/${sessionId}/soap`,
    ),
    staleTime: 60_000,
  });

  // Apply API data to store
  useEffect(() => {
    const apiSoap = apiSoapData?.data;
    if (apiSoap && !storeSoap) {
      const parsed: SOAPNote = {
        subjective: typeof apiSoap.subjective === 'string' ? JSON.parse(apiSoap.subjective) : apiSoap.subjective,
        objective: typeof apiSoap.objective === 'string' ? JSON.parse(apiSoap.objective) : apiSoap.objective,
        assessment: typeof apiSoap.assessment === 'string' ? JSON.parse(apiSoap.assessment) : apiSoap.assessment,
        plan: typeof apiSoap.plan === 'string' ? JSON.parse(apiSoap.plan) : apiSoap.plan,
      };
      setSoapNote(parsed);
      if (apiSoap.is_reviewed) setSoapStatus('reviewed');
    }
  }, [apiSoapData, storeSoap, setSoapNote, setSoapStatus]);

  const soapNote = storeSoap;

  const saveSoapMutation = useMutation({
    mutationFn: async (updated: SOAPNote) => {
      const { data } = await api.post(`/sessions/${sessionId}/soap`, updated);
      return data;
    },
  });

  const handleSave = useCallback(
    (values: Record<string, string>) => {
      setSaving(true);
      const updated: SOAPNote = {
        subjective: {
          chiefComplaint: values.chiefComplaint,
          historyOfPresentIllness: values.historyOfPresentIllness,
          reviewOfSystems: values.reviewOfSystems.split('\n').filter(Boolean),
          patientNarrative: soapNote?.subjective.patientNarrative ?? '',
        },
        objective: {
          vitalSigns: values.vitalSigns,
          physicalExamination: values.physicalExamination,
          observations: values.observations.split('\n').filter(Boolean),
        },
        assessment: {
          primaryDiagnosis: values.primaryDiagnosis,
          differentialDiagnoses: values.differentialDiagnoses
            .split('\n')
            .filter(Boolean),
          severity: values.severity,
          clinicalReasoning: values.clinicalReasoning,
        },
        plan: {
          medications: values.medications.split('\n').filter(Boolean),
          investigations: values.investigations.split('\n').filter(Boolean),
          referrals: values.referrals.split('\n').filter(Boolean),
          followUp: values.followUp,
          patientEducation: values.patientEducation.split('\n').filter(Boolean),
        },
      };

      saveSoapMutation.mutate(updated, {
        onSettled: () => {
          setSoapNote(updated);
          setSaving(false);
          setIsEditing(false);
          setSoapStatus('reviewed');
          message.success(
            language === 'hi' ? 'SOAP नोट अपडेट किया गया' : 'SOAP note updated',
          );
        },
      });
    },
    [setSoapNote, setSoapStatus, soapNote, language, message, saveSoapMutation],
  );

  if (!patient) {
    return (
      <Empty
        description="No active session. Please start a consultation first."
        style={{ marginTop: 80 }}
      >
        <Button type="primary" onClick={() => router.push('/nurse/patient-intake')}>
          Start Consultation
        </Button>
      </Empty>
    );
  }

  if (!soapNote) {
    return (
      <Empty
        description="SOAP note not available. The API may be unreachable."
        style={{ marginTop: 80 }}
      >
        <Button type="primary" onClick={() => router.push('/nurse/dashboard')}>
          Back to Dashboard
        </Button>
      </Empty>
    );
  }

  const handleToggleEdit = () => {
    if (!isEditing) {
      form.setFieldsValue({
        chiefComplaint: soapNote.subjective.chiefComplaint,
        historyOfPresentIllness: soapNote.subjective.historyOfPresentIllness,
        reviewOfSystems: soapNote.subjective.reviewOfSystems.join('\n'),
        vitalSigns: soapNote.objective.vitalSigns,
        physicalExamination: soapNote.objective.physicalExamination,
        observations: soapNote.objective.observations.join('\n'),
        primaryDiagnosis: soapNote.assessment.primaryDiagnosis,
        differentialDiagnoses: soapNote.assessment.differentialDiagnoses.join('\n'),
        severity: soapNote.assessment.severity,
        clinicalReasoning: soapNote.assessment.clinicalReasoning,
        medications: soapNote.plan.medications.join('\n'),
        investigations: soapNote.plan.investigations.join('\n'),
        referrals: soapNote.plan.referrals.join('\n'),
        followUp: soapNote.plan.followUp,
        patientEducation: soapNote.plan.patientEducation.join('\n'),
      });
    }
    setIsEditing(!isEditing);
  };

  const handleFinalize = () => {
    modal.confirm({
      title:
        language === 'hi' ? 'SOAP नोट अंतिम करें?' : 'Finalize SOAP Note?',
      content:
        language === 'hi'
          ? 'अंतिम करने के बाद इसे संपादित नहीं किया जा सकता।'
          : 'Once finalized, this note cannot be edited.',
      okText: language === 'hi' ? 'अंतिम करें' : 'Finalize',
      cancelText: language === 'hi' ? 'रद्द करें' : 'Cancel',
      okType: 'primary',
      onOk: async () => {
        // Complete session via API
        try { await api.post(`/sessions/${sessionId}/complete`); } catch (err) { console.error('Failed to complete session:', err); throw err; }
        setSoapStatus('finalized');
        completeSession();
        message.success(
          language === 'hi'
            ? 'सत्र पूर्ण और SOAP नोट अंतिम किया गया'
            : 'Session complete and SOAP note finalized',
        );
      },
    });
  };

  const statusStepIndex =
    soapStatus === 'draft' ? 0 : soapStatus === 'reviewed' ? 1 : 2;

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'SOAP सारांश' : 'SOAP Summary'}
        subtitle={`${language === 'hi' ? 'सत्र' : 'Session'}: ${sessionId}`}
        extra={
          <Space>
            <Tag
              color={
                soapStatus === 'draft'
                  ? 'default'
                  : soapStatus === 'reviewed'
                    ? 'blue'
                    : 'green'
              }
              style={{ fontSize: 13, padding: '4px 12px' }}
            >
              {soapStatus === 'draft'
                ? language === 'hi'
                  ? 'ड्राफ्ट'
                  : 'Draft'
                : soapStatus === 'reviewed'
                  ? language === 'hi'
                    ? 'समीक्षित'
                    : 'Reviewed'
                  : language === 'hi'
                    ? 'अंतिम'
                    : 'Finalized'}
            </Tag>
          </Space>
        }
      />

      {/* Status Steps */}
      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={statusStepIndex}
          size="small"
          items={[
            {
              title: language === 'hi' ? 'ड्राफ्ट' : 'Draft',
              icon: <FileTextOutlined />,
            },
            {
              title: language === 'hi' ? 'समीक्षित' : 'Reviewed',
              icon: <EyeOutlined />,
            },
            {
              title: language === 'hi' ? 'अंतिम' : 'Finalized',
              icon: <CheckCircleOutlined />,
            },
          ]}
        />
      </Card>

      {/* SOAP Content */}
      {!isEditing ? (
        /* Read-only View */
        <Card
          title={
            <Space>
              <FileTextOutlined />
              {language === 'hi' ? 'SOAP नोट' : 'SOAP Note'}
            </Space>
          }
          extra={
            soapStatus !== 'finalized' && (
              <Button
                icon={<EditOutlined />}
                onClick={handleToggleEdit}
              >
                {language === 'hi' ? 'संपादित करें' : 'Edit'}
              </Button>
            )
          }
          style={{ marginBottom: 24 }}
        >
          <SOAPDisplay data={soapNote} defaultOpen />
        </Card>
      ) : (
        /* Edit Mode */
        <Form form={form} layout="vertical" onFinish={handleSave}>
          {/* Subjective */}
          <Card
            title={language === 'hi' ? 'S - व्यक्तिपरक' : 'S - Subjective'}
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="chiefComplaint"
              label={language === 'hi' ? 'मुख्य शिकायत' : 'Chief Complaint'}
              rules={[{ required: true }]}
            >
              <TextArea rows={2} />
            </Form.Item>
            <Form.Item
              name="historyOfPresentIllness"
              label={language === 'hi' ? 'वर्तमान बीमारी का इतिहास' : 'History of Present Illness'}
            >
              <TextArea rows={4} />
            </Form.Item>
            <Form.Item
              name="reviewOfSystems"
              label={
                language === 'hi'
                  ? 'प्रणालियों की समीक्षा (प्रति पंक्ति एक)'
                  : 'Review of Systems (one per line)'
              }
            >
              <TextArea rows={4} />
            </Form.Item>
          </Card>

          {/* Objective */}
          <Card
            title={language === 'hi' ? 'O - वस्तुपरक' : 'O - Objective'}
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="vitalSigns"
              label={language === 'hi' ? 'वाइटल साइन्स' : 'Vital Signs'}
            >
              <TextArea rows={2} />
            </Form.Item>
            <Form.Item
              name="physicalExamination"
              label={language === 'hi' ? 'शारीरिक परीक्षा' : 'Physical Examination'}
            >
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="observations"
              label={
                language === 'hi'
                  ? 'अवलोकन (प्रति पंक्ति एक)'
                  : 'Observations (one per line)'
              }
            >
              <TextArea rows={3} />
            </Form.Item>
          </Card>

          {/* Assessment */}
          <Card
            title={language === 'hi' ? 'A - मूल्यांकन' : 'A - Assessment'}
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="primaryDiagnosis"
              label={language === 'hi' ? 'प्राथमिक निदान' : 'Primary Diagnosis'}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="differentialDiagnoses"
              label={
                language === 'hi'
                  ? 'विभेदक निदान (प्रति पंक्ति एक)'
                  : 'Differential Diagnoses (one per line)'
              }
            >
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="severity"
              label={language === 'hi' ? 'गंभीरता' : 'Severity'}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="clinicalReasoning"
              label={language === 'hi' ? 'नैदानिक तर्क' : 'Clinical Reasoning'}
            >
              <TextArea rows={3} />
            </Form.Item>
          </Card>

          {/* Plan */}
          <Card
            title={language === 'hi' ? 'P - योजना' : 'P - Plan'}
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="medications"
              label={
                language === 'hi'
                  ? 'दवाएं (प्रति पंक्ति एक)'
                  : 'Medications (one per line)'
              }
            >
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="investigations"
              label={
                language === 'hi'
                  ? 'जांच (प्रति पंक्ति एक)'
                  : 'Investigations (one per line)'
              }
            >
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="referrals"
              label={
                language === 'hi'
                  ? 'रेफरल (प्रति पंक्ति एक)'
                  : 'Referrals (one per line)'
              }
            >
              <TextArea rows={2} />
            </Form.Item>
            <Form.Item
              name="followUp"
              label={language === 'hi' ? 'फॉलो-अप' : 'Follow-up'}
            >
              <TextArea rows={2} />
            </Form.Item>
            <Form.Item
              name="patientEducation"
              label={
                language === 'hi'
                  ? 'रोगी शिक्षा (प्रति पंक्ति एक)'
                  : 'Patient Education (one per line)'
              }
            >
              <TextArea rows={3} />
            </Form.Item>
          </Card>

          {/* Edit Actions */}
          <Card>
            <Space size="middle">
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saving}
              >
                {language === 'hi' ? 'सहेजें' : 'Save Changes'}
              </Button>
              <Button onClick={handleToggleEdit}>
                {language === 'hi' ? 'रद्द करें' : 'Cancel'}
              </Button>
            </Space>
          </Card>
        </Form>
      )}

      {/* Bottom Actions */}
      {!isEditing && (
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
            <Button onClick={() => router.push('/nurse/dashboard')}>
              {language === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}
            </Button>
            <Space size="middle" wrap>
              {soapStatus === 'draft' && (
                <Button
                  size="large"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setSoapStatus('reviewed')}
                >
                  {language === 'hi'
                    ? 'समीक्षित के रूप में चिह्नित करें'
                    : 'Mark as Reviewed'}
                </Button>
              )}
              {soapStatus === 'reviewed' && (
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  onClick={handleFinalize}
                  style={{ background: '#16a34a', borderColor: '#16a34a' }}
                >
                  {language === 'hi'
                    ? 'अंतिम करें और पूर्ण करें'
                    : 'Finalize & Complete'}
                </Button>
              )}
              <Button
                size="large"
                icon={<PlusCircleOutlined />}
                onClick={() => router.push('/nurse/patient-intake')}
              >
                {language === 'hi' ? 'नया परामर्श' : 'New Consultation'}
              </Button>
            </Space>
          </div>
        </Card>
      )}
    </div>
  );
}
