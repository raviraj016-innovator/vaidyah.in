import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function PatientLoading() {
  return <SkeletonLoader cards={3} columns={1} />;
}
