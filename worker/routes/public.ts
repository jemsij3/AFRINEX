import { Hono } from 'hono';
import type { AnnouncementAudience, AnnouncementRecord } from '../../shared/types.ts';
import { getAppSettings, toPublicPlatformConfig } from '../lib/settings.ts';
import { optionalAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/config/public', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }
  const settings = await getAppSettings(c.env.DB);
  return c.json({ config: toPublicPlatformConfig(settings) });
});

publicRoutes.get('/announcements', optionalAuth, async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }
  const user = c.get('user');
  const tierAudience = user?.tier === 'pro' ? 'pro' : 'free';

  const rows = await c.env.DB.prepare(
    `SELECT id, title, body, audience, published, created_by, sent_at, delivery_count, delivery_status, created_at, updated_at
     FROM announcements
     WHERE published = 1 AND (audience = 'all' OR audience = ?)
     ORDER BY created_at DESC
     LIMIT 15`
  )
    .bind(tierAudience)
    .all<{
      id: string;
      title: string;
      body: string;
      audience: AnnouncementAudience;
      published: number;
      created_by: string | null;
      sent_at: string | null;
      delivery_count: number;
      delivery_status: 'draft' | 'published' | 'sent' | 'partial';
      created_at: string;
      updated_at: string;
    }>();

  const announcements: AnnouncementRecord[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    published: row.published === 1,
    createdBy: row.created_by,
    sentAt: row.sent_at,
    deliveryCount: Number(row.delivery_count ?? 0),
    deliveryStatus: row.delivery_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return c.json({ announcements });
});

export default publicRoutes;
