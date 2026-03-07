import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function ConsultationLoading() {
  return <SkeletonLoader cards={2} columns={1} />;
}
