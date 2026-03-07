import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ChartBarIcon,
  UserGroupIcon,
  ClockIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { api, endpoints } from '@/config/api';
import { StatsCard } from '@/components/StatsCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiseasePrevalence {
  condition: string;
  count: number;
  percentChange: number;
}

interface NursePerformance {
  nurseName: string;
  consultations: number;
  avgDurationMin: number;
  triageAccuracy: number;
}

interface AiAccuracy {
  date: string;
  triageAccuracy: number;
  soapAccuracy: number;
  nluAccuracy: number;
}

interface DemographicBucket {
  group: string;
  count: number;
}

interface WaitTime {
  centerName: string;
  avgMinutes: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'];

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="card p-6 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
      <div className="bg-gray-100 rounded" style={{ height }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const diseaseQuery = useQuery<DiseasePrevalence[]>({
    queryKey: ['analytics', 'diseasePrevalence', period],
    queryFn: () =>
      api
        .get(endpoints.analytics.diseasePrevalence, { params: { period } })
        .then((r) => r.data),
  });

  const nurseQuery = useQuery<NursePerformance[]>({
    queryKey: ['analytics', 'nursePerformance', period],
    queryFn: () =>
      api
        .get(endpoints.analytics.nursePerformance, { params: { period } })
        .then((r) => r.data),
  });

  const aiQuery = useQuery<AiAccuracy[]>({
    queryKey: ['analytics', 'aiAccuracy', period],
    queryFn: () =>
      api
        .get(endpoints.analytics.aiAccuracy, { params: { period } })
        .then((r) => r.data),
  });

  const demoQuery = useQuery<DemographicBucket[]>({
    queryKey: ['analytics', 'demographics', period],
    queryFn: () =>
      api
        .get(endpoints.analytics.demographics, { params: { period } })
        .then((r) => r.data),
  });

  const waitQuery = useQuery<WaitTime[]>({
    queryKey: ['analytics', 'waitTimes', period],
    queryFn: () =>
      api
        .get(endpoints.analytics.waitTimes, { params: { period } })
        .then((r) => r.data),
  });

  const topDisease = diseaseQuery.data?.[0];
  const avgWait =
    waitQuery.data && waitQuery.data.length > 0
      ? Math.round(
          waitQuery.data.reduce((s, w) => s + w.avgMinutes, 0) /
            waitQuery.data.length,
        )
      : null;
  const latestAi = aiQuery.data?.[aiQuery.data.length - 1];
  const totalNurseConsultations = nurseQuery.data?.reduce(
    (s, n) => s + n.consultations,
    0,
  );

  const kpiLoading =
    diseaseQuery.isLoading ||
    waitQuery.isLoading ||
    aiQuery.isLoading ||
    nurseQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            Platform analytics and insights across the Vaidyah network.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              onClick={() => setPeriod(p)}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Top Condition"
          value={topDisease?.condition ?? '--'}
          icon={ChartBarIcon}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-50"
          subtitle={
            topDisease ? `${topDisease.count} cases` : undefined
          }
          loading={kpiLoading}
        />
        <StatsCard
          title="Total Consultations"
          value={totalNurseConsultations?.toLocaleString() ?? '--'}
          icon={UserGroupIcon}
          iconColor="text-green-600"
          iconBgColor="bg-green-50"
          loading={kpiLoading}
        />
        <StatsCard
          title="Avg Wait Time"
          value={avgWait != null ? `${avgWait} min` : '--'}
          icon={ClockIcon}
          iconColor="text-amber-600"
          iconBgColor="bg-amber-50"
          loading={kpiLoading}
        />
        <StatsCard
          title="AI Triage Accuracy"
          value={latestAi ? `${latestAi.triageAccuracy}%` : '--'}
          icon={CpuChipIcon}
          iconColor="text-blue-600"
          iconBgColor="bg-blue-50"
          loading={kpiLoading}
        />
      </div>

      {/* Row: Disease Prevalence + Demographics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {diseaseQuery.isLoading ? (
          <div className="lg:col-span-2">
            <ChartSkeleton height={350} />
          </div>
        ) : (
          <div className="card p-6 lg:col-span-2">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Disease Prevalence (Top 10)
            </h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={(diseaseQuery.data ?? []).slice(0, 10)}
                layout="vertical"
                margin={{ left: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="condition"
                  tick={{ fontSize: 12 }}
                  width={110}
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

        {demoQuery.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Patient Demographics
            </h2>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={demoQuery.data ?? []}
                  dataKey="count"
                  nameKey="group"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={3}
                  label={({
                    group,
                    percent,
                  }: {
                    group: string;
                    percent: number;
                  }) => `${group}: ${(percent * 100).toFixed(0)}%`}
                >
                  {(demoQuery.data ?? []).map((_, i) => (
                    <Cell
                      key={i}
                      fill={AGE_COLORS[i % AGE_COLORS.length]}
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

      {/* Row: AI Accuracy Trend + Wait Times */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {aiQuery.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              AI Model Accuracy Trend
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={aiQuery.data ?? []}>
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
                <YAxis
                  tick={{ fontSize: 12 }}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  labelFormatter={(v: string) =>
                    new Date(v).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  }
                  formatter={(v: number) => [`${v}%`]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="triageAccuracy"
                  name="Triage"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="soapAccuracy"
                  name="SOAP Notes"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="nluAccuracy"
                  name="NLU"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {waitQuery.isLoading ? (
          <ChartSkeleton />
        ) : (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Avg Wait Time by Center (min)
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(waitQuery.data ?? []).slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="centerName"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar
                  dataKey="avgMinutes"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Nurse Performance Table */}
      {nurseQuery.isLoading ? (
        <ChartSkeleton height={200} />
      ) : (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Nurse Performance
          </h2>
          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header px-4 py-3">Nurse</th>
                  <th className="table-header px-4 py-3">Consultations</th>
                  <th className="table-header px-4 py-3">Avg Duration</th>
                  <th className="table-header px-4 py-3">Triage Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {(nurseQuery.data ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="table-cell text-center text-gray-500 py-8"
                    >
                      No performance data available
                    </td>
                  </tr>
                )}
                {(nurseQuery.data ?? []).map((nurse) => (
                  <tr key={nurse.nurseName} className="table-row">
                    <td className="table-cell font-medium">
                      {nurse.nurseName}
                    </td>
                    <td className="table-cell">{nurse.consultations}</td>
                    <td className="table-cell">{nurse.avgDurationMin} min</td>
                    <td className="table-cell">
                      <span
                        className={`badge ${
                          nurse.triageAccuracy >= 90
                            ? 'bg-green-100 text-green-700'
                            : nurse.triageAccuracy >= 75
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {nurse.triageAccuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
