'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Row,
  Col,
  Typography,
  Space,
  Progress,
  List,
  Alert,
  Button,
  Tag,
  Divider,
  Empty,
} from 'antd';
import {
  FileTextOutlined,
  PlusCircleOutlined,
  MedicineBoxOutlined,
  WarningOutlined,
  ExperimentOutlined,
  VideoCameraOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, TriageResult } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';
import { TriageBadge } from '@/components/data-display/triage-badge';
import { fetchWithFallback } from '@/lib/api/query-helpers';


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TriageResultPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId) ? (params.sessionId[0] ?? '') : (params.sessionId ?? '');
  const { language } = useTranslation();

  const patient = useSessionStore((s) => s.patient);
  const storeTriageResult = useSessionStore((s) => s.triageResult);
  const setTriageResult = useSessionStore((s) => s.setTriageResult);

  // Fetch triage result from API
  const { data: apiTriageData } = useQuery({
    queryKey: ['nurse', 'triage', sessionId],
    queryFn: fetchWithFallback<{ success: boolean; data: any }>(
      `/sessions/${sessionId}/triage`,
    ),
    staleTime: 60_000,
  });

  // Apply API data to store
  useEffect(() => {
    const apiResult = apiTriageData?.data;
    if (apiResult && !storeTriageResult) {
      setTriageResult({
        category: apiResult.triage_level ?? 'B',
        urgencyScore: parseFloat(apiResult.urgency_score) || 50,
        acuityLevel: parseFloat(apiResult.urgency_score) >= 70 ? 'High' : parseFloat(apiResult.urgency_score) >= 40 ? 'Medium' : 'Low',
        redFlags: apiResult.red_flags ?? [],
        contributingFactors: apiResult.scoring_breakdown?.factors ?? [],
        recommendation: apiResult.recommended_action ?? '',
        referralType: apiResult.clinical_impression ?? undefined,
        differentialDiagnoses: apiResult.differential_diagnoses ?? undefined,
        nurseProtocol: apiResult.nurse_protocol ?? undefined,
        nurseProtocolHi: apiResult.nurse_protocol_hi ?? undefined,
        prescriptionSuggestion: apiResult.prescription_suggestion ?? undefined,
        prescriptionSuggestionHi: apiResult.prescription_suggestion_hi ?? undefined,
        teleconsultRequired: apiResult.teleconsult_required ?? false,
        emergencyRequired: apiResult.emergency_required ?? false,
      });
    }
  }, [apiTriageData, storeTriageResult, setTriageResult]);

  const triageResult = storeTriageResult;

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

  if (!triageResult) {
    return (
      <Empty
        description="Triage result not available. The API may be unreachable."
        style={{ marginTop: 80 }}
      >
        <Button type="primary" onClick={() => router.push('/nurse/dashboard')}>
          Back to Dashboard
        </Button>
      </Empty>
    );
  }

  const urgencyColor =
    triageResult.urgencyScore >= 70
      ? '#dc2626'
      : triageResult.urgencyScore >= 40
        ? '#d97706'
        : '#16a34a';

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'ट्राइएज परिणाम' : 'Triage Result'}
        subtitle={`${language === 'hi' ? 'सत्र' : 'Session'}: ${sessionId}`}
      />

      {/* Triage Category + Urgency Score */}
      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Card
            style={{ textAlign: 'center' }}
            styles={{ body: { padding: '32px 24px' } }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {language === 'hi' ? 'ट्राइएज श्रेणी' : 'Triage Category'}
            </Typography.Text>
            <div style={{ margin: '16px 0' }}>
              <TriageBadge category={triageResult.category} size="large" />
            </div>
            <Typography.Text style={{ fontSize: 14 }}>
              {language === 'hi' ? 'तीव्रता स्तर' : 'Acuity Level'}:{' '}
              <Typography.Text strong>{triageResult.acuityLevel}</Typography.Text>
            </Typography.Text>
          </Card>
        </Col>

        <Col xs={24} sm={12}>
          <Card
            style={{ textAlign: 'center' }}
            styles={{ body: { padding: '32px 24px' } }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {language === 'hi' ? 'तात्कालिकता स्कोर' : 'Urgency Score'}
            </Typography.Text>
            <div style={{ margin: '16px 0', display: 'flex', justifyContent: 'center' }}>
              <Progress
                type="circle"
                percent={triageResult.urgencyScore}
                size={100}
                strokeColor={urgencyColor}
                format={(pct) => (
                  <span style={{ color: urgencyColor, fontWeight: 700, fontSize: 22 }}>
                    {pct}
                  </span>
                )}
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {triageResult.urgencyScore >= 70
                ? language === 'hi'
                  ? 'उच्च तात्कालिकता'
                  : 'High Urgency'
                : triageResult.urgencyScore >= 40
                  ? language === 'hi'
                    ? 'मध्यम तात्कालिकता'
                    : 'Medium Urgency'
                  : language === 'hi'
                    ? 'कम तात्कालिकता'
                    : 'Low Urgency'}
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      {/* Red Flags */}
      {triageResult.redFlags.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            <WarningOutlined style={{ color: '#dc2626', marginRight: 8 }} />
            {language === 'hi' ? 'लाल झंडे (Red Flags)' : 'Red Flags'}
          </Typography.Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            {triageResult.redFlags.map((flag, i) => (
              <Alert
                key={i}
                message={flag}
                type="error"
                showIcon
                icon={<WarningOutlined />}
              />
            ))}
          </Space>
        </div>
      )}

      {/* Differential Diagnoses with Confidence Bars */}
      {triageResult.differentialDiagnoses && triageResult.differentialDiagnoses.length > 0 && (
        <Card
          title={
            <Space>
              <ExperimentOutlined />
              {language === 'hi' ? 'विभेदक निदान' : 'Differential Diagnoses'}
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          {triageResult.differentialDiagnoses.map((dx, index) => (
            <div key={index} style={{ marginBottom: index < triageResult.differentialDiagnoses!.length - 1 ? 16 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Typography.Text strong>{dx.name}</Typography.Text>
                <Typography.Text
                  style={{
                    fontWeight: 600,
                    color: dx.confidence >= 0.7 ? '#dc2626' : dx.confidence >= 0.4 ? '#d97706' : '#6b7280',
                  }}
                >
                  {Math.round(dx.confidence * 100)}%
                </Typography.Text>
              </div>
              <div
                style={{
                  height: 8,
                  background: '#f3f4f6',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(dx.confidence * 100)}%`,
                    background: dx.confidence >= 0.7 ? '#dc2626' : dx.confidence >= 0.4 ? '#d97706' : '#7c3aed',
                    borderRadius: 999,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Nurse Protocol for Level A */}
      {triageResult.category === 'A' && triageResult.nurseProtocol && (
        <Card
          style={{
            marginBottom: 24,
            borderLeft: '4px solid #16a34a',
          }}
          styles={{ body: { background: '#f0fdf4' } }}
        >
          <Typography.Title level={5} style={{ marginBottom: 12, color: '#16a34a' }}>
            <MedicineBoxOutlined style={{ marginRight: 8 }} />
            {language === 'hi' ? 'नर्स प्रोटोकॉल' : 'Nurse Protocol'}
          </Typography.Title>
          <Typography.Paragraph style={{ fontSize: 15, lineHeight: 1.8, margin: 0, color: '#374151' }}>
            {language === 'hi' && triageResult.nurseProtocolHi
              ? triageResult.nurseProtocolHi
              : triageResult.nurseProtocol}
          </Typography.Paragraph>
        </Card>
      )}

      {/* Contributing Factors */}
      <Card
        title={
          <Space>
            <MedicineBoxOutlined />
            {language === 'hi' ? 'योगदान करने वाले कारक' : 'Contributing Factors'}
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <List
          dataSource={triageResult.contributingFactors}
          renderItem={(factor) => (
            <List.Item>
              <Typography.Text>{factor}</Typography.Text>
            </List.Item>
          )}
        />
      </Card>

      {/* Prescription Suggestion */}
      {triageResult.prescriptionSuggestion && (
        <Card
          title={
            <Space>
              <MedicineBoxOutlined />
              {language === 'hi' ? 'प्रिस्क्रिप्शन सुझाव' : 'Prescription Suggestion'}
            </Space>
          }
          style={{ marginBottom: 24 }}
          styles={{ body: { background: '#fffbeb', borderRadius: 8 } }}
        >
          <Typography.Paragraph style={{ fontSize: 15, margin: 0, color: '#92400e' }}>
            {language === 'hi' && triageResult.prescriptionSuggestionHi
              ? triageResult.prescriptionSuggestionHi
              : triageResult.prescriptionSuggestion}
          </Typography.Paragraph>
        </Card>
      )}

      {/* Recommendation */}
      <Card
        title={language === 'hi' ? 'सिफारिश' : 'Recommendation'}
        style={{ marginBottom: 24 }}
        styles={{
          body: {
            background: '#f0fdf4',
            borderRadius: 8,
          },
        }}
      >
        <Typography.Paragraph style={{ fontSize: 15, margin: 0 }}>
          {language === 'hi' && triageResult.recommendationHi
            ? triageResult.recommendationHi
            : triageResult.recommendation}
        </Typography.Paragraph>
        {triageResult.referralType && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <Space>
              <Typography.Text type="secondary">
                {language === 'hi' ? 'रेफरल' : 'Referral'}:
              </Typography.Text>
              <Tag color="blue" style={{ fontSize: 13 }}>
                {triageResult.referralType}
              </Tag>
            </Space>
          </>
        )}
      </Card>

      {/* Quick Action Triggers */}
      {(triageResult.teleconsultRequired || triageResult.emergencyRequired) && (
        <Card style={{ marginBottom: 16 }}>
          <Space size="middle" wrap>
            {triageResult.teleconsultRequired && (
              <Button
                type="primary"
                size="large"
                icon={<VideoCameraOutlined />}
                style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                onClick={() => router.push(`/nurse/telemedicine/${sessionId}`)}
              >
                {language === 'hi' ? 'टेलीकंसल्ट अनुरोध करें' : 'Request Teleconsult'}
              </Button>
            )}
            {triageResult.emergencyRequired && (
              <Button
                type="primary"
                danger
                size="large"
                icon={<AlertOutlined />}
                onClick={() => router.push(`/nurse/emergency-alert/${sessionId}`)}
              >
                {language === 'hi' ? 'आपातकाल शुरू करें' : 'Trigger Emergency'}
              </Button>
            )}
          </Space>
        </Card>
      )}

      {/* Actions */}
      <Card>
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
            <Button
              type="primary"
              size="large"
              icon={<FileTextOutlined />}
              onClick={() => router.push(`/nurse/soap-summary/${sessionId}`)}
            >
              {language === 'hi' ? 'SOAP नोट देखें' : 'View SOAP Note'}
            </Button>
            <Button
              size="large"
              icon={<PlusCircleOutlined />}
              onClick={() => {
                router.push('/nurse/patient-intake');
              }}
            >
              {language === 'hi' ? 'नया परामर्श' : 'New Consultation'}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
}
