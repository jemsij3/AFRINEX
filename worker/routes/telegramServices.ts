import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createTelegramServiceSchema,
  updateTelegramServiceStatusSchema,
} from '../../shared/schemas.ts';
import type {
  TelegramService,
  TelegramServiceConfig,
  TelegramServiceType,
} from '../../shared/types.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const telegramServicesRoutes = new Hono<AppEnv>();

telegramServicesRoutes.use('*', requireAuth);

interface DbServiceRow {
  id: string;
  user_id: string;
  service_type: TelegramServiceType;
  title: string;
  requirements: string;
  config_json: string;
  status: 'planned' | 'active' | 'paused';
  created_at: string;
  updated_at: string;
}

function buildServiceBlueprintConfig(serviceType: TelegramServiceType): TelegramServiceConfig {
  const map: Record<TelegramServiceType, TelegramServiceConfig> = {
    bot_dev: {
      recommendedBotCommands: ['/start', '/help', '/status'],
      webhookEndpoint: '/api/webhooks/telegram',
      requiredSecrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'],
      setupChecklist: [
        'Create bot via @BotFather and store token in Wrangler secret',
        'Register webhook with secret_token header verification',
        'Bind command handlers to Cloudflare Worker routes',
      ],
    },
    channel_tools: {
      recommendedBotCommands: ['/schedule', '/digest', '/stats'],
      webhookEndpoint: '/api/webhooks/telegram',
      requiredSecrets: ['TELEGRAM_BOT_TOKEN', 'CHANNEL_CHAT_ID'],
      setupChecklist: [
        'Promote bot as channel administrator with post permissions',
        'Configure scheduled Worker Cron Trigger for editorial digests',
        'Track post delivery logs in D1',
      ],
    },
    mini_app: {
      recommendedBotCommands: ['/app', '/support'],
      webhookEndpoint: '/api/auth/telegram',
      requiredSecrets: ['TELEGRAM_BOT_TOKEN', 'JWT_SECRET'],
      setupChecklist: [
        'Deploy React + Vite bundle via Cloudflare Workers Assets',
        'Set Menu Button WebApp URL via setChatMenuButton',
        'Verify initData HMAC-SHA256 on every login',
      ],
    },
    integration: {
      recommendedBotCommands: ['/connect', '/sync'],
      webhookEndpoint: '/api/webhooks/telegram',
      requiredSecrets: ['TELEGRAM_BOT_TOKEN', 'EXTERNAL_API_KEY'],
      setupChecklist: [
        'Define inbound/outbound webhook Zod contracts',
        'Add D1 idempotency key check for external events',
        'Encrypt third-party tokens before storage',
      ],
    },
    support_automation: {
      recommendedBotCommands: ['/ticket', '/faq', '/agent'],
      webhookEndpoint: '/api/webhooks/telegram',
      requiredSecrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'],
      setupChecklist: [
        'Connect Cloudflare Workers AI FAQ triage prompt',
        'Route unresolved tickets to human admin group',
        'Log resolution metrics in D1',
      ],
    },
  };

  return map[serviceType];
}

function mapServiceRow(row: DbServiceRow): TelegramService {
  return {
    id: row.id,
    userId: row.user_id,
    serviceType: row.service_type,
    title: row.title,
    requirements: row.requirements,
    config: JSON.parse(row.config_json) as TelegramServiceConfig,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

telegramServicesRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, user_id, service_type, title, requirements, config_json, status, created_at, updated_at FROM telegram_services WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30'
    )
    .bind(user.id)
    .all<DbServiceRow>();

  return c.json({
    services: (rows.results ?? []).map(mapServiceRow),
  });
});

telegramServicesRoutes.post(
  '/',
  zValidator('json', createTelegramServiceSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const { serviceType, title, requirements } = c.req.valid('json');
    const config = buildServiceBlueprintConfig(serviceType);
    const id = `tgs_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

    await db
      .prepare(
        `INSERT INTO telegram_services (id, user_id, service_type, title, requirements, config_json, status)
         VALUES (?, ?, ?, ?, ?, ?, 'planned')`
      )
      .bind(id, user.id, serviceType, title, requirements, JSON.stringify(config))
      .run();

    const row = await db
      .prepare(
        'SELECT id, user_id, service_type, title, requirements, config_json, status, created_at, updated_at FROM telegram_services WHERE id = ?'
      )
      .bind(id)
      .first<DbServiceRow>();

    return c.json({ service: row ? mapServiceRow(row) : null }, 201);
  }
);

telegramServicesRoutes.patch(
  '/:id',
  zValidator('json', updateTelegramServiceStatusSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const { status } = c.req.valid('json');
    const res = await db
      .prepare(
        "UPDATE telegram_services SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?"
      )
      .bind(status, id, user.id)
      .run();

    if (!res.meta.changes) {
      return c.json({ error: 'Telegram service not found' }, 404);
    }

    const row = await db
      .prepare(
        'SELECT id, user_id, service_type, title, requirements, config_json, status, created_at, updated_at FROM telegram_services WHERE id = ?'
      )
      .bind(id)
      .first<DbServiceRow>();

    return c.json({ service: row ? mapServiceRow(row) : null });
  }
);

telegramServicesRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const res = await db
    .prepare('DELETE FROM telegram_services WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Telegram service not found' }, 404);
  }

  return c.json({ ok: true });
});

export default telegramServicesRoutes;
