import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function TrialDetailLoading() {
  return <SkeletonLoader cards={3} columns={1} />;
}
