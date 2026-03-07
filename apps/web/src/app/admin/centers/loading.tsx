import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function CentersLoading() {
  return <SkeletonLoader cards={4} columns={4} />;
}
