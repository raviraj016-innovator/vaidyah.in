'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
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

const { TextArea } = Input;

// ---------------------------------------------------------------------------
// Mock SOAP data
// ---------------------------------------------------------------------------

const MOCK_SOAP: SOAPNote = {
  subjective: {
    chiefComplaint: 'High fever for 3 days with body aches',
    historyOfPresentIllness:
      'Patient reports persistent fever of 101-102\u00b0F for the past 3 days. Fever is intermittent, peaks in the evening. Associated with generalized body aches, fatigue, and mild headache. Took paracetamol 500mg which provides temporary relief for 4-5 hours. No cough, cold, sore throat, or urinary symptoms.',
    reviewOfSystems: [
      'Constitutional: Fever, fatigue, malaise',
      'MSK: Generalized body aches, joint stiffness',
      'Neuro: Mild headache, no neck rigidity',
      'GI: Reduced appetite, no nausea/vomiting/diarrhea',
    ],
    patientNarrative:
      'Patient appeared anxious about the persistent nature of fever. Prosody analysis indicates moderate anxiety (60%) and mild frustration (50%).',
  },
  objective: {
    vitalSigns:
      'Temp: 101.8\u00b0F, BP: 118/76, HR: 92, RR: 18, SpO2: 97%, Pain: 5/10',
    physicalExamination:
      'Alert and oriented. Mild pallor noted. No lymphadenopathy. Chest clear. Abdomen soft, non-tender. No rash or petechiae.',
    observations: [
      'Mild dehydration - dry mucous membranes',
      'Warm to touch',
      'No signs of meningismus',
      'Petechiae absent - rules out hemorrhagic complications',
    ],
  },
  assessment: {
    primaryDiagnosis: 'Pyrexia of Unknown Origin (PUO)',
    differentialDiagnoses: [
      'Dengue fever',
      'Viral fever',
      'Malaria',
      'Urinary tract infection',
      'Typhoid fever',
    ],
    severity: 'Moderate',
    clinicalReasoning:
      'Persistent fever >3 days with body aches in an endemic area warrants investigation for dengue and malaria. Absence of cough/cold reduces likelihood of upper respiratory infection. No localizing signs found on examination.',
  },
  plan: {
    medications: [
      'Paracetamol 500mg TDS for fever',
      'ORS packets - 2-3 liters per day',
      'Domperidone 10mg if nausea develops',
    ],
    investigations: [
      'CBC with differential',
      'Dengue NS1 Antigen',
      'Malarial Parasite (MP) - Thick and thin smear',
      'Widal test if fever persists >5 days',
      'Urine routine',
    ],
    referrals: [
      'Medical Officer - PHC for evaluation',
      'Follow-up if fever persists >5 days or new symptoms develop',
    ],
    followUp: 'Review in 48 hours with lab reports. Earlier if condition worsens.',
    patientEducation: [
      'Adequate fluid intake (3-4 liters/day)',
      'Complete bed rest',
      'Monitor temperature every 6 hours',
      'Watch for warning signs: bleeding, severe abdominal pain, persistent vomiting',
      'Use mosquito net and repellent',
    ],
  },
};

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

  // Apply mock to store for downstream usage when no soap note exists
  useEffect(() => {
    if (!storeSoap) {
      setSoapNote(MOCK_SOAP);
    }
  }, [storeSoap, setSoapNote]);

  const soapNote = storeSoap ?? MOCK_SOAP;

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

  const handleToggleEdit = () => {
    if (!isEditing) {
      // Populate form with current data
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

  const handleSave = useCallback(
    (values: Record<string, string>) => {
      setSaving(true);
      const updated: SOAPNote = {
        subjective: {
          chiefComplaint: values.chiefComplaint,
          historyOfPresentIllness: values.historyOfPresentIllness,
          reviewOfSystems: values.reviewOfSystems.split('\n').filter(Boolean),
          patientNarrative: soapNote.subjective.patientNarrative,
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

      setTimeout(() => {
        setSoapNote(updated);
        setSaving(false);
        setIsEditing(false);
        setSoapStatus('reviewed');
        message.success(
          language === 'hi' ? 'SOAP नोट अपडेट किया गया' : 'SOAP note updated',
        );
      }, 600);
    },
    [setSoapNote, setSoapStatus, soapNote, language, message],
  );

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
      onOk: () => {
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
