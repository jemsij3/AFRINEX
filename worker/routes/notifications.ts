import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { notificationPreferencesSchema } from '../../shared/schemas.ts';
import type { NotificationRecord, NotificationType, PlatformSectionId } from '../../shared/types.ts';
import { getUserNotificationPreferences } from '../lib/monitoring.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.use('*', requireAuth);

interface DbNotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link_section: PlatformSectionId | null;
  link_ref_id: string | null;
  is_read: number;
  read_at: string | null;
  telegram_sent_at: string | null;
  created_at: string;
}

function mapNotification(row: DbNotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkSection: row.link_section,
    linkRefId: row.link_ref_id,
    isRead: row.is_read === 1,
    readAt: row.read_at,
    telegramSentAt: row.telegram_sent_at,
    createdAt: row.created_at,
  };
}

notificationRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const unreadOnly = c.req.query('unread') === 'true';
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const perPage = Math.min(50, Math.max(1, Number.parseInt(c.req.query('per_page') ?? '20', 10) || 20));
  const offset = (page - 1) * perPage;

  const whereClause = unreadOnly ? 'user_id = ? AND is_read = 0' : 'user_id = ?';

  const [rows, unreadRow, totalRow, preferences] = await Promise.all([
    db
      .prepare(
        `SELECT id, user_id, type, title, body, link_section, link_ref_id, is_read, read_at, telegram_sent_at, created_at
         FROM notifications
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(user.id, perPage, offset)
      .all<DbNotificationRow>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0')
      .bind(user.id)
      .first<{ total: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM notifications WHERE ${whereClause}`)
      .bind(user.id)
      .first<{ total: number }>(),
    getUserNotificationPreferences(db, user.id),
  ]);

  const total = Number(totalRow?.total ?? 0);
  return c.json({
    notifications: (rows.results ?? []).map(mapNotification),
    unreadCount: Number(unreadRow?.total ?? 0),
    preferences,
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  });
});

notificationRoutes.post('/:id/read', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const res = await db
    .prepare(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE id = ? AND user_id = ?`
    )
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Not found', message: 'Notification not found.' }, 404);
  }

  return c.json({ ok: true });
});

notificationRoutes.post('/read-all', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  await db
    .prepare(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       WHERE user_id = ? AND is_read = 0`
    )
    .bind(user.id)
    .run();

  return c.json({ ok: true });
});

notificationRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const res = await db
    .prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Not found', message: 'Notification not found.' }, 404);
  }

  return c.json({ ok: true });
});

notificationRoutes.get('/preferences', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const preferences = await getUserNotificationPreferences(db, user.id);
  return c.json({ preferences });
});

notificationRoutes.put(
  '/preferences',
  zValidator('json', notificationPreferencesSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const current = await getUserNotificationPreferences(db, user.id);
    const input = c.req.valid('json');

    const next = {
      telegramEnabled: input.telegramEnabled ?? current.telegramEnabled,
      deadlinesEnabled: input.deadlinesEnabled ?? current.deadlinesEnabled,
      aiEventsEnabled: input.aiEventsEnabled ?? current.aiEventsEnabled,
      projectEventsEnabled: input.projectEventsEnabled ?? current.projectEventsEnabled,
      billingEventsEnabled: input.billingEventsEnabled ?? current.billingEventsEnabled,
      announcementsEnabled: input.announcementsEnabled ?? current.announcementsEnabled,
    };

    await db
      .prepare(
        `INSERT INTO notification_preferences (
           user_id, telegram_enabled, deadlines_enabled, ai_events_enabled,
           project_events_enabled, billing_events_enabled, announcements_enabled, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(user_id) DO UPDATE SET
           telegram_enabled = excluded.telegram_enabled,
           deadlines_enabled = excluded.deadlines_enabled,
           ai_events_enabled = excluded.ai_events_enabled,
           project_events_enabled = excluded.project_events_enabled,
           billing_events_enabled = excluded.billing_events_enabled,
           announcements_enabled = excluded.announcements_enabled,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      )
      .bind(
        user.id,
        next.telegramEnabled ? 1 : 0,
        next.deadlinesEnabled ? 1 : 0,
        next.aiEventsEnabled ? 1 : 0,
        next.projectEventsEnabled ? 1 : 0,
        next.billingEventsEnabled ? 1 : 0,
        next.announcementsEnabled ? 1 : 0
      )
      .run();

    const updated = await getUserNotificationPreferences(db, user.id);
    return c.json({ preferences: updated });
  }
);

export default notificationRoutes;
