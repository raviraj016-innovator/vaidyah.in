'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Tabs,
  Tag,
  Button,
  List,
  Space,
  Badge,
  Spin,
  Empty,
  App,
  Progress,
} from 'antd';
import {
  HeartOutlined,
  ThunderboltOutlined,
  ExperimentOutlined,
  CloudOutlined,
  AlertOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined,
  MobileOutlined,
  AppleOutlined,
  AndroidOutlined,
  WarningOutlined,
  ReloadOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/lib/i18n/use-translation';
import { PageHeader } from '@/components/ui/page-header';
import api from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

// ---------------------------------------------------------------------------
// Health Metric types
// ---------------------------------------------------------------------------

interface HealthMetric {
  key: string;
  label: string;
  labelHi: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  color: string;
  status: 'normal' | 'warning' | 'critical';
  lastUpdated: string;
}

interface HealthAlert {
  id: string;
  metric: string;
  metricHi: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  messageHi: string;
  normalRange: string;
  timestamp: string;
  acknowledged: boolean;
}

interface WearableDevice {
  id: string;
  name: string;
  platform: 'apple_health' | 'google_fit' | 'fitbit';
  connected: boolean;
  lastSync: string | null;
  icon: React.ReactNode;
}


const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
};

const STATUS_COLORS: Record<string, string> = {
  normal: '#10b981',
  warning: '#f59e0b',
  critical: '#dc2626',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthDataPage() {
  const { language } = useTranslation();
  const { message } = App.useApp();

  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [devices, setDevices] = useState<WearableDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingDevice, setSyncingDevice] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoints.patientHealth.summary);
      if (Array.isArray(data?.metrics)) setMetrics(data.metrics);
      if (Array.isArray(data?.alerts)) setAlerts(data.alerts);
      if (Array.isArray(data?.devices)) setDevices(data.devices);
    } catch (err) {
      console.error('Failed to fetch health data:', err);
      message.error(
        language === 'hi' ? 'डेटा लोड करने में विफल' : 'Failed to load health data',
      );
    }
    setLoading(false);
  }, [language]);

  const handleSyncDevice = useCallback(async (deviceId: string) => {
    setSyncingDevice(deviceId);
    try {
      await api.post(endpoints.integration.wearableSync, { deviceId });
      message.success(
        language === 'hi' ? 'डेटा सिंक हो गया' : 'Data synced successfully',
      );
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? { ...d, lastSync: new Date().toISOString() }
            : d,
        ),
      );
    } catch (err) {
      console.error('Failed to sync device:', err);
      message.error(
        language === 'hi' ? 'सिंक विफल' : 'Sync failed',
      );
    }
    setSyncingDevice(null);
  }, [language]);

  const handleConnectDevice = useCallback(async (deviceId: string) => {
    try {
      await api.post(endpoints.patientHealth.wearables, { deviceId, action: 'connect' });
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId ? { ...d, connected: true } : d,
        ),
      );
      message.success(
        language === 'hi' ? 'डिवाइस कनेक्ट हो गया' : 'Device connected',
      );
    } catch (err) {
      console.error('Failed to connect device:', err);
      message.error(
        language === 'hi' ? 'कनेक्शन विफल' : 'Failed to connect device',
      );
    }
  }, [language]);

  const handleAcknowledgeAlert = useCallback((alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a,
      ),
    );
    // Sync to backend
    api.post(endpoints.patientHealth.alertAcknowledge(alertId)).catch((err) =>
      console.error('Failed to acknowledge alert:', err),
    );
  }, []);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  // -----------------------------------------------------------------------
  // Tab: Overview
  // -----------------------------------------------------------------------
  const overviewTab = (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        {metrics.map((metric) => (
          <Col xs={12} sm={8} md={6} key={metric.key}>
            <Card
              size="small"
              style={{
                borderLeft: `3px solid ${metric.color}`,
                height: '100%',
              }}
              styles={{ body: { padding: '12px 16px' } }}
            >
              <Space size={4} style={{ marginBottom: 4 }}>
                <span style={{ color: metric.color, fontSize: 16 }}>{metric.icon}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {language === 'hi' ? metric.labelHi : metric.label}
                </Typography.Text>
              </Space>
              <div style={{ marginBottom: 4 }}>
                <Typography.Text strong style={{ fontSize: 22, lineHeight: 1.2 }}>
                  {metric.value}
                </Typography.Text>
                {metric.unit && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                    {metric.unit}
                  </Typography.Text>
                )}
              </div>
              <Tag
                color={STATUS_COLORS[metric.status]}
                style={{ fontSize: 10, padding: '0 6px', lineHeight: '18px' }}
              >
                {metric.status === 'normal'
                  ? (language === 'hi' ? 'सामान्य' : 'Normal')
                  : metric.status === 'warning'
                    ? (language === 'hi' ? 'चेतावनी' : 'Warning')
                    : (language === 'hi' ? 'गंभीर' : 'Critical')}
              </Tag>
              <div style={{ marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                  {metric.lastUpdated ? new Date(metric.lastUpdated).toLocaleTimeString(
                    language === 'hi' ? 'hi-IN' : 'en-IN',
                    { hour: '2-digit', minute: '2-digit' },
                  ) : 'N/A'}
                </Typography.Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </Spin>
  );

  // -----------------------------------------------------------------------
  // Tab: Alerts
  // -----------------------------------------------------------------------
  const alertsTab = (
    <List
      dataSource={alerts}
      locale={{
        emptyText: (
          <Empty
            description={
              language === 'hi' ? 'कोई स्वास्थ्य अलर्ट नहीं' : 'No health alerts'
            }
          />
        ),
      }}
      renderItem={(alert) => (
        <List.Item
          style={{
            background: alert.acknowledged ? '#fafafa' : '#fff',
            borderLeft: `4px solid ${SEVERITY_COLORS[alert.severity]}`,
            borderRadius: 8,
            marginBottom: 12,
            padding: '16px 20px',
          }}
          actions={
            !alert.acknowledged
              ? [
                  <Button
                    key="ack"
                    size="small"
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                  >
                    {language === 'hi' ? 'स्वीकार करें' : 'Acknowledge'}
                  </Button>,
                ]
              : [
                  <Tag key="acked" color="default" style={{ fontSize: 11 }}>
                    <CheckCircleOutlined /> {language === 'hi' ? 'स्वीकृत' : 'Acknowledged'}
                  </Tag>,
                ]
          }
        >
          <List.Item.Meta
            avatar={
              <AlertOutlined
                style={{ fontSize: 20, color: SEVERITY_COLORS[alert.severity] }}
              />
            }
            title={
              <Space>
                <Typography.Text strong>
                  {language === 'hi' ? alert.metricHi : alert.metric}
                </Typography.Text>
                <Tag
                  color={SEVERITY_COLORS[alert.severity]}
                  style={{ fontSize: 10, padding: '0 6px' }}
                >
                  {(alert.severity ?? '').toUpperCase()}
                </Tag>
              </Space>
            }
            description={
              <Space direction="vertical" size={2}>
                <Typography.Text style={{ fontSize: 13 }}>
                  {language === 'hi' ? alert.messageHi : alert.message}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {language === 'hi' ? 'सामान्य सीमा' : 'Normal range'}: {alert.normalRange}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {new Date(alert.timestamp).toLocaleString(
                    language === 'hi' ? 'hi-IN' : 'en-IN',
                    { dateStyle: 'medium', timeStyle: 'short' },
                  )}
                </Typography.Text>
              </Space>
            }
          />
        </List.Item>
      )}
    />
  );

  // -----------------------------------------------------------------------
  // Tab: Devices
  // -----------------------------------------------------------------------
  const devicesTab = (
    <List
      dataSource={devices}
      renderItem={(device) => (
        <List.Item
          style={{
            background: '#fff',
            borderRadius: 8,
            marginBottom: 12,
            padding: '16px 20px',
            border: '1px solid #f0f0f0',
          }}
          actions={[
            device.connected ? (
              <Button
                key="sync"
                type="primary"
                size="small"
                icon={<SyncOutlined spin={syncingDevice === device.id} />}
                loading={syncingDevice === device.id}
                onClick={() => handleSyncDevice(device.id)}
              >
                {language === 'hi' ? 'सिंक करें' : 'Sync'}
              </Button>
            ) : (
              <Button
                key="connect"
                type="primary"
                size="small"
                icon={<ApiOutlined />}
                onClick={() => handleConnectDevice(device.id)}
              >
                {language === 'hi' ? 'कनेक्ट करें' : 'Connect'}
              </Button>
            ),
          ]}
        >
          <List.Item.Meta
            avatar={
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: device.connected ? '#f0fdf4' : '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  color: device.connected ? '#16a34a' : '#9ca3af',
                }}
              >
                {device.icon}
              </div>
            }
            title={
              <Space>
                <Typography.Text strong>{device.name}</Typography.Text>
                <Tag color={device.connected ? 'success' : 'default'} style={{ fontSize: 11 }}>
                  {device.connected
                    ? (language === 'hi' ? 'कनेक्टेड' : 'Connected')
                    : (language === 'hi' ? 'डिस्कनेक्टेड' : 'Disconnected')}
                </Tag>
              </Space>
            }
            description={
              device.lastSync ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {language === 'hi' ? 'अंतिम सिंक' : 'Last synced'}:{' '}
                  {new Date(device.lastSync).toLocaleString(
                    language === 'hi' ? 'hi-IN' : 'en-IN',
                    { dateStyle: 'medium', timeStyle: 'short' },
                  )}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {language === 'hi' ? 'कभी सिंक नहीं हुआ' : 'Never synced'}
                </Typography.Text>
              )
            }
          />
        </List.Item>
      )}
    />
  );

  return (
    <div>
      <PageHeader
        title={language === 'hi' ? 'स्वास्थ्य डेटा' : 'Health Data'}
        subtitle={
          language === 'hi'
            ? 'आपके स्वास्थ्य मेट्रिक्स और वेयरेबल डिवाइस'
            : 'Your health metrics and wearable devices'
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            {language === 'hi' ? 'रिफ्रेश' : 'Refresh'}
          </Button>
        }
      />

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: (
              <Space>
                <HeartOutlined />
                {language === 'hi' ? 'अवलोकन' : 'Overview'}
              </Space>
            ),
            children: overviewTab,
          },
          {
            key: 'alerts',
            label: (
              <Space>
                <Badge count={unacknowledgedCount} size="small" offset={[6, -2]}>
                  <AlertOutlined />
                </Badge>
                {language === 'hi' ? 'अलर्ट' : 'Alerts'}
              </Space>
            ),
            children: alertsTab,
          },
          {
            key: 'devices',
            label: (
              <Space>
                <ApiOutlined />
                {language === 'hi' ? 'डिवाइस' : 'Devices'}
              </Space>
            ),
            children: devicesTab,
          },
        ]}
      />
    </div>
  );
}
