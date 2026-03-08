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
  CloseCircleOutlined,
  QuestionCircleOutlined,
  InfoCircleOutlined,
  BankOutlined,
  ExperimentOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n/use-translation';
import { PageHeader } from '@/components/ui/page-header';
import type { ClinicalTrial } from '@/stores/trial-store';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';
import api from '@/lib/api/client';
import { useAuthStore, type PatientUser } from '@/stores/auth-store';

// ---------------------------------------------------------------------------
// Eligibility matching
// ---------------------------------------------------------------------------

type EligibilityStatus = 'met' | 'not_met' | 'unknown';

function matchCriterion(criterion: string, patient: PatientUser | null): EligibilityStatus {
  if (!patient) return 'unknown';

  const lc = criterion.toLowerCase();

  // Age checks
  const ageMatch = lc.match(/(\d+)\s*[-–to]+\s*(\d+)\s*(?:years|yrs)/);
  if (ageMatch && patient.age != null) {
    const [, minStr, maxStr] = ageMatch;
    const min = parseInt(minStr!, 10);
    const max = parseInt(maxStr!, 10);
    return patient.age >= min && patient.age <= max ? 'met' : 'not_met';
  }
  if (/age\s*(?:>=?|at least|over|above)\s*(\d+)/.test(lc) && patient.age != null) {
    const m = lc.match(/age\s*(?:>=?|at least|over|above)\s*(\d+)/);
    return patient.age >= parseInt(m![1]!, 10) ? 'met' : 'not_met';
  }
  if (/age\s*(?:<=?|under|below)\s*(\d+)/.test(lc) && patient.age != null) {
    const m = lc.match(/age\s*(?:<=?|under|below)\s*(\d+)/);
    return patient.age <= parseInt(m![1]!, 10) ? 'met' : 'not_met';
  }

  // Gender checks (exclusion: "pregnant or breastfeeding women")
  if (/\b(male|female|women|men)\b/i.test(lc) && patient.gender) {
    const pg = patient.gender.toLowerCase();
    if (lc.includes('female') || lc.includes('women')) {
      if (lc.includes('pregnant') || lc.includes('breastfeed')) {
        return pg === 'female' ? 'unknown' : 'met'; // can't verify pregnancy status
      }
    }
  }

  // Condition matching (inclusion: "diagnosed with X")
  if (patient.conditions?.length) {
    const patConds = patient.conditions.map((c) => c.toLowerCase());
    for (const cond of patConds) {
      if (lc.includes(cond) || cond.split(' ').some((w) => w.length > 4 && lc.includes(w))) {
        return 'met';
      }
    }
  }

  // Medication matching (exclusion: "current use of X")
  if (/current use of|currently taking|on\s+\w+\s+therapy/.test(lc) && patient.medications?.length) {
    const patMeds = patient.medications.map((m) => m.toLowerCase());
    for (const med of patMeds) {
      if (lc.includes(med)) return 'not_met';
    }
  }

  // Allergy matching (exclusion: "known allergy")
  if (/allergy|allergic/.test(lc) && patient.allergies?.length) {
    return 'unknown'; // can't match generic allergy to specific ingredients
  }

  return 'unknown';
}

function getStatusIcon(status: EligibilityStatus) {
  switch (status) {
    case 'met':
      return <CheckCircleOutlined style={{ color: '#16a34a', marginRight: 8, fontSize: 14 }} />;
    case 'not_met':
      return <CloseCircleOutlined style={{ color: '#dc2626', marginRight: 8, fontSize: 14 }} />;
    case 'unknown':
      return <QuestionCircleOutlined style={{ color: '#d97706', marginRight: 8, fontSize: 14 }} />;
  }
}

function getStatusColor(status: EligibilityStatus): string {
  switch (status) {
    case 'met': return '#f0fdf4';
    case 'not_met': return '#fef2f2';
    case 'unknown': return 'transparent';
  }
}


