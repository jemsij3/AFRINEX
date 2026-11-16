import type { HealthCheckResponse } from '../../shared/types.ts';

const TOKEN_STORAGE_KEY = 'afrinex_session_token';

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export function getStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  tokenOverride?: string | null
): Promise<ApiResult<T>> {
  try {
    const token = tokenOverride !== undefined ? tokenOverride : getStoredSessionToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
      ...init,
      headers,
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: response.status,
        error:
          'Worker API returned non-JSON response. Start local Wrangler dev (`npm run dev:worker`) to connect `/api/*`.',
      };
    }

    const payload = (await response.json()) as T & { error?: string; message?: string };
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload.message || payload.error || `Request failed (${response.status})`,
      };
    }

    return { ok: true, status: response.status, data: payload };
  } catch {
    return {
      ok: false,
      error:
        'Unable to reach Worker API. Run `npm run dev:worker` on port 8787 to test Cloudflare Worker endpoints locally.',
    };
  }
}

export function fetchWorkerHealth(): Promise<ApiResult<HealthCheckResponse>> {
  return apiFetch<HealthCheckResponse>('/api/health', undefined, null);
}
