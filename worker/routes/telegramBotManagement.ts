import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';
import telegramServicesRoutes from './telegramServices.ts';

// Compatibility namespace for the standalone Telegram bot management API.
// Bot registration, ownership checks, webhook setup, and the public receiver
// share the already implemented handlers in telegramServices.ts.
const telegramBotManagement = new Hono<AppEnv>();
telegramBotManagement.route('/', telegramServicesRoutes);

telegramBotManagement.get(
  '/bots/:id/analytics',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_analytics', limit: 60, windowSeconds: 60 }),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const botId = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const bot = await db
      .prepare('SELECT id FROM telegram_bots WHERE id = ? AND user_id = ?')
      .bind(botId, user.id)
      .first<{ id: string }>();
    if (!bot) return c.json({ error: 'Bot not found' }, 404);

    const [stats, recent] = await Promise.all([
      db
        .prepare(
          'SELECT event_type, COUNT(*) AS count FROM telegram_analytics WHERE bot_id = ? GROUP BY event_type ORDER BY count DESC'
        )
        .bind(botId)
        .all<{ event_type: string; count: number }>(),
      db
        .prepare(
          'SELECT event_type, event_data, created_at FROM telegram_analytics WHERE bot_id = ? ORDER BY created_at DESC LIMIT 50'
        )
        .bind(botId)
        .all<{ event_type: string; event_data: string | null; created_at: string }>(),
    ]);

    return c.json({ stats: stats.results ?? [], recent: recent.results ?? [] });
  },
);

export default telegramBotManagement;
