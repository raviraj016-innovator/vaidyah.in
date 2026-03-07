import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function SystemLoading() {
  return <SkeletonLoader cards={3} columns={3} />;
}
