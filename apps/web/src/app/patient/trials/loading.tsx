import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function TrialsLoading() {
  return <SkeletonLoader cards={3} columns={1} />;
}
