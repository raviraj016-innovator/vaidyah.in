'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PatientRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/patient/home');
  }, [router]);
  return null;
}
