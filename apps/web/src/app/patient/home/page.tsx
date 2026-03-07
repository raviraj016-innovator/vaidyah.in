'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Space,
  Button,
  Spin,
  Empty,
  Card,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useAuthStore, PatientUser } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore, TrialMatch } from '@/stores/trial-store';
import { TrialCard } from '@/components/data-display/trial-card';

// ---------------------------------------------------------------------------
// Mock trial matches
// ---------------------------------------------------------------------------

const MOCK_MATCHES: TrialMatch[] = [
  {
    trial: {
      id: 'trial-001',
      nctId: 'NCT05678901',
      title: 'Evaluating Novel Oral Diabetes Management in Type 2 Diabetics',
      titleHi: 'टाइप 2 मधुमेह रोगियों में नई मौखिक मधुमेह प्रबंधन का मूल्यांकन',
      summary:
        'A Phase 3 randomized controlled trial evaluating the efficacy and safety of a novel GLP-1 receptor agonist for glycemic control in adult patients with type 2 diabetes.',
      summaryHi:
        'टाइप 2 मधुमेह वाले वयस्क रोगियों में ग्लाइसेमिक नियंत्रण के लिए एक नए GLP-1 रिसेप्टर एगोनिस्ट की प्रभावकारिता और सुरक्षा का मूल्यांकन करने वाला चरण 3 यादृच्छिक नियंत्रित परीक्षण।',
      phase: 'Phase 3',
      status: 'Recruiting',
      conditions: ['Type 2 Diabetes', 'Hyperglycemia'],
      sponsor: 'National Institute of Diabetes Research',
      locations: [
        { facility: 'AIIMS Delhi', city: 'New Delhi', state: 'Delhi', distance: 12 },
      ],
    },
    matchScore: 0.92,
    eligible: true,
    matchReasons: [
      'Matches your condition: Type 2 Diabetes',
      'Age within eligible range (18-70)',
      'Located within 15 km of your location',
    ],
    matchReasonsHi: [
      'आपकी स्थिति से मेल खाता है: टाइप 2 मधुमेह',
      'पात्र आयु सीमा (18-70) के भीतर',
      'आपके स्थान से 15 किमी के भीतर',
    ],
  },
  {
    trial: {
      id: 'trial-002',
      nctId: 'NCT05678902',
      title: 'Ayurvedic Formulation for Hypertension Management',
      titleHi: 'उच्च रक्तचाप प्रबंधन के लिए आयुर्वेदिक फॉर्मूलेशन',
      summary:
        'A Phase 2 clinical trial studying the effectiveness of a standardized Ayurvedic compound in managing Stage 1 hypertension as adjunct therapy.',
      summaryHi:
        'स्टेज 1 उच्च रक्तचाप के प्रबंधन में सहायक चिकित्सा के रूप में एक मानकीकृत आयुर्वेदिक यौगिक की प्रभावशीलता का अध्ययन करने वाला चरण 2 नैदानिक परीक्षण।',
      phase: 'Phase 2',
      status: 'Recruiting',
      conditions: ['Hypertension', 'Cardiovascular'],
      sponsor: 'AYUSH Ministry',
      locations: [
        { facility: 'Ayurveda Hospital Jaipur', city: 'Jaipur', state: 'Rajasthan', distance: 45 },
      ],
    },
    matchScore: 0.78,
    eligible: true,
    matchReasons: [
      'Matches your condition: Hypertension',
      'Trial accepts patients on existing medication',
    ],
    matchReasonsHi: [
      'आपकी स्थिति से मेल खाता है: उच्च रक्तचाप',
      'परीक्षण मौजूदा दवा पर रोगियों को स्वीकार करता है',
    ],
  },
  {
    trial: {
      id: 'trial-003',
      nctId: 'NCT05678903',
      title: 'mHealth Intervention for Rural Diabetes Self-Management',
      titleHi: 'ग्रामीण मधुमेह स्व-प्रबंधन के लिए mHealth हस्तक्षेप',
      summary:
        'A randomized trial evaluating a mobile health platform for improving diabetes self-management and HbA1c outcomes in rural Indian populations.',
      summaryHi:
        'ग्रामीण भारतीय आबादी में मधुमेह स्व-प्रबंधन और HbA1c परिणामों में सुधार के लिए मोबाइल स्वास्थ्य प्लेटफॉर्म का मूल्यांकन करने वाला एक यादृच्छिक परीक्षण।',
      phase: 'Phase 3',
      status: 'Enrolling by Invitation',
      conditions: ['Type 2 Diabetes', 'Digital Health'],
      sponsor: 'Indian Council of Medical Research',
      locations: [
        { facility: 'PHC Agra', city: 'Agra', state: 'Uttar Pradesh', distance: 120 },
      ],
    },
    matchScore: 0.65,
    eligible: true,
    matchReasons: [
      'Matches your condition: Type 2 Diabetes',
      'Mobile-based intervention suitable for remote participation',
    ],
  },
  {
    trial: {
      id: 'trial-004',
      nctId: 'NCT05678904',
      title: 'Yoga and Meditation for Stress-Related Hypertension',
      titleHi: 'तनाव-संबंधित उच्च रक्तचाप के लिए योग और ध्यान',
      summary:
        'Evaluating structured yoga and meditation programs as complementary therapy for stress-related hypertension in urban adults.',
      summaryHi:
        'शहरी वयस्कों में तनाव-संबंधित उच्च रक्तचाप के लिए पूरक चिकित्सा के रूप में संरचित योग और ध्यान कार्यक्रमों का मूल्यांकन।',
      phase: 'Phase 2',
      status: 'Recruiting',
      conditions: ['Hypertension', 'Stress'],
      sponsor: 'NIMHANS Bangalore',
      locations: [
        { facility: 'NIMHANS', city: 'Bangalore', state: 'Karnataka', distance: 200 },
      ],
    },
    matchScore: 0.55,
    eligible: true,
    matchReasons: [
      'Matches related condition: Hypertension',
      'Non-pharmacological intervention',
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientHomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as PatientUser | null;
  const { language } = useTranslation();
  const matches = useTrialStore((s) => s.matches);
  const setMatches = useTrialStore((s) => s.setMatches);

  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load mock matches on mount
  useEffect(() => {
    if (!initialized) {
      setMatches(MOCK_MATCHES);
      setInitialized(true);
    }
  }, [initialized, setMatches]);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setLoading(true);
    refreshTimerRef.current = setTimeout(() => {
      setMatches(MOCK_MATCHES);
      setLoading(false);
    }, 1000);
  }, [setMatches]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const displayMatches = matches;
  const userName = user?.name ?? 'Patient';

  return (
    <div>
      {/* Greeting */}
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: 'none',
          position: 'relative',
          overflow: 'hidden',
        }}
        className="greeting-card"
        styles={{ body: { padding: '24px 32px', position: 'relative', zIndex: 1 } }}
      >
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        <Typography.Title level={3} style={{ color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
          {language === 'hi'
            ? `वापसी पर स्वागत है, ${userName}!`
            : `Welcome back, ${userName}!`}
        </Typography.Title>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          {language === 'hi'
            ? 'आपके लिए मिलान किए गए क्लिनिकल ट्रायल नीचे देखें'
            : 'View your matched clinical trials below'}
        </Typography.Text>
      </Card>

      {/* Trial Matches Section */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          {language === 'hi'
            ? `ट्रायल मैच (${displayMatches.length})`
            : `Trial Matches (${displayMatches.length})`}
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={loading}
        >
          {language === 'hi' ? 'रीफ्रेश करें' : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            {language === 'hi'
              ? 'मैच अपडेट कर रहे हैं...'
              : 'Updating matches...'}
          </Typography.Text>
        </div>
      ) : displayMatches.length === 0 ? (
        <Card>
          <Empty
            description={
              <Space direction="vertical" size={8}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {language === 'hi'
                    ? 'अभी कोई मैच नहीं'
                    : 'No matches yet'}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {language === 'hi'
                    ? 'हम आपकी प्रोफाइल के आधार पर लगातार नए ट्रायल खोज रहे हैं। जल्द ही आपको सूचित किया जाएगा!'
                    : 'We are continuously searching for new trials based on your profile. You will be notified soon!'}
                </Typography.Text>
              </Space>
            }
          />
        </Card>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {displayMatches.map((match) => (
            <TrialCard
              key={match.trial.id}
              id={match.trial.id}
              title={
                language === 'hi' && match.trial.titleHi
                  ? match.trial.titleHi
                  : match.trial.title
              }
              summary={
                language === 'hi' && match.trial.summaryHi
                  ? match.trial.summaryHi
                  : match.trial.summary
              }
              phase={match.trial.phase}
              status={match.trial.status}
              conditions={match.trial.conditions}
              matchScore={match.matchScore}
              location={
                match.trial.locations?.[0]
                  ? `${match.trial.locations[0].city}, ${match.trial.locations[0].state}`
                  : undefined
              }
              sponsor={match.trial.sponsor}
              onClick={(id) => router.push(`/patient/trials/${id}`)}
            />
          ))}
        </Space>
      )}
    </div>
  );
}
