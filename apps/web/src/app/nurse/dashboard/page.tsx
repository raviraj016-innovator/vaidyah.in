'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';
import Link from 'next/link';
import {
  Row,
  Col,
  Card,
  Typography,
  Space,
  Button,
  Alert,
} from 'antd';
import {
  UserAddOutlined,
  AlertOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useAuthStore, NurseUser } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n/use-translation';
import { StatsCard } from '@/components/ui/stats-card';

export default function NurseDashboardPage() {
  const user = useAuthStore((s) => s.user) as NurseUser | null;
  const { t, language } = useTranslation();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return language === 'hi' ? 'सुप्रभात' : 'Good morning';
    } else if (hour < 17) {
      return language === 'hi' ? 'नमस्कार' : 'Good afternoon';
    }
    return language === 'hi' ? 'शुभ संध्या' : 'Good evening';
  }, [language]);

  const userName = user?.name ?? 'Nurse';
  const centerName = user?.centerName ?? 'Health Center';

  const mockStats = { patientsSeen: 12, pendingTriage: 3, emergencies: 1 };
  const { data: stats = mockStats } = useQuery({
    queryKey: ['nurse', 'dashboard', 'stats'],
    queryFn: fetchWithFallback(endpoints.nurseDashboard.stats, mockStats),
    staleTime: 30_000,
  });

  return (
    <div>
      {/* Greeting Banner */}
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
          {greeting}, {userName}!
        </Typography.Title>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>
          {centerName} &bull;{' '}
          {new Date().toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Typography.Text>
      </Card>

      {/* Quick Actions */}
      <Typography.Title level={5} style={{ marginBottom: 16 }}>
        {language === 'hi' ? 'त्वरित कार्य' : 'Quick Actions'}
      </Typography.Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12}>
          <Link href="/nurse/patient-intake" prefetch style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <Card
              hoverable
              style={{ minHeight: 120 }}
              styles={{ body: { padding: 20 } }}
            >
              <Space size={16} align="start">
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <UserAddOutlined style={{ fontSize: 28, color: '#7c3aed' }} />
                </div>
                <div>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {language === 'hi' ? 'नया रोगी' : 'New Patient'}
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {language === 'hi'
                      ? 'रोगी का पंजीकरण और परामर्श शुरू करें'
                      : 'Register patient and start consultation'}
                  </Typography.Text>
                </div>
              </Space>
            </Card>
          </Link>
        </Col>
        <Col xs={24} sm={12}>
          <Link href="/nurse/emergency-alert/new" prefetch style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <Card
              hoverable
              style={{
                minHeight: 120,
                background: '#fef2f2',
                borderColor: '#fecaca',
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Space size={16} align="start">
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertOutlined style={{ fontSize: 28, color: '#dc2626' }} />
                </div>
                <div>
                  <Typography.Title level={5} style={{ margin: 0, color: '#dc2626' }}>
                    {language === 'hi' ? 'आपातकालीन अलर्ट' : 'Emergency Alert'}
                  </Typography.Title>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {language === 'hi'
                      ? 'गंभीर स्थिति की तुरंत रिपोर्ट करें'
                      : 'Immediately report a critical situation'}
                  </Typography.Text>
                </div>
              </Space>
            </Card>
          </Link>
        </Col>
      </Row>

      {/* Today's Stats */}
      <Typography.Title level={5} style={{ marginBottom: 16 }}>
        {language === 'hi' ? "आज के आँकड़े" : "Today's Stats"}
      </Typography.Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <StatsCard
            title={language === 'hi' ? 'रोगी देखे गए' : 'Patients Seen'}
            value={stats.patientsSeen}
            icon={<TeamOutlined />}
            trend={8}
            trendLabel={language === 'hi' ? 'कल से' : 'vs yesterday'}
            iconColor="#7c3aed"
            iconBgColor="#eef2ff"
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatsCard
            title={language === 'hi' ? 'लंबित ट्राइएज' : 'Pending Triage'}
            value={stats.pendingTriage}
            icon={<ClockCircleOutlined />}
            iconColor="#d97706"
            iconBgColor="#fffbeb"
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatsCard
            title={language === 'hi' ? 'आपातकाल' : 'Emergencies'}
            value={stats.emergencies}
            icon={<WarningOutlined />}
            iconColor="#dc2626"
            iconBgColor="#fef2f2"
          />
        </Col>
      </Row>

      {/* Active emergency alert (mock) */}
      {stats.emergencies > 0 && (
        <Alert
          message={
            language === 'hi'
              ? 'सक्रिय आपातकालीन अलर्ट'
              : 'Active Emergency Alert'
          }
          description={
            language === 'hi'
              ? 'रोगी राम कुमार (उम्र 65) - गंभीर उच्च रक्तचाप, BP 180/110'
              : 'Patient Ram Kumar (Age 65) - Severe Hypertension, BP 180/110'
          }
          type="error"
          showIcon
          action={
            <Link href="/nurse/emergency-alert/session-mock-001">
              <Button size="small" danger>
                {language === 'hi' ? 'देखें' : 'View'}
              </Button>
            </Link>
          }
          style={{ marginBottom: 24 }}
        />
      )}
    </div>
  );
}
