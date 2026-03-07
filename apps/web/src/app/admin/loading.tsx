import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function AdminLoading() {
  return <SkeletonLoader cards={4} columns={4} />;
}
