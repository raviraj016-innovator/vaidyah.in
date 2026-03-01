import React from 'react';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/20/solid';

// ---------------------------------------------------------------------------
// KPI stats card with icon, value, label, and trend indicator
// ---------------------------------------------------------------------------

export interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean; // Override auto-detection
  };
  iconColor?: string;
  iconBgColor?: string;
  subtitle?: string;
  loading?: boolean;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  iconColor = 'text-primary-600',
  iconBgColor = 'bg-primary-50',
  subtitle,
  loading = false,
}: StatsCardProps) {
  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            <div className="h-4 w-24 bg-gray-200 rounded" />
            <div className="h-8 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-200 rounded" />
          </div>
          <div className="h-12 w-12 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  const trendIsUp = trend ? (trend.isPositive ?? trend.value > 0) : false;
  const trendColor = trendIsUp ? 'text-green-600' : 'text-red-600';
  const trendBg = trendIsUp ? 'bg-green-50' : 'bg-red-50';

  return (
    <div className="card p-6 hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          <div className="mt-2 flex items-center gap-2">
            {trend && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${trendBg} ${trendColor}`}
              >
                {trendIsUp ? (
                  <ArrowUpIcon className="h-3 w-3" />
                ) : (
                  <ArrowDownIcon className="h-3 w-3" />
                )}
                {Math.abs(trend.value)}%
              </span>
            )}
            {(trend?.label || subtitle) && (
              <span className="text-xs text-gray-500">
                {trend?.label || subtitle}
              </span>
            )}
          </div>
        </div>
        <div className={`flex-shrink-0 rounded-xl p-3 ${iconBgColor}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

export default StatsCard;