// ---------------------------------------------------------------------------
// City coordinates for OpenStreetMap embed
// ---------------------------------------------------------------------------

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  'delhi': { lat: 28.6139, lng: 77.2090 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'chandigarh': { lat: 30.7333, lng: 76.7794 },
  'jaipur': { lat: 26.9124, lng: 75.7873 },
  'pune': { lat: 18.5204, lng: 73.8567 },
  'bangalore': { lat: 12.9716, lng: 77.5946 },
  'bengaluru': { lat: 12.9716, lng: 77.5946 },
  'chennai': { lat: 13.0827, lng: 80.2707 },
  'kolkata': { lat: 22.5726, lng: 88.3639 },
  'hyderabad': { lat: 17.3850, lng: 78.4867 },
  'ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'lucknow': { lat: 26.8467, lng: 80.9462 },
  'bhopal': { lat: 23.2599, lng: 77.4126 },
  'thiruvananthapuram': { lat: 8.5241, lng: 76.9366 },
  'kochi': { lat: 9.9312, lng: 76.2673 },
  'varanasi': { lat: 25.3176, lng: 83.0064 },
  'patna': { lat: 25.6093, lng: 85.1376 },
  'indore': { lat: 22.7196, lng: 75.8577 },
  'nagpur': { lat: 21.1458, lng: 79.0882 },
  'coimbatore': { lat: 11.0168, lng: 76.9558 },
  'visakhapatnam': { lat: 17.6868, lng: 83.2185 },
  'surat': { lat: 21.1702, lng: 72.8311 },
  'guwahati': { lat: 26.1445, lng: 91.7362 },
};

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

