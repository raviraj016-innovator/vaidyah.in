import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function NotificationsLoading() {
  return <SkeletonLoader cards={4} columns={1} />;
}
