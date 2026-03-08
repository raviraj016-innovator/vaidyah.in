'use client';

import { useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import type { Locale } from './config';
import en from './dictionaries/en.json';
import hi from './dictionaries/hi.json';
import bn from './dictionaries/bn.json';
import ta from './dictionaries/ta.json';
import te from './dictionaries/te.json';
import mr from './dictionaries/mr.json';
import gu from './dictionaries/gu.json';
import kn from './dictionaries/kn.json';
import ml from './dictionaries/ml.json';
import pa from './dictionaries/pa.json';
import orDict from './dictionaries/or.json';
import ur from './dictionaries/ur.json';
import asDict from './dictionaries/as.json';

const dictionaries: Record<Locale, typeof en> = {
  en, hi, bn, ta, te, mr, gu, kn, ml, pa, or: orDict, ur, as: asDict,
};

export function useTranslation() {
  const language = useAuthStore((s) => s.language);
  const dict = dictionaries[language] ?? dictionaries.en;

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
