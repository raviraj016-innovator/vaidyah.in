'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NurseRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/nurse/dashboard');
  }, [router]);
  return null;
}
