import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { telegramAuthSchema } from '../../shared/schemas.ts';
import type { AuthSessionResponse, UserRole } from '../../shared/types.ts';
import { signSessionJwt } from '../lib/jwt.ts';
import { getAppSettings } from '../lib/settings.ts';
import { verifyTelegramInitData } from '../lib/telegramAuth.ts';
import {
  getJwtSecret,
  hasConfiguredAdminIds,
  isConfiguredOwnerTelegramId,
  mapDbUser,
  requireAuth,
  USER_SELECT_COLUMNS,
  type DbUserRow,
} from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const authRoutes = new Hono<AppEnv>();

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

async function writeAuditLog(
  db: D1Database,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        crypto.randomUUID(),
        actorUserId,
        action,
        targetType,
        targetId,
        JSON.stringify(metadata)
      )
      .run();
  } catch {
    // Non-blocking audit log write
  }
}

authRoutes.post(
  '/telegram',
  rateLimit({ keyPrefix: 'auth_tg', limit: 20, windowSeconds: 60 }),
  zValidator('json', telegramAuthSchema),
  async (c) => {
    const { initData } = c.req.valid('json');

    if (!c.env.DB) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }
    if (!c.env.TELEGRAM_BOT_TOKEN) {
      return c.json(
        {
          error: 'Telegram Bot token not configured',
          message: 'Set TELEGRAM_BOT_TOKEN via Wrangler secret or .dev.vars.',
        },
        500
      );
    }

    const jwtSecret = getJwtSecret(c.env);
    if (!jwtSecret) {
      return c.json(
        { error: 'Server misconfigured', message: 'JWT_SECRET is required in production.' },
        500
      );
    }

    if (!hasConfiguredAdminIds(c.env.ADMIN_TELEGRAM_IDS)) {
      console.warn(
        '[AFRINEX Auth] ADMIN_TELEGRAM_IDS is not configured or contains no valid numeric IDs.'
      );
    }

    let verified;
    try {
      verified = await verifyTelegramInitData(initData, c.env.TELEGRAM_BOT_TOKEN, 300);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Telegram authentication failed';
      return c.json({ error: 'Authentication failed', message }, 401);
    }

    const tgUser = verified.user;
    const isOwner = isConfiguredOwnerTelegramId(tgUser.id, c.env.ADMIN_TELEGRAM_IDS);

    const existing = await c.env.DB.prepare(
      'SELECT id, role, account_status, suspended_reason FROM users WHERE telegram_id = ?'
    )
      .bind(tgUser.id)
      .first<{
        id: string;
        role: UserRole;
        account_status?: string | null;
        suspended_reason?: string | null;
      }>();

    if (!isOwner && existing?.account_status === 'suspended') {
      return c.json(
        {
          error: 'Account suspended',
          message:
            existing.suspended_reason ||
            'Your AFRINEX account has been suspended by an administrator.',
        },
        403
      );
    }

    const settings = await getAppSettings(c.env.DB);
    if (!existing && !isOwner && !settings.registrationEnabled) {
      return c.json(
        {
          error: 'Registration closed',
          message: 'New account registrations are currently paused by an administrator.',
        },
        403
      );
    }

    const userId = existing?.id ?? `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const assignedRole: UserRole = isOwner ? 'admin' : existing?.role ?? 'member';
    const nowIso = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO users (id, telegram_id, username, first_name, last_name, photo_url, language_code, role, last_active_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         photo_url = excluded.photo_url,
         language_code = excluded.language_code,
         role = CASE WHEN ? = 1 THEN 'admin' ELSE users.role END,
         last_active_at = excluded.last_active_at,
         updated_at = excluded.updated_at`
    )
      .bind(
        userId,
        tgUser.id,
        tgUser.username ?? null,
        tgUser.first_name,
        tgUser.last_name ?? null,
        tgUser.photo_url ?? null,
        tgUser.language_code ?? 'en',
        assignedRole,
        nowIso,
        nowIso,
        nowIso,
        isOwner ? 1 : 0
      )
      .run();

    const userRow = await c.env.DB.prepare(
      `SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`
    )
      .bind(userId)
      .first<DbUserRow>();

    if (!userRow) {
      return c.json({ error: 'Database error', message: 'Failed to load user record.' }, 500);
    }

    const user = mapDbUser(userRow, c.env);
    const token = await signSessionJwt(
      {
        sub: user.id,
        tgId: user.telegramId,
        role: user.role,
        tier: user.tier,
        tv: userRow.token_version ?? 1,
      },
      jwtSecret,
      SESSION_TTL_SECONDS
    );

    await writeAuditLog(c.env.DB, user.id, 'auth.telegram_login', 'user', user.id, {
      telegramId: user.telegramId,
      role: user.role,
      effectiveRole: user.effectiveRole,
    });

    const response: AuthSessionResponse = {
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
      user,
    };
    return c.json(response);
  }
);

authRoutes.get('/me', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({ user });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  const user = c.get('user');
  if (c.env.DB && user) {
    await c.env.DB.prepare(
      "UPDATE users SET token_version = token_version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
    )
      .bind(user.id)
      .run();
    await writeAuditLog(c.env.DB, user.id, 'auth.logout', 'user', user.id);
  }
  return c.json({ ok: true });
});

export default authRoutes;
