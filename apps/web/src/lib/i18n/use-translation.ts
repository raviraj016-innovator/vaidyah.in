'use client';

import { useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import en from './dictionaries/en.json';
import hi from './dictionaries/hi.json';

const dictionaries = { en, hi } as const;

export function useTranslation() {
  const language = useAuthStore((s) => s.language);
  const dict = dictionaries[language];

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const keys = key.split('.');
      let value: any = dict;
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value !== 'string') return key;
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replaceAll(`{{${k}}}`, v),
          value,
        );
      }
      return value;
    },
    [dict],
  );

  return { t, language };
}
