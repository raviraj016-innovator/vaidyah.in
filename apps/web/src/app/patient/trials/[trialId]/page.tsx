'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Card,
  Typography,
  Space,
  Tag,
  Button,
  Collapse,
  List,
  Descriptions,
  Divider,
  Result,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  MailOutlined,
  HeartOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { PageHeader } from '@/components/ui/page-header';
import type { ClinicalTrial } from '@/stores/trial-store';

// ---------------------------------------------------------------------------
// Mock trial detail data
// ---------------------------------------------------------------------------

const MOCK_TRIAL_MAP: Record<string, ClinicalTrial> = {
  'trial-001': {
    id: 'trial-001',
    nctId: 'NCT05678901',
    title: 'Evaluating Novel Oral Diabetes Management in Type 2 Diabetics',
    titleHi: 'टाइप 2 मधुमेह रोगियों में नई मौखिक मधुमेह प्रबंधन का मूल्यांकन',
    summary:
      'A Phase 3 randomized, double-blind, placebo-controlled trial evaluating the efficacy and safety of a novel GLP-1 receptor agonist (VDH-0142) for glycemic control in adult patients with type 2 diabetes mellitus. The study aims to demonstrate superior HbA1c reduction compared to standard care over 52 weeks.',
    summaryHi:
      'टाइप 2 मधुमेह मेलिटस वाले वयस्क रोगियों में ग्लाइसेमिक नियंत्रण के लिए एक नए GLP-1 रिसेप्टर एगोनिस्ट (VDH-0142) की प्रभावकारिता और सुरक्षा का मूल्यांकन करने वाला चरण 3 यादृच्छिक, डबल-ब्लाइंड, प्लेसीबो-नियंत्रित परीक्षण। अध्ययन का उद्देश्य 52 सप्ताहों में मानक देखभाल की तुलना में बेहतर HbA1c कमी दिखाना है।',
    phase: 'Phase 3',
    status: 'Recruiting',
    conditions: ['Type 2 Diabetes Mellitus', 'Hyperglycemia'],
    sponsor: 'National Institute of Diabetes Research',
    eligibility: {
      ageRange: '18-70 years',
      gender: 'All',
      inclusion: [
        'Diagnosed with Type 2 Diabetes Mellitus for at least 6 months',
        'HbA1c between 7.0% and 10.5% at screening',
        'On stable dose of metformin (>=1000mg/day) for at least 8 weeks',
        'BMI between 23 and 40 kg/m2',
        'Willing to comply with study procedures and follow-up visits',
      ],
      exclusion: [
        'Type 1 Diabetes or secondary diabetes',
        'History of diabetic ketoacidosis within last 6 months',
        'Severe renal impairment (eGFR <30 mL/min)',
        'Active liver disease or ALT/AST >3x upper limit of normal',
        'Pregnant or breastfeeding women',
        'Current use of insulin or GLP-1 receptor agonist',
        'History of pancreatitis',
        'Uncontrolled hypertension (>180/110 mmHg)',
      ],
    },
    locations: [
      { facility: 'AIIMS New Delhi', city: 'New Delhi', state: 'Delhi', distance: 12 },
      { facility: 'PGI Chandigarh', city: 'Chandigarh', state: 'Punjab', distance: 250 },
      { facility: 'KEM Hospital', city: 'Mumbai', state: 'Maharashtra', distance: 1400 },
    ],
    contact: {
      name: 'Dr. Rakesh Sharma',
      phone: '+91-11-2658-8500',
      email: 'trials@nidr.gov.in',
    },
  },
  'trial-002': {
    id: 'trial-002',
    nctId: 'NCT05678902',
    title: 'Ayurvedic Formulation for Hypertension Management',
    titleHi: 'उच्च रक्तचाप प्रबंधन के लिए आयुर्वेदिक फॉर्मूलेशन',
    summary:
      'A Phase 2, multi-center, randomized clinical trial studying the effectiveness of a standardized Ayurvedic compound (Ashwagandha + Arjuna bark extract) in managing Stage 1 hypertension as adjunct therapy alongside standard antihypertensive medication.',
    summaryHi:
      'मानक उच्चरक्तचापरोधी दवा के साथ सहायक चिकित्सा के रूप में स्टेज 1 उच्च रक्तचाप के प्रबंधन में एक मानकीकृत आयुर्वेदिक यौगिक (अश्वगंधा + अर्जुन छाल अर्क) की प्रभावशीलता का अध्ययन करने वाला चरण 2 बहुकेंद्रीय यादृच्छिक नैदानिक परीक्षण।',
    phase: 'Phase 2',
    status: 'Recruiting',
    conditions: ['Hypertension', 'Cardiovascular Disease'],
    sponsor: 'AYUSH Ministry, Government of India',
    eligibility: {
      ageRange: '30-65 years',
      gender: 'All',
      inclusion: [
        'Stage 1 Hypertension (SBP 130-139 or DBP 80-89)',
        'On stable antihypertensive medication for at least 4 weeks',
        'Willing to maintain current lifestyle during trial period',
      ],
      exclusion: [
        'Stage 2 or higher hypertension',
        'Secondary hypertension',
        'Active liver or kidney disease',
        'Known allergy to study ingredients',
        'Pregnancy or planning to conceive',
      ],
    },
    locations: [
      { facility: 'National Ayurveda Hospital', city: 'Jaipur', state: 'Rajasthan', distance: 45 },
      { facility: 'CCRAS Center', city: 'Pune', state: 'Maharashtra', distance: 1200 },
    ],
    contact: {
      name: 'Dr. Meena Agarwal',
      phone: '+91-141-2560-7890',
      email: 'ayush.trials@gov.in',
    },
  },
};

