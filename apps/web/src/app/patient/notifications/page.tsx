'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n/use-translation';
import { useTrialStore, Notification } from '@/stores/trial-store';
import { PageHeader } from '@/components/ui/page-header';
import { fetchWithFallback } from '@/lib/api/query-helpers';
import { endpoints } from '@/lib/api/endpoints';
import api from '@/lib/api/client';


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
    markNotificationRead,
    markAllRead,
    getUnreadCount,
  } = useTrialStore();

  const [initialized, setInitialized] = useState(false);

  const setNotifications = useTrialStore((s) => s.setNotifications);

  const { data: fetchedNotifications } = useQuery({
    queryKey: ['patient', 'notifications'],
    queryFn: fetchWithFallback<Notification[]>(endpoints.notifications.list),
    staleTime: 30_000,
  });

  // Sync fetched data into store
  useEffect(() => {
    if (!initialized && fetchedNotifications) {
      setNotifications(fetchedNotifications);
      setInitialized(true);
    }
  }, [initialized, fetchedNotifications, setNotifications]);

  const displayNotifications = notifications;

  const unreadCount = getUnreadCount();

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      // Optimistic update
      markNotificationRead(notification.id);
      // Sync read status to backend — rollback on failure
      api.post(endpoints.notifications.markRead(notification.id)).catch((err) => {
        console.error('Failed to mark notification read:', err);
        // Rollback: mark as unread again in store
        const updated = notifications.map((n) =>
          n.id === notification.id ? { ...n, read: false } : n,
        );
        setNotifications(updated);
      });
      if (notification.trialId) {
        router.push(`/patient/trials/${encodeURIComponent(notification.trialId)}`);
      }
    },
    [markNotificationRead, notifications, setNotifications, router],
  );

  const handleMarkAllRead = useCallback(() => {
    const prevNotifications = [...notifications];
    // Optimistic update
    markAllRead();
    // Sync to backend — rollback on failure
    api.post(endpoints.notifications.markAllRead).catch((err) => {
      console.error('Failed to mark all notifications read:', err);
      setNotifications(prevNotifications);
    });
  }, [markAllRead, notifications, setNotifications]);

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
              onClick={handleMarkAllRead}
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
