import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ServerIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { api, endpoints } from '@/config/api';
import { StatsCard } from '@/components/StatsCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  version: string;
  lastChecked: string;
  responseTimeMs: number;
}

interface ResponseTimePoint {
  timestamp: string;
  apiGateway: number;
  clinicalService: number;
  voiceService: number;
  nluService: number;
  trialService: number;
}

interface ErrorRateEntry {
  service: string;
  rate: number;
  count: number;
  total: number;
}

interface AlertEntry {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  service: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  healthy: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: CheckCircleIcon,
    dot: 'bg-green-500',
    label: 'Healthy',
  },
  degraded: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    icon: ExclamationTriangleIcon,
    dot: 'bg-yellow-500',
    label: 'Degraded',
  },
  down: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: XCircleIcon,
    dot: 'bg-red-500',
    label: 'Down',
  },
} as const;

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-700' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
} as const;

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="card p-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="bg-gray-100 rounded" style={{ height }} />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-4 bg-gray-200 rounded-full" />
            <div className="h-4 flex-1 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SystemPage() {
  const servicesQuery = useQuery<ServiceStatus[]>({
    queryKey: ['system', 'services'],
    queryFn: () => api.get(endpoints.system.services).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const responseQuery = useQuery<ResponseTimePoint[]>({
    queryKey: ['system', 'responseTimes'],
    queryFn: () =>
      api.get(endpoints.system.responseTimes).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const errorQuery = useQuery<ErrorRateEntry[]>({
    queryKey: ['system', 'errorRates'],
    queryFn: () => api.get(endpoints.system.errorRates).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const alertsQuery = useQuery<AlertEntry[]>({
    queryKey: ['system', 'alerts'],
    queryFn: () => api.get(endpoints.system.alerts).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const services = servicesQuery.data ?? [];
  const healthyCount = services.filter((s) => s.status === 'healthy').length;
  const degradedCount = services.filter((s) => s.status === 'degraded').length;
  const downCount = services.filter((s) => s.status === 'down').length;
  const avgResponseTime =
    services.length > 0
      ? Math.round(
          services.reduce((s, svc) => s + svc.responseTimeMs, 0) /
            services.length,
        )
      : null;
  const activeAlerts = (alertsQuery.data ?? []).filter((a) => !a.resolved);
  const kpiLoading = servicesQuery.isLoading || alertsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">System Health</h1>
        <p className="page-subtitle">
          Monitor platform services, performance, and alerts.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Services Healthy"
          value={`${healthyCount} / ${services.length}`}
          icon={ServerIcon}
          iconColor="text-green-600"
          iconBgColor="bg-green-50"
          loading={kpiLoading}
        />
        <StatsCard
          title="Avg Response Time"
          value={avgResponseTime != null ? `${avgResponseTime} ms` : '--'}
          icon={ClockIcon}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-50"
          loading={kpiLoading}
        />
        <StatsCard
          title="Active Alerts"
          value={activeAlerts.length}
          icon={ExclamationTriangleIcon}
          iconColor={activeAlerts.length > 0 ? 'text-red-600' : 'text-gray-400'}
          iconBgColor={activeAlerts.length > 0 ? 'bg-red-50' : 'bg-gray-50'}
          loading={kpiLoading}
        />
        <StatsCard
          title="Services Degraded / Down"
          value={degradedCount + downCount === 0 ? 'None' : `${degradedCount + downCount}`}
          icon={SignalIcon}
          iconColor={
            downCount > 0
              ? 'text-red-600'
              : degradedCount > 0
                ? 'text-yellow-600'
                : 'text-green-600'
          }
          iconBgColor={
            downCount > 0
              ? 'bg-red-50'
              : degradedCount > 0
                ? 'bg-yellow-50'
                : 'bg-green-50'
          }
          loading={kpiLoading}
        />
      </div>

      {/* Service Status Grid */}
      {servicesQuery.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Service Status
          </h2>
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header px-4 py-3">Service</th>
                  <th className="table-header px-4 py-3">Status</th>
                  <th className="table-header px-4 py-3">Uptime</th>
                  <th className="table-header px-4 py-3">Response</th>
                  <th className="table-header px-4 py-3">Version</th>
                  <th className="table-header px-4 py-3">Last Checked</th>
                </tr>
              </thead>
              <tbody>
                {services.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="table-cell text-center text-gray-500 py-8"
                    >
                      No service data available
                    </td>
                  </tr>
                )}
                {services.map((svc) => {
                  const cfg = STATUS_CONFIG[svc.status];
                  return (
                    <tr key={svc.name} className="table-row">
                      <td className="table-cell font-medium">{svc.name}</td>
                      <td className="table-cell">
                        <span
                          className={`badge ${cfg.bg} ${cfg.text}`}
                        >
                          <span
                            className={`inline-block w-2 h-2 rounded-full mr-1.5 ${cfg.dot}`}
                          />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="table-cell">{svc.uptime}</td>
                      <td className="table-cell">
                        <span
                          className={
                            svc.responseTimeMs > 1000
                              ? 'text-red-600 font-medium'
                              : svc.responseTimeMs > 500
                                ? 'text-yellow-600'
                                : ''
                          }
                        >
                          {svc.responseTimeMs} ms
                        </span>
                      </td>
                      <td className="table-cell text-gray-500">
                        {svc.version}
                      </td>
                      <td className="table-cell text-gray-400 text-xs">
                        {new Date(svc.lastChecked).toLocaleTimeString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row: Response Time Trend + Error Rates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {responseQuery.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Response Times (Last 24h)
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={responseQuery.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => `${v}ms`}
                />
                <Tooltip
                  labelFormatter={(v: string) =>
                    new Date(v).toLocaleString('en-IN')
                  }
                  formatter={(v: number) => [`${v} ms`]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="apiGateway"
                  name="API Gateway"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="clinicalService"
                  name="Clinical"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="voiceService"
                  name="Voice"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="nluService"
                  name="NLU"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="trialService"
                  name="Trial"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {errorQuery.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Error Rates by Service
            </h2>
            <div className="space-y-3">
              {(errorQuery.data ?? []).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">
                  No error data available
                </p>
              )}
              {(errorQuery.data ?? []).map((entry) => (
                <div key={entry.service} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      {entry.service}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        entry.rate > 5
                          ? 'text-red-600'
                          : entry.rate > 1
                            ? 'text-yellow-600'
                            : 'text-green-600'
                      }`}
                    >
                      {entry.rate.toFixed(2)}% ({entry.count}/{entry.total})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        entry.rate > 5
                          ? 'bg-red-500'
                          : entry.rate > 1
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(entry.rate * 10, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active Alerts */}
      {alertsQuery.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Recent Alerts
          </h2>
          {(alertsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No alerts
            </p>
          ) : (
            <div className="space-y-2">
              {(alertsQuery.data ?? []).map((alert) => {
                const cfg = SEVERITY_CONFIG[alert.severity];
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${cfg.bg} ${cfg.border} ${alert.resolved ? 'opacity-50' : ''}`}
                  >
                    <span className={`badge ${cfg.badge} mt-0.5`}>
                      {alert.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${cfg.text}`}>
                        {alert.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {alert.service} &middot;{' '}
                        {new Date(alert.timestamp).toLocaleString('en-IN')}
                        {alert.resolved && ' (resolved)'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
