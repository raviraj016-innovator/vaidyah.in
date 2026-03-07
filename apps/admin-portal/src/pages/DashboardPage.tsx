import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  UsersIcon,
  ChatBubbleLeftRightIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  SignalIcon,
  SignalSlashIcon,
} from '@heroicons/react/24/outline';
import { api, endpoints } from '@/config/api';
import { StatsCard } from '@/components/StatsCard';

interface KpiData {
  totalPatients: number;
  totalPatientsTrend: number;
  activeConsultationsToday: number;
  activeConsultationsTrend: number;
  activeCenters: number;
  activeCentersTrend: number;
  triageAccuracy: number;
  triageAccuracyTrend: number;
}

interface TrendPoint {
  date: string;
  consultations: number;
}

interface TriageLevel {
  level: string;
  count: number;
}

interface TopCondition {
  condition: string;
  count: number;
}

interface CenterStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded';
  district: string;
  lastSeen: string;
  consultationsToday: number;
}

const TRIAGE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#eab308',
  C: '#ef4444',
};

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="card p-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="bg-gray-100 rounded" style={{ height }} />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="card p-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const kpisQuery = useQuery<KpiData>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => api.get(endpoints.dashboard.kpis).then((r) => r.data),
  });

  const trendQuery = useQuery<TrendPoint[]>({
    queryKey: ['dashboard', 'consultationsTrend'],
    queryFn: () =>
      api.get(endpoints.dashboard.consultationsTrend).then((r) => r.data),
  });

  const triageQuery = useQuery<TriageLevel[]>({
    queryKey: ['dashboard', 'triageSummary'],
    queryFn: () =>
      api.get(endpoints.dashboard.triageSummary).then((r) => r.data),
  });

  const conditionsQuery = useQuery<TopCondition[]>({
    queryKey: ['dashboard', 'topConditions'],
    queryFn: () =>
      api.get(endpoints.dashboard.topConditions).then((r) => r.data),
  });

  const centersQuery = useQuery<CenterStatus[]>({
    queryKey: ['dashboard', 'centersMap'],
    queryFn: () =>
      api.get(endpoints.dashboard.centersMap).then((r) => r.data),
  });

  const kpis = kpisQuery.data;
  const kpiLoading = kpisQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Overview of the Vaidyah healthcare network
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Patients"
          value={kpis?.totalPatients?.toLocaleString() ?? '--'}
          icon={UsersIcon}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-50"
          trend={
            kpis
              ? {
                  value: kpis.totalPatientsTrend,
                  label: 'vs last month',
                  isPositive: kpis.totalPatientsTrend >= 0,
                }
              : undefined
          }
          loading={kpiLoading}
        />
        <StatsCard
          title="Active Consultations Today"
          value={kpis?.activeConsultationsToday?.toLocaleString() ?? '--'}
          icon={ChatBubbleLeftRightIcon}
          iconColor="text-green-600"
          iconBgColor="bg-green-50"
          trend={
            kpis
              ? {
                  value: kpis.activeConsultationsTrend,
                  label: 'vs yesterday',
                  isPositive: kpis.activeConsultationsTrend >= 0,
                }
              : undefined
          }
          loading={kpiLoading}
        />
        <StatsCard
          title="Active Centers"
          value={kpis?.activeCenters?.toLocaleString() ?? '--'}
          icon={BuildingOffice2Icon}
          iconColor="text-purple-600"
          iconBgColor="bg-purple-50"
          trend={
            kpis
              ? {
                  value: kpis.activeCentersTrend,
                  label: 'vs last month',
                  isPositive: kpis.activeCentersTrend >= 0,
                }
              : undefined
          }
          loading={kpiLoading}
        />
        <StatsCard
          title="Triage Accuracy"
          value={kpis ? `${kpis.triageAccuracy}%` : '--'}
          icon={CheckBadgeIcon}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-50"
          trend={
            kpis
              ? {
                  value: kpis.triageAccuracyTrend,
                  label: 'vs last week',
                  isPositive: kpis.triageAccuracyTrend >= 0,
                }
              : undefined
          }
          loading={kpiLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {trendQuery.isLoading ? (
          <div className="lg:col-span-2">
            <ChartSkeleton />
          </div>
        ) : (
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Consultations Trend (Last 30 Days)
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendQuery.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })
                  }
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(v: string) =>
                    new Date(v).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  }
                />
                <Line
                  type="monotone"
                  dataKey="consultations"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {triageQuery.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Triage Distribution
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={triageQuery.data ?? []}
                  dataKey="count"
                  nameKey="level"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={4}
                  label={({
                    level,
                    percent,
                  }: {
                    level: string;
                    percent: number;
                  }) => `${level}: ${(percent * 100).toFixed(0)}%`}
                >
                  {(triageQuery.data ?? []).map((entry) => (
                    <Cell
                      key={entry.level}
                      fill={TRIAGE_COLORS[entry.level] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {conditionsQuery.isLoading ? (
          <ChartSkeleton height={350} />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Top 10 Conditions
            </h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={(conditionsQuery.data ?? []).slice(0, 10)}
                layout="vertical"
                margin={{ left: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="condition"
                  tick={{ fontSize: 12 }}
                  width={90}
                />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {centersQuery.isLoading ? (
          <ActivitySkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Center Status
            </h2>
            <div className="space-y-1 max-h-[350px] overflow-y-auto">
              {(centersQuery.data ?? []).length === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No center data available
                </p>
              )}
              {(centersQuery.data ?? []).map((center) => (
                <div
                  key={center.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex-shrink-0 rounded-full p-1.5 ${
                        center.status === 'online'
                          ? 'bg-green-100 text-green-600'
                          : center.status === 'degraded'
                            ? 'bg-yellow-100 text-yellow-600'
                            : 'bg-red-100 text-red-600'
                      }`}
                    >
                      {center.status === 'offline' ? (
                        <SignalSlashIcon className="h-4 w-4" />
                      ) : (
                        <SignalIcon className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {center.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {center.district}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-medium text-gray-700">
                      {center.consultationsToday}
                    </p>
                    <p className="text-xs text-gray-400">today</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
