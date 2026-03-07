'use client';

import { Segmented } from 'antd';
import { useAuthStore } from '@/stores/auth-store';

export function LanguageSwitcher() {
  const language = useAuthStore((s) => s.language);
  const setLanguage = useAuthStore((s) => s.setLanguage);

  return (
    <Segmented
      value={language}
      onChange={(val) => setLanguage(val as 'en' | 'hi')}
      options={[
        { label: 'EN', value: 'en' },
        { label: 'HI', value: 'hi' },
      ]}
      size="small"
    />
  );
}
