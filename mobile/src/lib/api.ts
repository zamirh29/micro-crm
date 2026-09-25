import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://crm.dtmstechsolutions.co.uk';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiResult<T> {
  data: T;
  offline: boolean;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  cacheKey?: string;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), method === 'GET' ? 10000 : 20000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

/**
 * GET requests are cached (per cacheKey) and served from the cache when the
 * network is unreachable, flagged with `offline: true`. Server errors are
 * never masked by the cache. Mutations are never cached.
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, cacheKey } = options;

  if (method !== 'GET') {
    return { data: await request<T>(path, method, body), offline: false };
  }

  try {
    const data = await request<T>(path, method);
    if (cacheKey) {
      AsyncStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data })).catch(() => {});
    }
    return { data, offline: false };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (cacheKey) {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        try {
          return { data: (JSON.parse(cached) as { data: T }).data, offline: true };
        } catch {
          // corrupt cache — fall through
        }
      }
    }
    throw err;
  }
}

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  refresh: () => void;
}

/**
 * Loads `path` (when non-null) with loading/error/offline state and revalidation.
 *
 * Loading and error are derived from the key of the in-flight request rather
 * than set inside the effect, so no state is written synchronously there.
 */
export function useApi<T>(path: string | null, cacheKey?: string): ApiState<T> {
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);
  const [outcome, setOutcome] = useState<{ key: string; error: string | null } | null>(null);

  const key = path === null ? null : `${path}|${cacheKey ?? ''}|${version}`;

  useEffect(() => {
    if (!path || !key) return;
    let cancelled = false;
    api<T>(path, { cacheKey })
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setOffline(result.offline);
        setOutcome({ key, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOutcome({
          key,
          error: err instanceof Error ? err.message : 'Something went wrong',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path, key, cacheKey]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return {
    data,
    loading: key !== null && outcome?.key !== key,
    error: outcome?.key === key ? outcome.error : null,
    offline,
    refresh,
  };
}
