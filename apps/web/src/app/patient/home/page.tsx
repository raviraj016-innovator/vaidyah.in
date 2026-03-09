'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Space,
  Button,
  Spin,
  Empty,
  Card,
  App,
  Tag,
} from 'antd';
import {
  ReloadOutlined,
  HeartOutlined,
  HeartFilled,
  CloseOutlined,
  MedicineBoxOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, PatientUser } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore, TrialMatch } from '@/stores/trial-store';
import { TrialCard } from '@/components/data-display/trial-card';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrialSearchResponse {
  total: number;
  page: number;
  page_size: number;
  trials: Array<{
    nct_id: string;
    title: string;
    brief_title?: string;
    overall_status?: string;
    phase?: string;
    conditions?: string[];
    sponsor?: string;
    enrollment_count?: number;
    start_date?: string;
    locations_count?: number;
    score?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientHomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user) as PatientUser | null;
  const { language } = useTranslation();
  const { message } = App.useApp();
  const matches = useTrialStore((s) => s.matches);
  const setMatches = useTrialStore((s) => s.setMatches);
  const dismissedMatchIds = useTrialStore((s) => s.dismissedMatchIds);
  const saveMatch = useTrialStore((s) => s.saveMatch);
  const dismissMatch = useTrialStore((s) => s.dismissMatch);

  const patientId = user?.id ?? '';
  const conditions = user?.conditions ?? [];

  // Fetch pre-computed matches
  const { data: fetchedMatches, isLoading: loading, refetch } = useQuery({
    queryKey: ['patient', 'matches', patientId],
    queryFn: fetchWithFallback<TrialMatch[]>(
      patientId ? endpoints.trials.patientMatches(patientId) : endpoints.trials.matches,
    ),
    staleTime: 60_000,
    enabled: !!user,
  });

  // Fetch condition-based trials when patient has conditions
  const { data: searchResults, isLoading: searchLoading, refetch: refetchSearch } = useQuery({
    queryKey: ['patient', 'condition-trials', conditions],
    queryFn: fetchWithFallback<TrialSearchResponse>(
      endpoints.trials.search,
      undefined,
      { params: { conditions, statuses: ['Recruiting'], page_size: 10 } },
    ),
    staleTime: 5 * 60_000,
    enabled: !!user && conditions.length > 0,
  });

  useEffect(() => {
    if (fetchedMatches) setMatches(fetchedMatches);
  }, [fetchedMatches, setMatches]);

  const handleRefresh = useCallback(() => {
    refetch();
    if (conditions.length > 0) refetchSearch();
  }, [refetch, refetchSearch, conditions.length]);

  // Filter out dismissed trials
  const displayMatches = matches.filter(
    (m) => !dismissedMatchIds.includes(m.trial.id ?? m.trial.nct_id ?? ''),
  );

  // Map search results to display format
  const conditionTrials = (searchResults?.trials ?? [])
    .filter((t) => !dismissedMatchIds.includes(t.nct_id))
    .map((t) => ({
      id: t.nct_id,
      title: t.title,
      summary: t.brief_title,
      phase: t.phase,
      status: t.overall_status,
      conditions: t.conditions,
      sponsor: t.sponsor,
      score: t.score,
    }));

  const hasMatches = displayMatches.length > 0;
  const hasConditionTrials = conditionTrials.length > 0;

  const handleSaveMatch = useCallback(
    (trialId: string) => {
      saveMatch(trialId);
      message.success(
        language === 'hi' ? 'ट्रायल सेव किया गया' : 'Trial saved',
      );
    },
    [saveMatch, language],
  );

  const handleDismissMatch = useCallback(
    (trialId: string) => {
      dismissMatch(trialId);
      message.info(
        language === 'hi' ? 'ट्रायल हटाया गया' : 'Trial dismissed',
      );
    },
    [dismissMatch, language],
  );
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

      {/* Patient Conditions */}
      {conditions.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Space size={8}>
              <MedicineBoxOutlined style={{ color: '#7c3aed' }} />
              <Typography.Text strong>
                {language === 'hi' ? 'आपकी स्वास्थ्य स्थितियाँ' : 'Your Conditions'}
              </Typography.Text>
            </Space>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => router.push('/patient/profile')}
            >
              {language === 'hi' ? 'संपादित करें' : 'Edit'}
            </Button>
          </div>
          <Space wrap size={[6, 6]}>
            {conditions.map((c) => (
              <Tag key={c} color="purple">{c}</Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* Prompt to add conditions if none exist */}
      {conditions.length === 0 && !loading && displayMatches.length === 0 && (
        <Card style={{ marginBottom: 16, textAlign: 'center', padding: '12px 0' }}>
          <MedicineBoxOutlined style={{ fontSize: 32, color: '#9ca3af', marginBottom: 8 }} />
          <Typography.Title level={5} style={{ margin: '0 0 4px' }}>
            {language === 'hi'
              ? 'अपनी स्वास्थ्य स्थितियाँ जोड़ें'
              : 'Add Your Health Conditions'}
          </Typography.Title>
          <Typography.Text type="secondary">
            {language === 'hi'
              ? 'प्रासंगिक क्लिनिकल ट्रायल से मिलान के लिए अपनी प्रोफ़ाइल में स्थितियाँ जोड़ें।'
              : 'Add conditions in your profile to get matched with relevant clinical trials.'}
          </Typography.Text>
          <br />
          <Button type="primary" onClick={() => router.push('/patient/profile')} style={{ marginTop: 12 }}>
            {language === 'hi' ? 'प्रोफ़ाइल पर जाएँ' : 'Go to Profile'}
          </Button>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            {language === 'hi'
              ? 'मैच अपडेट कर रहे हैं...'
              : 'Updating matches...'}
          </Typography.Text>
        </div>
      ) : displayMatches.length > 0 ? (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {language === 'hi'
                ? `ट्रायल मैच (${displayMatches.length})`
                : `Trial Matches (${displayMatches.length})`}
            </Typography.Title>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading || searchLoading}
            >
              {language === 'hi' ? 'रीफ्रेश करें' : 'Refresh'}
            </Button>
          </div>
          {displayMatches.map((match) => (
            <div key={match.trial.id} style={{ position: 'relative' }}>
              <TrialCard
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
              {/* Save / Dismiss actions */}
              <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}>
                <Space size={4}>
                  <Button
                    type="text"
                    size="small"
                    icon={match.saved ? <HeartFilled style={{ color: '#dc2626' }} /> : <HeartOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleSaveMatch(match.trial.id); }}
                    title={language === 'hi' ? 'सेव करें' : 'Save'}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined style={{ color: '#9ca3af' }} />}
                    onClick={(e) => { e.stopPropagation(); handleDismissMatch(match.trial.id); }}
                    title={language === 'hi' ? 'हटाएं' : 'Dismiss'}
                  />
                </Space>
              </div>
            </div>
          ))}
        </Space>
      ) : null}

      {/* Condition-based trial suggestions (when no pre-computed matches) */}
      {!hasMatches && !loading && conditions.length > 0 && (
        <>
          {searchLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                {language === 'hi'
                  ? 'आपकी स्थितियों के लिए ट्रायल खोज रहे हैं...'
                  : 'Searching trials for your conditions...'}
              </Typography.Text>
            </div>
          ) : hasConditionTrials ? (
            <>
              <Typography.Title level={4} style={{ margin: '24px 0 4px' }}>
                {language === 'hi'
                  ? `आपकी स्थितियों के लिए सुझाए गए ट्रायल (${conditionTrials.length})`
                  : `Suggested Trials for Your Conditions (${conditionTrials.length})`}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                {language === 'hi'
                  ? 'ये भर्ती कर रहे ट्रायल आपकी स्वास्थ्य स्थितियों से मेल खाते हैं'
                  : 'Recruiting trials matching your health conditions'}
              </Typography.Text>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {conditionTrials.map((t) => (
                  <TrialCard
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    summary={t.summary}
                    phase={t.phase}
                    status={t.status}
                    conditions={t.conditions}
                    matchScore={t.score != null ? t.score : undefined}
                    sponsor={t.sponsor}
                    onClick={(id) => router.push(`/patient/trials/${id}`)}
                  />
                ))}
              </Space>
            </>
          ) : (
            <Card>
              <Empty
                description={
                  <Space direction="vertical" size={8}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      {language === 'hi'
                        ? 'अभी कोई मैच नहीं'
                        : 'No matching trials found'}
                    </Typography.Title>
                    <Typography.Text type="secondary">
                      {language === 'hi'
                        ? 'आपकी स्थितियों के लिए अभी कोई भर्ती ट्रायल उपलब्ध नहीं है। हम लगातार खोज रहे हैं!'
                        : 'No recruiting trials match your conditions right now. We\'ll keep searching!'}
                    </Typography.Text>
                  </Space>
                }
              />
            </Card>
          )}
        </>
      )}

    </div>
  );
}
