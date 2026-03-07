'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useSessionStore, TriageResult } from '@/stores/session-store';
import { PageHeader } from '@/components/ui/page-header';
import { TriageBadge } from '@/components/data-display/triage-badge';

// ---------------------------------------------------------------------------
// Mock triage result
// ---------------------------------------------------------------------------

const MOCK_TRIAGE: TriageResult = {
  category: 'B',
  urgencyScore: 72,
  acuityLevel: 'High',
  redFlags: [
    'Persistent high fever (>3 days)',
    'Fever unresponsive to paracetamol',
  ],
  contributingFactors: [
    'Fever: 101.8\u00b0F for 3 days',
    'Body aches and fatigue',
    'Patient appears anxious (prosody: 60% anxiety)',
    'Mild dehydration signs',
    'No significant past medical history',
  ],
  recommendation:
    'Refer to Medical Officer for evaluation. Suspected viral illness with potential for dengue/malaria. Blood tests recommended: CBC, Dengue NS1, Malarial parasite. Start antipyretic and ORS.',
  recommendationHi:
    'चिकित्सा अधिकारी को रेफर करें। डेंगू/मलेरिया की संभावना के साथ वायरल बीमारी का संदेह। रक्त परीक्षण की सिफारिश: CBC, डेंगू NS1, मलेरिया परजीवी। ज्वरनाशक और ORS शुरू करें।',
  referralType: 'Medical Officer - PHC',
};

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

  // Apply mock to store for downstream usage when no triage result exists
  useEffect(() => {
    if (!storeTriageResult) {
      setTriageResult(MOCK_TRIAGE);
    }
  }, [storeTriageResult, setTriageResult]);

  const triageResult = storeTriageResult ?? MOCK_TRIAGE;

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
