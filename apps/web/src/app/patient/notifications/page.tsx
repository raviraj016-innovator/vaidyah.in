'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  List,
  Typography,
  Space,
  Button,
  Badge,
  Card,
  Empty,
} from 'antd';
import {
  TrophyOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
  BellOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore, Notification } from '@/stores/trial-store';
import { PageHeader } from '@/components/ui/page-header';

// ---------------------------------------------------------------------------
// Mock notifications
// ---------------------------------------------------------------------------

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-001',
    type: 'new_match',
    title: 'New Trial Match!',
    titleHi: 'नया ट्रायल मैच!',
    body: 'A new clinical trial for Type 2 Diabetes management has been matched to your profile with 92% compatibility.',
    bodyHi: 'टाइप 2 मधुमेह प्रबंधन के लिए एक नया क्लिनिकल ट्रायल 92% संगतता के साथ आपकी प्रोफाइल से मेल खाता है।',
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    trialId: 'trial-001',
  },
  {
    id: 'notif-002',
    type: 'trial_update',
    title: 'Trial Status Updated',
    titleHi: 'ट्रायल स्थिति अपडेट',
    body: 'The "Ayurvedic Formulation for Hypertension" trial has started recruiting patients in your area.',
    bodyHi: '"उच्च रक्तचाप के लिए आयुर्वेदिक फॉर्मूलेशन" ट्रायल ने आपके क्षेत्र में रोगियों की भर्ती शुरू कर दी है।',
    read: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    trialId: 'trial-002',
  },
  {
    id: 'notif-003',
    type: 'enrollment_reminder',
    title: 'Enrollment Deadline Approaching',
    titleHi: 'नामांकन की समय सीमा निकट',
    body: 'The diabetes management trial (NCT05678901) enrollment closes in 14 days. Express your interest soon.',
    bodyHi: 'मधुमेह प्रबंधन ट्रायल (NCT05678901) का नामांकन 14 दिनों में बंद हो जाएगा। जल्द ही अपनी रुचि व्यक्त करें।',
    read: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    trialId: 'trial-001',
  },
  {
    id: 'notif-004',
    type: 'general',
    title: 'Welcome to Vaidyah!',
    titleHi: 'वैद्यह में आपका स्वागत है!',
    body: 'Your profile has been set up and we are now matching you with eligible clinical trials. Check back regularly for updates.',
    bodyHi: 'आपकी प्रोफाइल सेट हो गई है और अब हम आपको पात्र क्लिनिकल ट्रायल्स से मिला रहे हैं। अपडेट के लिए नियमित रूप से जाँच करें।',
    read: true,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'notif-005',
    type: 'new_match',
    title: 'Potential Match Found',
    titleHi: 'संभावित मैच मिला',
    body: 'A yoga-based hypertension management trial is now recruiting. Match score: 55%.',
    bodyHi: 'योग-आधारित उच्च रक्तचाप प्रबंधन ट्रायल अब भर्ती कर रहा है। मैच स्कोर: 55%।',
    read: false,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    trialId: 'trial-004',
  },
  {
    id: 'notif-006',
    type: 'trial_update',
    title: 'New Location Added',
    titleHi: 'नया स्थान जोड़ा गया',
    body: 'The mHealth diabetes trial now has a site in Agra. Check if it is convenient for you.',
    bodyHi: 'mHealth मधुमेह ट्रायल का अब आगरा में एक साइट है। जांचें कि क्या यह आपके लिए सुविधाजनक है।',
    read: true,
    createdAt: new Date(Date.now() - 345600000).toISOString(),
    trialId: 'trial-003',
  },
];

// ---------------------------------------------------------------------------
// Helper: relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string, lang: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === 'hi') {
    if (minutes < 1) return 'अभी';
    if (minutes < 60) return `${minutes} मिनट पहले`;
    if (hours < 24) return `${hours} घंटे पहले`;
    if (days < 7) return `${days} दिन पहले`;
    return new Date(dateStr).toLocaleDateString('hi-IN');
  }

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN');
}

