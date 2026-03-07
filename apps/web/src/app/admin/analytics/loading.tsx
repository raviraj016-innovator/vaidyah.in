import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function AnalyticsLoading() {
  return <SkeletonLoader cards={3} columns={3} />;
}
