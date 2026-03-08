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
} from 'antd';
import {
  ReloadOutlined,
  HeartOutlined,
  HeartFilled,
  CloseOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, PatientUser } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore, TrialMatch } from '@/stores/trial-store';
import { TrialCard } from '@/components/data-display/trial-card';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';

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
  const { data: fetchedMatches, isLoading: loading, refetch } = useQuery({
    queryKey: ['patient', 'matches', patientId],
    queryFn: fetchWithFallback<TrialMatch[]>(
      patientId ? endpoints.trials.patientMatches(patientId) : endpoints.trials.matches,
    ),
    staleTime: 60_000,
    enabled: !!user,
  });

  useEffect(() => {
    if (fetchedMatches) setMatches(fetchedMatches);
  }, [fetchedMatches, setMatches]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Filter out dismissed trials
  const displayMatches = matches.filter(
    (m) => !dismissedMatchIds.includes(m.trial.id),
  );

  const handleSaveMatch = useCallback(
    (trialId: string) => {
      saveMatch(trialId);
      message.success(
        language === 'hi' ? 'ट्रायल सेव किया गया' : 'Trial saved',
      );
    },
    [saveMatch, language, message],
  );

  const handleDismissMatch = useCallback(
    (trialId: string) => {
      dismissMatch(trialId);
      message.info(
        language === 'hi' ? 'ट्रायल हटाया गया' : 'Trial dismissed',
      );
    },
    [dismissMatch, language, message],
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
      )}
    </div>
  );
}
