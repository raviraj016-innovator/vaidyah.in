import { SkeletonLoader } from '@/components/ui/skeleton-loader';

export default function PatientIntakeLoading() {
  return <SkeletonLoader cards={2} columns={2} />;
}
