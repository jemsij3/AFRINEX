import type { MiddlewareHandler } from 'hono';
import {
  ALL_ADMIN_PERMISSIONS,
  type AccountStatus,
  type AdminPermission,
  type EffectiveUserRole,
  type MembershipTier,
  type PlatformUser,
  type UserRole,
} from '../../shared/types.ts';
import { verifySessionJwt } from '../lib/jwt.ts';
import type { AppEnv, WorkerBindings } from '../types.ts';

export const DEFAULT_DELEGATED_ADMIN_PERMISSIONS: AdminPermission[] = [
  'learning.manage',
  'tools.manage',
  'opportunities.manage',
  'announcements.manage',
  'audit.view',
];

const VALID_ADMIN_PERMISSIONS: ReadonlySet<AdminPermission> = new Set(ALL_ADMIN_PERMISSIONS);

export interface DbUserRow {
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
  account_status?: string | null;
  admin_permissions_json?: string | null;
  last_active_at?: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  created_at: string;
}

export const USER_SELECT_COLUMNS =
  'id, telegram_id, username, first_name, last_name, photo_url, language_code, role, tier, pro_expires_at, token_version, account_status, admin_permissions_json, last_active_at, suspended_at, suspended_reason, created_at';

export type AdminIdsEnvSource =
  | string
  | number
  | readonly unknown[]
  | Pick<
      WorkerBindings,
      | 'ADMIN_TELEGRAM_IDS'
      | 'ADMIN_TELEGRAM_ID'
      | 'TELEGRAM_ADMIN_IDS'
      | 'TELEGRAM_ADMIN_ID'
      | 'OWNER_TELEGRAM_IDS'
      | 'OWNER_TELEGRAM_ID'
    >
  | null
  | undefined;

function extractNumericIdsFromValue(raw: unknown, out: Set<number>): void {
  if (raw === null || raw === undefined) return;

  if (typeof raw === 'number') {
    if (Number.isSafeInteger(raw) && raw > 0) {
      out.add(raw);
    }
    return;
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      extractNumericIdsFromValue(item, out);
    }
    return;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed !== trimmed) {
          extractNumericIdsFromValue(parsed, out);
          return;
        }
      } catch {
        // Fall back to token splitting
      }
    }

    const normalized = trimmed.replace(/^\[|\]$/g, '');
    for (const token of normalized.split(/[\s,;|]+/)) {
      const cleaned = token.trim().replace(/^['"]+|['"]+$/g, '');
      if (!cleaned || !/^\d+$/.test(cleaned)) continue;
      const num = Number(cleaned);
      if (Number.isSafeInteger(num) && num > 0) {
        out.add(num);
      }
    }
  }
}

export function parseConfiguredOwnerIds(source?: AdminIdsEnvSource): number[] {
  if (source === null || source === undefined) return [];
  const ids = new Set<number>();

  if (
    typeof source === 'object' &&
    !Array.isArray(source)
  ) {
    const envObj = source as Record<string, unknown>;
    extractNumericIdsFromValue(envObj.ADMIN_TELEGRAM_IDS, ids);
    extractNumericIdsFromValue(envObj.ADMIN_TELEGRAM_ID, ids);
    extractNumericIdsFromValue(envObj.TELEGRAM_ADMIN_IDS, ids);
    extractNumericIdsFromValue(envObj.TELEGRAM_ADMIN_ID, ids);
    extractNumericIdsFromValue(envObj.OWNER_TELEGRAM_IDS, ids);
    extractNumericIdsFromValue(envObj.OWNER_TELEGRAM_ID, ids);
  } else {
    extractNumericIdsFromValue(source, ids);
  }

  return Array.from(ids);
}

export function isConfiguredOwnerTelegramId(
  telegramId: number,
  source?: AdminIdsEnvSource
): boolean {
  return Number.isSafeInteger(telegramId) && telegramId > 0 && parseConfiguredOwnerIds(source).includes(telegramId);
}

