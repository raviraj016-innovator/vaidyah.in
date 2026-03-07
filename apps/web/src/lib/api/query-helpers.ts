'use client';

import api from './client';
import type { AxiosRequestConfig } from 'axios';

/**
 * Checks if the error indicates the backend is down (network error or proxy error).
 * Same logic as use-auth.ts isBackendUnavailable.
 */
function isBackendDown(err: any): boolean {
  if (
    !err.response &&
    (err.code === 'ERR_NETWORK' ||
      err.code === 'ECONNREFUSED' ||
      err.message === 'Network Error')
  ) {
    return true;
  }
  const status = err.response?.status;
  if (status && [500, 502, 503, 504].includes(status)) {
    const ct = err.response?.headers?.['content-type'] ?? '';
    if (!ct.includes('application/json')) return true;
  }
  return false;
}

/**
 * Creates a queryFn that tries a real API call first, then falls back to mock data
 * when the backend is unreachable (demo mode).
 *
 * Usage:
 *   useQuery({
 *     queryKey: ['admin', 'dashboard', 'kpis'],
 *     queryFn: fetchWithFallback(endpoints.dashboard.kpis, mockKpis),
 *   })
 */
export function fetchWithFallback<T>(
  endpoint: string,
  fallback: T,
  config?: AxiosRequestConfig,
): () => Promise<T> {
  return async () => {
    try {
      const { data } = await api.get<T>(endpoint, config);
      return data;
    } catch (err) {
      if (isBackendDown(err)) {
        return fallback;
      }
      throw err;
    }
  };
}

/**
 * POST variant for mutations that also need demo-mode fallback.
 */
export function postWithFallback<T>(
  endpoint: string,
  body: unknown,
  fallback: T,
): () => Promise<T> {
  return async () => {
    try {
      const { data } = await api.post<T>(endpoint, body);
      return data;
    } catch (err) {
      if (isBackendDown(err)) {
        return fallback;
      }
      throw err;
    }
  };
}

/**
 * For mutations (create/update/delete) — wraps api calls with demo-mode fallback.
 * Returns the mutation function to use with useMutation's mutationFn.
 */
export function mutateWithFallback<TData, TVariables>(
  method: 'post' | 'put' | 'patch' | 'delete',
  endpointFn: (vars: TVariables) => string,
  fallbackFn: (vars: TVariables) => TData,
): (vars: TVariables) => Promise<TData> {
  return async (vars: TVariables) => {
    try {
      const endpoint = endpointFn(vars);
      const { data } =
        method === 'delete'
          ? await api.delete<TData>(endpoint)
          : await api[method]<TData>(endpoint, vars);
      return data;
    } catch (err) {
      if (isBackendDown(err)) {
        return fallbackFn(vars);
      }
      throw err;
    }
  };
}
