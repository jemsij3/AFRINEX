import type { MiddlewareHandler } from 'hono';
import type { MembershipTier, PlatformUser, UserRole } from '../../shared/types.ts';
import { verifySessionJwt } from '../lib/jwt.ts';
import type { AppEnv } from '../types.ts';

interface DbUserRow {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  language_code: string | null;
  role: UserRole;
  tier: MembershipTier;
  pro_expires_at: string | null;
  token_version?: number;
  created_at: string;
}

export function isProSubscriptionExpired(proExpiresAt: string | null, nowMs = Date.now()): boolean {
  if (!proExpiresAt) return false;
  const parsedMs = Date.parse(proExpiresAt);
  return Number.isFinite(parsedMs) && parsedMs <= nowMs;
}

export function mapDbUser(row: DbUserRow): PlatformUser {
  const expired = row.tier === 'pro' && isProSubscriptionExpired(row.pro_expires_at);
  return {
    id: row.id,
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    languageCode: row.language_code,
    role: row.role,
    tier: expired ? 'free' : row.tier,
    proExpiresAt: row.pro_expires_at,
    createdAt: row.created_at,
  };
}

async function expireProInDbIfNeeded(db: D1Database, row: DbUserRow): Promise<void> {
  if (row.tier === 'pro' && isProSubscriptionExpired(row.pro_expires_at)) {
    const nowIso = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          "UPDATE users SET tier = 'free', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND tier = 'pro'"
        )
        .bind(row.id),
      db
        .prepare(
          "UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active' AND expires_at <= ?"
        )
        .bind(row.id, nowIso),
    ]);
  }
}

export function getJwtSecret(env: AppEnv['Bindings']): string | null {
  if (env.ENVIRONMENT === 'development') {
    if (env.JWT_SECRET && env.JWT_SECRET.length >= 16) {
      return env.JWT_SECRET;
    }
    return 'afrinex-local-dev-jwt-secret-change-in-prod';
  }
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
    return env.JWT_SECRET;
  }
  return null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing Bearer session token.' }, 401);
  }

  const secret = getJwtSecret(c.env);
  if (!secret) {
    return c.json(
      { error: 'Server misconfigured', message: 'JWT_SECRET (>= 32 chars) is not configured.' },
      500
    );
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return c.json({ error: 'Unauthorized', message: 'Empty session token.' }, 401);
  }

  try {
    const payload = await verifySessionJwt(token, secret);
    if (!c.env.DB) {
      return c.json(
        { error: 'Database unavailable', message: 'D1 database binding is missing.' },
        503
      );
    }

    const row = await c.env.DB.prepare(
      'SELECT id, telegram_id, username, first_name, last_name, photo_url, language_code, role, tier, pro_expires_at, token_version, created_at FROM users WHERE id = ?'
    )
      .bind(payload.sub)
      .first<DbUserRow>();

    if (!row) {
      return c.json({ error: 'Unauthorized', message: 'User account not found.' }, 401);
    }

    if (
      typeof row.token_version === 'number' &&
      payload.tv !== undefined &&
      payload.tv !== row.token_version
    ) {
      return c.json({ error: 'Unauthorized', message: 'Session has been revoked.' }, 401);
    }
    if (typeof row.token_version === 'number' && payload.tv === undefined) {
      return c.json({ error: 'Unauthorized', message: 'Session token version missing.' }, 401);
    }

    await expireProInDbIfNeeded(c.env.DB, row);

    c.set('user', mapDbUser(row));
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid or expired session.';
    return c.json({ error: 'Unauthorized', message }, 401);
  }
};

export function requireRole(requiredRole: UserRole): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required.' }, 401);
    }
    if (user.role !== requiredRole) {
      return c.json(
        {
          error: 'Forbidden',
          message: `This endpoint requires ${requiredRole} privileges.`,
        },
        403
      );
    }
    await next();
  };
}

export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const secret = getJwtSecret(c.env);

  if (authHeader && authHeader.startsWith('Bearer ') && secret && c.env.DB) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const payload = await verifySessionJwt(token, secret);
        const row = await c.env.DB.prepare(
          'SELECT id, telegram_id, username, first_name, last_name, photo_url, language_code, role, tier, pro_expires_at, token_version, created_at FROM users WHERE id = ?'
        )
          .bind(payload.sub)
          .first<DbUserRow>();
        if (
          row &&
          (typeof row.token_version !== 'number' || payload.tv === row.token_version)
        ) {
          await expireProInDbIfNeeded(c.env.DB, row);
          c.set('user', mapDbUser(row));
        }
      } catch {
        // Proceed anonymously if token is invalid/expired on public routes
      }
    }
  }

  await next();
};
