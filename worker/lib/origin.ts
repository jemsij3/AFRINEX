import type { WorkerBindings } from '../types.ts';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

export type AppBaseUrlResolution =
  | { ok: true; baseUrl: string }
  | { ok: false; message: string };

export function resolveAppBaseUrl(
  env: Pick<WorkerBindings, 'APP_BASE_URL' | 'ENVIRONMENT'>,
  requestUrl: string
): AppBaseUrlResolution {
  const isDev = env.ENVIRONMENT === 'development';
  const configured = typeof env.APP_BASE_URL === 'string' ? env.APP_BASE_URL.trim() : '';

  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      return {
        ok: false,
        message: 'APP_BASE_URL is not a valid URL.',
      };
    }

    if (parsed.protocol !== 'https:' && !(isDev && parsed.protocol === 'http:')) {
      return {
        ok: false,
        message: 'APP_BASE_URL must use https:// in production.',
      };
    }

    if (!isDev && LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
      return {
        ok: false,
        message: 'APP_BASE_URL cannot point to a localhost address in production.',
      };
    }

    return {
      ok: true,
      baseUrl: parsed.origin,
    };
  }

  if (isDev) {
    try {
      const reqOrigin = new URL(requestUrl).origin;
      return { ok: true, baseUrl: reqOrigin };
    } catch {
      return {
        ok: false,
        message: 'APP_BASE_URL is required when request origin cannot be resolved.',
      };
    }
  }

  return {
    ok: false,
    message: 'Server misconfigured: APP_BASE_URL must be set to your public HTTPS application URL.',
  };
}