function getMapUrl(locations: Array<{ city: string }>) {
  // Try to find coordinates for the first location's city
  const firstCity = locations[0]?.city?.toLowerCase().trim();
  const coords = firstCity ? CITY_COORDS[firstCity] : undefined;
  const center = coords ?? INDIA_CENTER;

  // Zoom level: if we found a specific city, zoom in closer; otherwise show all of India
  const zoom = coords ? 11 : 5;
  const delta = coords ? 0.15 : 15;

  const bbox = `${center.lng - delta},${center.lat - delta},${center.lng + delta},${center.lat + delta}`;

  // Add marker layer for the center point
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lng}`;
}


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
  const authUser = useAuthStore((s) => s.user);
  const patient: PatientUser | null = authUser && 'abdmId' in authUser ? authUser : null;

  const { data: trial } = useQuery({
    queryKey: ['patient', 'trial', trialId],
    queryFn: fetchWithFallback<ClinicalTrial>(endpoints.trials.detail(trialId)),
    staleTime: 60_000,
    enabled: !!trialId,
  });

  // Similar trials query — search by the current trial's first condition
  const firstCondition = trial?.conditions?.[0] ?? '';

  const { data: similarTrials = [] } = useQuery({
    queryKey: ['patient', 'trials', 'similar', trialId, firstCondition],
    queryFn: async () => {
      const fn = fetchWithFallback<{ results?: ClinicalTrial[]; trials?: ClinicalTrial[] }>(
        `${endpoints.trials.search}?conditions=${encodeURIComponent(firstCondition)}`,
      );
      const data = await fn();
      const list = data.results ?? data.trials ?? [];
      return list.filter((t) => t.id !== trialId).slice(0, 4);
    },
    staleTime: 120_000,
    enabled: !!trialId && !!firstCondition,
  });

  // Build map URL for locations
  const mapUrl = useMemo(
    () => (trial?.locations?.length ? getMapUrl(trial.locations) : null),
    [trial?.locations],
  );

  if (!trial) {
    return (
      <Card style={{ marginTop: 40, textAlign: 'center' }}>
        <Typography.Title level={4}>
          {language === 'hi' ? 'ट्रायल लोड हो रहा है...' : 'Loading trial details...'}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          {language === 'hi'
            ? 'यदि डेटा लोड नहीं होता, तो API उपलब्ध नहीं हो सकता।'
            : 'If data does not load, the API may be unavailable.'}
        </Typography.Paragraph>
        <Button type="primary" onClick={() => router.push('/patient/home')}>
          {language === 'hi' ? 'होम पर वापस' : 'Back to Home'}
        </Button>
      </Card>
    );
  }

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
      onOk: async () => {
        try { await api.post(`/trials/${trialId}/interest`); } catch (err) { console.error('Failed to express interest:', err); throw err; }
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

        {/* Plain Language Summary (from CSV data) */}
        {trial.plainSummary && trial.plainSummary !== trial.summary && (
          <>
            <Divider />
            <Typography.Title level={5}>
              {language === 'hi' ? 'सरल भाषा सारांश' : 'Plain Language Summary'}
            </Typography.Title>
            <Typography.Paragraph style={{ fontSize: 15, lineHeight: 1.7, color: '#374151' }}>
              {trial.plainSummary}
            </Typography.Paragraph>
          </>
        )}

        {/* Categories */}
        {trial.categories && trial.categories.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {language === 'hi' ? 'श्रेणियां' : 'Categories'}:
            </Typography.Text>
            <Space wrap size={[6, 6]} style={{ marginLeft: 8 }}>
              {trial.categories.map((c) => (
                <Tag key={c} color="geekblue">{c}</Tag>
              ))}
            </Space>
          </div>
        )}

        {/* Sponsor */}
        <Space style={{ marginTop: trial.categories?.length ? 12 : 0 }}>
          <BankOutlined style={{ color: '#6b7280' }} />
          <Typography.Text type="secondary">
            {language === 'hi' ? 'प्रायोजक' : 'Sponsor'}:
          </Typography.Text>
          <Typography.Text strong>{trial.sponsor}</Typography.Text>
        </Space>

        {/* URL link */}
        {trial.url && (
          <div style={{ marginTop: 8 }}>
            <Typography.Link href={trial.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
              {language === 'hi' ? 'ClinicalTrials.gov पर देखें' : 'View on ClinicalTrials.gov'}
            </Typography.Link>
          </div>
        )}
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
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" style={{ marginBottom: 16 }}>
            {trial.eligibility.ageRange && (
              <Descriptions.Item
                label={language === 'hi' ? 'आयु सीमा' : 'Age Range'}
              >
                {trial.eligibility.ageRange}
              </Descriptions.Item>
            )}
            {!trial.eligibility.ageRange && (trial.eligibility.ageMin || trial.eligibility.ageMax) && (
              <Descriptions.Item
                label={language === 'hi' ? 'आयु सीमा' : 'Age Range'}
              >
                {trial.eligibility.ageMin ?? '?'} - {trial.eligibility.ageMax ?? 'N/A'} years
              </Descriptions.Item>
            )}
            {trial.eligibility.gender && (
              <Descriptions.Item
                label={language === 'hi' ? 'लिंग' : 'Gender'}
              >
                {trial.eligibility.gender}
              </Descriptions.Item>
            )}
            {trial.eligibility.ageGroup && (
              <Descriptions.Item
                label={language === 'hi' ? 'आयु वर्ग' : 'Age Group'}
              >
                {trial.eligibility.ageGroup}
              </Descriptions.Item>
            )}
            {trial.eligibility.raceEthnicity && (
              <Descriptions.Item
                label={language === 'hi' ? 'जाति/नस्ल' : 'Race/Ethnicity'}
              >
                {trial.eligibility.raceEthnicity}
              </Descriptions.Item>
            )}
          </Descriptions>

          {patient && (
            <div style={{
              padding: '8px 12px',
              marginBottom: 12,
              background: '#f0f5ff',
              borderRadius: 6,
              border: '1px solid #d6e4ff',
            }}>
              <Typography.Text style={{ fontSize: 13, color: '#1d39c4' }}>
                {language === 'hi'
                  ? `आपकी प्रोफ़ाइल से मिलान: ${patient.name} (${patient.age ?? '?'} वर्ष, ${patient.gender ?? '?'})`
                  : `Matching against your profile: ${patient.name} (${patient.age ?? '?'} yrs, ${patient.gender ?? '?'})`}
              </Typography.Text>
            </div>
          )}

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
                    renderItem={(item) => {
                      const status = matchCriterion(item, patient);
                      return (
                        <List.Item style={{ background: getStatusColor(status), borderRadius: 4 }}>
                          <Typography.Text>
                            {getStatusIcon(status)}
                            {item}
                          </Typography.Text>
                          {status !== 'unknown' && (
                            <Tag
                              color={status === 'met' ? 'success' : 'error'}
                              style={{ marginLeft: 8, fontSize: 11 }}
                            >
                              {status === 'met'
                                ? (language === 'hi' ? 'पूरा' : 'Met')
                                : (language === 'hi' ? 'नहीं पूरा' : 'Not Met')}
                            </Tag>
                          )}
                        </List.Item>
                      );
                    }}
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
                    renderItem={(item) => {
                      const rawStatus = matchCriterion(item, patient);
                      // For exclusion criteria, "met" means the patient IS excluded
                      const displayStatus = rawStatus === 'met' ? 'not_met' : rawStatus === 'not_met' ? 'met' : 'unknown';
                      return (
                        <List.Item style={{ background: getStatusColor(displayStatus), borderRadius: 4 }}>
                          <Typography.Text>
                            {getStatusIcon(displayStatus)}
                            {item}
                          </Typography.Text>
                          {displayStatus !== 'unknown' && (
                            <Tag
                              color={displayStatus === 'met' ? 'success' : 'error'}
                              style={{ marginLeft: 8, fontSize: 11 }}
                            >
                              {displayStatus === 'met'
                                ? (language === 'hi' ? 'लागू नहीं' : 'Clear')
                                : (language === 'hi' ? 'लागू' : 'Applies')}
                            </Tag>
                          )}
                        </List.Item>
                      );
                    }}
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
          {/* OpenStreetMap embed */}
          {mapUrl && (
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  width: '100%',
                  height: 250,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  position: 'relative',
                }}
              >
                <iframe
                  title={language === 'hi' ? 'ट्रायल स्थान मानचित्र' : 'Trial Locations Map'}
                  src={mapUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 'none' }}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, marginTop: 4, display: 'block' }}
              >
                {language === 'hi'
                  ? 'मानचित्र पहले ट्रायल स्थान के आधार पर केंद्रित है'
                  : 'Map centered on the first trial location'}
              </Typography.Text>
            </div>
          )}

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

      {/* Similar Trials */}
      {similarTrials.length > 0 && (
        <Card
          title={
            <Space>
              <ExperimentOutlined />
              {language === 'hi' ? 'समान ट्रायल' : 'Similar Trials'}
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {language === 'hi'
              ? 'इन ट्रायल में समान स्थितियां या उपचार क्षेत्र हैं'
              : 'These trials share similar conditions or treatment areas'}
          </Typography.Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {similarTrials.map((st) => (
              <Card
                key={st.id}
                size="small"
                hoverable
                onClick={() => router.push(`/patient/trials/${st.id}`)}
                style={{
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                }}
                styles={{ body: { padding: '12px 16px' } }}
              >
                <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  {language === 'hi' && st.titleHi ? st.titleHi : st.title}
                </Typography.Text>
                <Space wrap size={[6, 6]} style={{ marginBottom: 8 }}>
                  <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{st.phase}</Tag>
                  <Tag color="green" style={{ fontSize: 11, margin: 0 }}>{st.status}</Tag>
                </Space>
                <div style={{ marginBottom: 8 }}>
                  {st.conditions.slice(0, 2).map((c) => (
                    <Tag key={c} color="purple" style={{ fontSize: 11, margin: '0 4px 4px 0' }}>{c}</Tag>
                  ))}
                </div>
                <Typography.Link
                  style={{ fontSize: 13 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/patient/trials/${st.id}`);
                  }}
                >
                  {language === 'hi' ? 'विवरण देखें' : 'View Details'} <RightOutlined style={{ fontSize: 10 }} />
                </Typography.Link>
              </Card>
            ))}
          </div>
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
