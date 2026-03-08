'use client';

import api from './client';
import type { AxiosRequestConfig } from 'axios';

/**
 * Creates a queryFn that calls the real API.
 * Errors are always thrown so the UI can show proper error states.
 * Automatically extracts data from { success: true, data: T } responses.
 *
 * Usage:
 *   useQuery({ queryKey: [...], queryFn: fetchWithFallback(endpoint) })
 */
export function fetchWithFallback<T>(
  endpoint: string,
  _fallback?: T,
  config?: AxiosRequestConfig,
): () => Promise<T> {
  return async () => {
    const { data } = await api.get<{ success?: boolean; data?: T } | T>(endpoint, config);
    // If response has { success: true, data: ... } structure, extract data
    if (data && typeof data === 'object' && 'data' in data && 'success' in data) {
      return (data as { data: T }).data;
    }
    return data as T;
  };
}

/**
 * POST variant for mutations.
 */
export function postWithFallback<T>(
  endpoint: string,
  body: unknown,
  _fallback?: T,
): () => Promise<T> {
  return async () => {
    const { data } = await api.post<T>(endpoint, body);
    return data;
  };
}

/**
 * For mutations (create/update/delete) — wraps api calls.
 * Returns the mutation function to use with useMutation's mutationFn.
 */
export function mutateWithFallback<TData, TVariables>(
  method: 'post' | 'put' | 'patch' | 'delete',
  endpointFn: (vars: TVariables) => string,
  _fallbackFn?: (vars: TVariables) => TData,
): (vars: TVariables) => Promise<TData> {
  return async (vars: TVariables) => {
    const endpoint = endpointFn(vars);
    const { data } =
      method === 'delete'
        ? await api.delete<TData>(endpoint)
        : await api[method]<TData>(endpoint, vars);
    return data;
  };
}