// Fallback for unknown trial IDs
const DEFAULT_TRIAL: ClinicalTrial = {
  id: 'trial-unknown',
  title: 'Clinical Trial Details',
  titleHi: 'क्लिनिकल ट्रायल विवरण',
  summary: 'Detailed information about this clinical trial.',
  summaryHi: 'इस क्लिनिकल ट्रायल के बारे में विस्तृत जानकारी।',
  phase: 'Phase 2',
  status: 'Recruiting',
  conditions: ['General'],
  sponsor: 'Research Institute',
  eligibility: {
    ageRange: '18-65 years',
    gender: 'All',
    inclusion: ['Must meet standard eligibility criteria'],
    exclusion: ['Severe comorbidities', 'Pregnancy'],
  },
  locations: [
    { facility: 'Primary Health Center', city: 'Delhi', state: 'Delhi' },
  ],
  contact: {
    name: 'Study Coordinator',
    phone: '+91-11-0000-0000',
    email: 'info@example.com',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TrialDetailPage() {
  const router = useRouter();
  const params = useParams();
  const trialId = Array.isArray(params.trialId) ? (params.trialId[0] ?? '') : (params.trialId ?? '');
  const { language } = useTranslation();
  const { message, modal } = App.useApp();

  const [interestSent, setInterestSent] = useState(false);

  const trial = useMemo(() => {
    return MOCK_TRIAL_MAP[trialId] ?? { ...DEFAULT_TRIAL, id: trialId };
  }, [trialId]);

  const handleExpressInterest = () => {
    modal.confirm({
      title:
        language === 'hi'
          ? 'रुचि व्यक्त करें?'
          : 'Express Interest?',
      content:
        language === 'hi'
          ? 'आपकी प्रोफाइल जानकारी ट्रायल साइट के साथ साझा की जाएगी। क्या आप जारी रखना चाहते हैं?'
          : 'Your profile information will be shared with the trial site. Do you want to continue?',
      okText: language === 'hi' ? 'हाँ, भेजें' : 'Yes, Send',
      cancelText: language === 'hi' ? 'रद्द करें' : 'Cancel',
      onOk: () => {
        setInterestSent(true);
        message.success(
          language === 'hi'
            ? 'आपकी रुचि सफलतापूर्वक भेजी गई!'
            : 'Your interest has been sent successfully!',
        );
      },
    });
  };

  return (
    <div>
      {/* Back Button */}
      <Button
        icon={<ArrowLeftOutlined />}
        type="text"
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
          } else {
            router.push('/patient/trials');
          }
        }}
        style={{ marginBottom: 16 }}
      >
        {language === 'hi' ? 'वापस' : 'Back'}
      </Button>

      {/* Title + Tags */}
      <Card style={{ marginBottom: 24 }}>
        <Typography.Title level={3} style={{ marginBottom: 12 }}>
          {language === 'hi' && trial.titleHi ? trial.titleHi : trial.title}
        </Typography.Title>
        <Space wrap size={[8, 8]} style={{ marginBottom: 16 }}>
          <Tag color="blue" style={{ fontSize: 13, padding: '2px 12px' }}>
            {trial.phase}
          </Tag>
          <Tag color="green" style={{ fontSize: 13, padding: '2px 12px' }}>
            {trial.status}
          </Tag>
          {trial.nctId && (
            <Tag style={{ fontSize: 12 }}>
              {trial.nctId}
            </Tag>
          )}
          {trial.conditions.map((c) => (
            <Tag key={c} color="purple">
              {c}
            </Tag>
          ))}
        </Space>

        {/* Summary */}
        <Typography.Title level={5}>
          {language === 'hi' ? 'सारांश' : 'Summary'}
        </Typography.Title>
        <Typography.Paragraph style={{ fontSize: 15, lineHeight: 1.7 }}>
          {language === 'hi' && trial.summaryHi ? trial.summaryHi : trial.summary}
        </Typography.Paragraph>

        {/* Sponsor */}
        <Space>
          <BankOutlined style={{ color: '#6b7280' }} />
          <Typography.Text type="secondary">
            {language === 'hi' ? 'प्रायोजक' : 'Sponsor'}:
          </Typography.Text>
          <Typography.Text strong>{trial.sponsor}</Typography.Text>
        </Space>
      </Card>

      {/* Eligibility */}
      {trial.eligibility && (
        <Card
          title={
            <Space>
              <CheckCircleOutlined />
              {language === 'hi' ? 'पात्रता मानदंड' : 'Eligibility Criteria'}
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            {trial.eligibility.ageRange && (
              <Descriptions.Item
                label={language === 'hi' ? 'आयु सीमा' : 'Age Range'}
              >
                {trial.eligibility.ageRange}
              </Descriptions.Item>
            )}
            {trial.eligibility.gender && (
              <Descriptions.Item
                label={language === 'hi' ? 'लिंग' : 'Gender'}
              >
                {trial.eligibility.gender}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Collapse
            defaultActiveKey={['inclusion']}
            items={[
              {
                key: 'inclusion',
                label: (
                  <Space>
                    <CheckCircleOutlined style={{ color: '#16a34a' }} />
                    <Typography.Text strong>
                      {language === 'hi' ? 'समावेश मानदंड' : 'Inclusion Criteria'}
                    </Typography.Text>
                  </Space>
                ),
                children: (
                  <List
                    size="small"
                    dataSource={trial.eligibility.inclusion ?? []}
                    renderItem={(item) => (
                      <List.Item>
                        <Typography.Text>
                          <CheckCircleOutlined
                            style={{ color: '#16a34a', marginRight: 8, fontSize: 12 }}
                          />
                          {item}
                        </Typography.Text>
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'exclusion',
                label: (
                  <Space>
                    <InfoCircleOutlined style={{ color: '#dc2626' }} />
                    <Typography.Text strong>
                      {language === 'hi' ? 'बहिष्करण मानदंड' : 'Exclusion Criteria'}
                    </Typography.Text>
                  </Space>
                ),
                children: (
                  <List
                    size="small"
                    dataSource={trial.eligibility.exclusion ?? []}
                    renderItem={(item) => (
                      <List.Item>
                        <Typography.Text>
                          <InfoCircleOutlined
                            style={{ color: '#dc2626', marginRight: 8, fontSize: 12 }}
                          />
                          {item}
                        </Typography.Text>
                      </List.Item>
                    )}
                  />
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Locations */}
      {trial.locations && trial.locations.length > 0 && (
        <Card
          title={
            <Space>
              <EnvironmentOutlined />
              {language === 'hi' ? 'स्थान' : 'Locations'}
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <List
            dataSource={trial.locations}
            renderItem={(loc) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <EnvironmentOutlined
                      style={{ fontSize: 20, color: '#7c3aed', marginTop: 4 }}
                    />
                  }
                  title={
                    <Typography.Text strong>{loc.facility}</Typography.Text>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Typography.Text type="secondary">
                        {loc.city}, {loc.state}
                      </Typography.Text>
                      {loc.distance !== undefined && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {language === 'hi'
                            ? `~${loc.distance} किमी दूर`
                            : `~${loc.distance} km away`}
                        </Typography.Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Contact / Express Interest */}
      <Card style={{ marginBottom: 24 }}>
        {interestSent ? (
          <Result
            status="success"
            title={
              language === 'hi'
                ? 'रुचि सफलतापूर्वक भेजी गई!'
                : 'Interest Sent Successfully!'
            }
            subTitle={
              language === 'hi'
                ? 'ट्रायल साइट आपसे जल्द संपर्क करेगी।'
                : 'The trial site will contact you soon.'
            }
          />
        ) : (
          <>
            {trial.contact && (
              <div style={{ marginBottom: 16 }}>
                <Typography.Title level={5}>
                  {language === 'hi' ? 'संपर्क जानकारी' : 'Contact Information'}
                </Typography.Title>
                <Descriptions column={{ xs: 1, sm: 2 }} size="small">
                  {trial.contact.name && (
                    <Descriptions.Item label={language === 'hi' ? 'नाम' : 'Name'}>
                      {trial.contact.name}
                    </Descriptions.Item>
                  )}
                  {trial.contact.phone && /^[\d\s+\-()]+$/.test(trial.contact.phone) && (
                    <Descriptions.Item label={language === 'hi' ? 'फ़ोन' : 'Phone'}>
                      <a href={`tel:${trial.contact.phone.replace(/[^\d+]/g, '')}`}>
                        <Space>
                          <PhoneOutlined />
                          {trial.contact.phone}
                        </Space>
                      </a>
                    </Descriptions.Item>
                  )}
                  {trial.contact.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trial.contact.email) && (
                    <Descriptions.Item label={language === 'hi' ? 'ईमेल' : 'Email'}>
                      <a href={`mailto:${trial.contact.email}`}>
                        <Space>
                          <MailOutlined />
                          {trial.contact.email}
                        </Space>
                      </a>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </div>
            )}

            <Divider />

            <Space size="middle" wrap style={{ width: '100%', justifyContent: 'center' }}>
              <Button
                type="primary"
                size="large"
                icon={<HeartOutlined />}
                onClick={handleExpressInterest}
              >
                {language === 'hi' ? 'रुचि व्यक्त करें' : 'Express Interest'}
              </Button>
              {trial.contact?.phone && (
                <a href={`tel:${trial.contact.phone}`}>
                  <Button size="large" icon={<PhoneOutlined />}>
                    {language === 'hi'
                      ? 'ट्रायल साइट से संपर्क करें'
                      : 'Contact Trial Site'}
                  </Button>
                </a>
              )}
            </Space>
          </>
        )}
      </Card>
    </div>
  );
}
