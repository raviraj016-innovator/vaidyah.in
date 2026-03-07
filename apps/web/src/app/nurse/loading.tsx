import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function NurseLoading() {
  return <SkeletonLoader cards={3} columns={2} />;
}