// ---------------------------------------------------------------------------
// Icon by type
// ---------------------------------------------------------------------------

const NOTIFICATION_ICONS: Record<Notification['type'], React.ReactNode> = {
  new_match: <TrophyOutlined style={{ fontSize: 20, color: '#d97706' }} />,
  trial_update: <InfoCircleOutlined style={{ fontSize: 20, color: '#2563eb' }} />,
  enrollment_reminder: <ClockCircleOutlined style={{ fontSize: 20, color: '#dc2626' }} />,
  general: <BellOutlined style={{ fontSize: 20, color: '#6b7280' }} />,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const router = useRouter();
  const { language } = useTranslation();
  const {
    notifications,
    addNotification,
    markNotificationRead,
    markAllRead,
    getUnreadCount,
  } = useTrialStore();

  const [initialized, setInitialized] = useState(false);

  const setNotifications = useTrialStore((s) => s.setNotifications);

  // Load mock notifications on mount (single atomic set)
  useEffect(() => {
    if (!initialized && notifications.length === 0) {
      setNotifications(MOCK_NOTIFICATIONS);
      setInitialized(true);
    }
  }, [initialized, notifications.length, setNotifications]);

  const displayNotifications = notifications;

  const unreadCount = getUnreadCount();

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      markNotificationRead(notification.id);
      if (notification.trialId) {
        router.push(`/patient/trials/${encodeURIComponent(notification.trialId)}`);
      }
    },
    [markNotificationRead, router],
  );

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'सूचनाएं' : 'Notifications'}
        subtitle={
          unreadCount > 0
            ? language === 'hi'
              ? `${unreadCount} अपठित`
              : `${unreadCount} unread`
            : language === 'hi'
              ? 'सभी पढ़ी गई'
              : 'All caught up'
        }
        extra={
          unreadCount > 0 ? (
            <Button
              icon={<CheckOutlined />}
              onClick={markAllRead}
            >
              {language === 'hi' ? 'सभी पढ़ा हुआ करें' : 'Mark All Read'}
            </Button>
          ) : undefined
        }
      />

      {displayNotifications.length === 0 ? (
        <Card>
          <Empty
            description={
              language === 'hi'
                ? 'कोई सूचना नहीं'
                : 'No notifications yet'
            }
          />
        </Card>
      ) : (
        <List
          dataSource={displayNotifications}
          renderItem={(notification) => {
            const isUnread = !notification.read;
            return (
              <Card
                hoverable
                onClick={() => handleNotificationClick(notification)}
                style={{
                  marginBottom: 8,
                  borderLeft: isUnread ? '3px solid #7c3aed' : '3px solid transparent',
                  background: isUnread ? '#f8fafc' : '#fff',
                  cursor: notification.trialId ? 'pointer' : 'default',
                }}
                styles={{ body: { padding: '12px 16px' } }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {/* Unread dot + Icon */}
                  <div style={{ position: 'relative', marginTop: 2 }}>
                    {isUnread && (
                      <Badge
                        dot
                        status="processing"
                        offset={[-2, 2]}
                      >
                        {NOTIFICATION_ICONS[notification.type]}
                      </Badge>
                    )}
                    {!isUnread && NOTIFICATION_ICONS[notification.type]}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 4,
                      }}
                    >
                      <Typography.Text
                        strong={isUnread}
                        style={{ fontSize: 14 }}
                      >
                        {language === 'hi' && notification.titleHi
                          ? notification.titleHi
                          : notification.title}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 11, flexShrink: 0, marginLeft: 12 }}
                      >
                        {formatRelativeTime(notification.createdAt, language)}
                      </Typography.Text>
                    </div>
                    <Typography.Paragraph
                      type="secondary"
                      style={{
                        margin: 0,
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                      ellipsis={{ rows: 2 }}
                    >
                      {language === 'hi' && notification.bodyHi
                        ? notification.bodyHi
                        : notification.body}
                    </Typography.Paragraph>
                  </div>
                </div>
              </Card>
            );
          }}
        />
      )}
    </div>
  );
}
