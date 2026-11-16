import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.ts';

interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
}

/**
 * D1-backed fixed-window rate limiter for Cloudflare Workers.
 * Falls back cleanly if DB is not yet bound in local dry tests.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = c.env.DB;
    if (!db) {
      await next();
      return;
    }

    const user = c.get('user');
    const clientIp =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
      'unknown';

    const identity = user ? `u:${user.id}` : `ip:${clientIp}`;
    const bucketKey = `${options.keyPrefix}:${identity}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const nextResetSec = nowSec + options.windowSeconds;

    try {
      const row = await db
        .prepare(
          `INSERT INTO rate_limits (bucket_key, count, reset_at)
           VALUES (?, 1, ?)
           ON CONFLICT(bucket_key) DO UPDATE SET
             count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
             reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
           RETURNING count, reset_at`
        )
        .bind(bucketKey, nextResetSec, nowSec, nowSec)
        .first<{ count: number; reset_at: number }>();

      if (row && row.count > options.limit) {
        const retryAfter = Math.max(1, row.reset_at - nowSec);
        c.header('Retry-After', String(retryAfter));
        return c.json(
          {
            error: 'Rate limit exceeded',
            message: `Too many requests. Please try again in ${retryAfter}s.`,
          },
          429
        );
      }

      // Periodically prune expired rate-limit buckets to prevent unbounded D1 growth
      if (Math.random() < 0.05) {
        await db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(nowSec).run();
      }
    } catch {
      // Do not hard-fail requests if rate_limits table has not been migrated yet
    }

    await next();
  };
}