export function hasConfiguredAdminIds(source?: AdminIdsEnvSource): boolean {
  return parseConfiguredOwnerIds(source).length > 0;
}

function parseAdminPermissions(raw: string | null | undefined): AdminPermission[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AdminPermission =>
        typeof item === 'string' && VALID_ADMIN_PERMISSIONS.has(item as AdminPermission)
    );
  } catch {
    return [];
  }
}

export function isProSubscriptionExpired(proExpiresAt: string | null, nowMs = Date.now()): boolean {
  if (!proExpiresAt) return false;
  const parsedMs = Date.parse(proExpiresAt);
  return Number.isFinite(parsedMs) && parsedMs <= nowMs;
}

export function mapDbUser(row: DbUserRow, env?: AdminIdsEnvSource): PlatformUser {
  const expired = row.tier === 'pro' && isProSubscriptionExpired(row.pro_expires_at);
  const isOwner = isConfiguredOwnerTelegramId(Number(row.telegram_id), env);
  const effectiveRole: EffectiveUserRole = isOwner
    ? 'owner'
    : row.role === 'admin'
      ? 'admin'
      : 'member';

  const accountStatus: AccountStatus =
    !isOwner && row.account_status === 'suspended' ? 'suspended' : 'active';

  const adminPermissions: AdminPermission[] = isOwner
    ? [...ALL_ADMIN_PERMISSIONS]
    : row.role === 'admin'
      ? parseAdminPermissions(row.admin_permissions_json)
      : [];

  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    languageCode: row.language_code,
    role: isOwner ? 'admin' : row.role,
    effectiveRole,
    isOwner,
    accountStatus,
    adminPermissions,
    lastActiveAt: row.last_active_at ?? null,
    suspendedAt: row.suspended_at ?? null,
    suspendedReason: row.suspended_reason ?? null,
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

async function touchLastActiveIfStale(db: D1Database, row: DbUserRow): Promise<void> {
  const lastMs = row.last_active_at ? Date.parse(row.last_active_at) : 0;
  if (!Number.isFinite(lastMs) || Date.now() - lastMs > 2 * 60 * 1000) {
    try {
      await db
        .prepare(
          "UPDATE users SET last_active_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
        )
        .bind(row.id)
        .run();
    } catch {
      // Non-blocking activity tracking
    }
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
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`
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

    const mapped = mapDbUser(row, c.env);
    if (mapped.accountStatus === 'suspended') {
      return c.json(
        {
          error: 'Account suspended',
          message:
            mapped.suspendedReason ||
            'Your AFRINEX account has been suspended by an administrator.',
        },
        403
      );
    }

    await expireProInDbIfNeeded(c.env.DB, row);
    await touchLastActiveIfStale(c.env.DB, row);

    c.set('user', mapped);
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

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required.' }, 401);
  }
  if (!user.isOwner) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Only configured AFRINEX Owners can perform this action.',
      },
      403
    );
  }
  await next();
};

export function requireAdminPermission(permission: AdminPermission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required.' }, 401);
    }
    if (user.role !== 'admin') {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Administrator privileges are required.',
        },
        403
      );
    }
    if (user.isOwner) {
      await next();
      return;
    }
    if (!user.adminPermissions?.includes(permission)) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Missing required administrator permission: ${permission}.`,
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
          `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`
        )
          .bind(payload.sub)
          .first<DbUserRow>();
        if (
          row &&
          (typeof row.token_version !== 'number' || payload.tv === row.token_version)
        ) {
          const mapped = mapDbUser(row, c.env);
          if (mapped.accountStatus !== 'suspended') {
            await expireProInDbIfNeeded(c.env.DB, row);
            await touchLastActiveIfStale(c.env.DB, row);
            c.set('user', mapped);
          }
        }
      } catch {
        // Proceed anonymously if token is invalid/expired on public routes
      }
    }
  }

  await next();
};
