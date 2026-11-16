import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
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
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const telegramServicesRoutes = new Hono<AppEnv>();

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

interface DbBotRow {
  id: string;
  user_id: string;
  bot_token: string;
  bot_username: string | null;
  bot_name: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_active: number;
  created_at: string;
  updated_at: string;
}

const registerBotSchema = z.object({ bot_token: z.string().trim().min(20).max(256) });
const telegramUpdateSchema = z.record(z.string(), z.unknown()).refine(
  (value) => Object.keys(value).length <= 100,
  'Telegram update has too many fields'
);

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

function publicBot(row: DbBotRow) {
  return {
    id: row.id,
    bot_username: row.bot_username,
    bot_name: row.bot_name,
    webhook_url: row.webhook_url,
    webhook_active: row.webhook_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

async function callTelegram<T>(token: string, method: string, payload?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} request failed`);
  }
  return data.result as T;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getEventType(update: Record<string, unknown>): string {
  const message = (update.message ?? update.edited_message) as { text?: unknown } | undefined;
  if (message && typeof message.text === 'string') {
    return message.text.startsWith('/') ? 'command' : 'message';
  }
  if (update.callback_query) return 'callback_query';
  if (update.inline_query) return 'inline_query';
  if (update.channel_post) return 'channel_post';
  return 'other';
}

function getSafeEventData(update: Record<string, unknown>): string {
  const message = (update.message ?? update.edited_message ?? update.channel_post) as
    | { message_id?: unknown; from?: { id?: unknown }; text?: unknown }
    | undefined;
  const text = typeof message?.text === 'string' ? message.text : '';
  const command = text.startsWith('/') ? text.split(/\s/, 1)[0].slice(0, 64) : undefined;
  return JSON.stringify({
    update_id: typeof update.update_id === 'number' ? update.update_id : null,
    message_id: typeof message?.message_id === 'number' ? message.message_id : null,
    user_id: typeof message?.from?.id === 'number' ? message.from.id : null,
    command,
  });
}

// Public Telegram receiver is declared before the protected service routes. It
// authenticates requests using the per-bot Telegram webhook secret header.
telegramServicesRoutes.post(
  '/bots/:id/receiver',
  rateLimit({ keyPrefix: 'telegram_bot_webhook', limit: 120, windowSeconds: 60 }),
  zValidator('json', telegramUpdateSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);
    const botId = c.req.param('id');
    const bot = await db
      .prepare('SELECT id, webhook_secret, webhook_active FROM telegram_bots WHERE id = ?')
      .bind(botId)
      .first<{ id: string; webhook_secret: string | null; webhook_active: number }>();
    if (!bot || bot.webhook_active !== 1 || !bot.webhook_secret) {
      return c.json({ error: 'Webhook is not active' }, 404);
    }
    const providedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (!providedSecret || !timingSafeEqual(providedSecret, bot.webhook_secret)) {
      return c.json({ error: 'Unauthorized webhook' }, 401);
    }

    const update = c.req.valid('json');
    await db.prepare(
      'INSERT INTO telegram_analytics (id, bot_id, event_type, event_data) VALUES (?, ?, ?, ?)'
    ).bind(
      `tge_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      botId,
      getEventType(update),
      getSafeEventData(update),
    ).run();
    return c.json({ ok: true });
  },
);

telegramServicesRoutes.get('/', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const rows = await db.prepare(
    'SELECT id, user_id, service_type, title, requirements, config_json, status, created_at, updated_at FROM telegram_services WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30'
  ).bind(user.id).all<DbServiceRow>();
  return c.json({ services: (rows.results ?? []).map(mapServiceRow) });
});

telegramServicesRoutes.post(
  '/',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_service', limit: 30, windowSeconds: 60 }),
  zValidator('json', createTelegramServiceSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);
    const { serviceType, title, requirements } = c.req.valid('json');
    const config = buildServiceBlueprintConfig(serviceType);
    const id = `tgs_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await db.prepare(
      `INSERT INTO telegram_services (id, user_id, service_type, title, requirements, config_json, status)
       VALUES (?, ?, ?, ?, ?, ?, 'planned')`
    ).bind(id, user.id, serviceType, title, requirements, JSON.stringify(config)).run();
    const row = await db.prepare(
      'SELECT id, user_id, service_type, title, requirements, config_json, status, created_at, updated_at FROM telegram_services WHERE id = ?'
    ).bind(id).first<DbServiceRow>();
    return c.json({ service: row ? mapServiceRow(row) : null }, 201);
  },
);

telegramServicesRoutes.patch(
  '/:id',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_service', limit: 30, windowSeconds: 60 }),
  zValidator('json', updateTelegramServiceStatusSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);
    const { status } = c.req.valid('json');
    const result = await db.prepare(
      "UPDATE telegram_services SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?"
    ).bind(status, id, user.id).run();
    if (!result.meta.changes) return c.json({ error: 'Telegram service not found' }, 404);
    const row = await db.prepare(
      'SELECT id, user_id, service_type, title, requirements, config_json, status, created_at, updated_at FROM telegram_services WHERE id = ?'
    ).bind(id).first<DbServiceRow>();
    return c.json({ service: row ? mapServiceRow(row) : null });
  },
);

telegramServicesRoutes.delete('/:id', requireAuth, rateLimit({ keyPrefix: 'telegram_service', limit: 30, windowSeconds: 60 }), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const result = await db.prepare('DELETE FROM telegram_services WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  if (!result.meta.changes) return c.json({ error: 'Telegram service not found' }, 404);
  return c.json({ ok: true });
});

telegramServicesRoutes.post(
  '/register-bot',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_register', limit: 10, windowSeconds: 60 }),
  zValidator('json', registerBotSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);
    const { bot_token: botToken } = c.req.valid('json');
    let telegramBot: { id: number; username?: string; first_name?: string };
    try {
      telegramBot = await callTelegram(botToken, 'getMe');
    } catch (error) {
      return c.json({ error: 'Invalid Telegram bot token', message: error instanceof Error ? error.message : 'Telegram token validation failed.' }, 400);
    }
    const existing = await db.prepare('SELECT id FROM telegram_bots WHERE user_id = ? AND bot_username = ?')
      .bind(user.id, telegramBot.username ?? '').first<{ id: string }>();
    if (existing) return c.json({ error: 'This bot is already registered.' }, 409);

    const id = `bot_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await db.prepare(
      'INSERT INTO telegram_bots (id, user_id, bot_token, bot_username, bot_name) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, user.id, botToken, telegramBot.username ?? null, telegramBot.first_name ?? null).run();
    const row = await db.prepare('SELECT id, user_id, bot_token, bot_username, bot_name, webhook_url, webhook_secret, webhook_active, created_at, updated_at FROM telegram_bots WHERE id = ?')
      .bind(id).first<DbBotRow>();
    return c.json({ bot: row ? publicBot(row) : null }, 201);
  },
);

telegramServicesRoutes.get('/bots', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const rows = await db.prepare(
    'SELECT id, user_id, bot_token, bot_username, bot_name, webhook_url, webhook_secret, webhook_active, created_at, updated_at FROM telegram_bots WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(user.id).all<DbBotRow>();
  return c.json({ bots: (rows.results ?? []).map(publicBot) });
});

telegramServicesRoutes.delete('/bots/:id', requireAuth, rateLimit({ keyPrefix: 'telegram_bot_manage', limit: 30, windowSeconds: 60 }), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const bot = await db.prepare('SELECT id, bot_token, webhook_active FROM telegram_bots WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).first<{ id: string; bot_token: string; webhook_active: number }>();
  if (!bot) return c.json({ error: 'Bot not found' }, 404);
  if (bot.webhook_active) {
    try { await callTelegram(bot.bot_token, 'deleteWebhook', { drop_pending_updates: false }); }
    catch (error) { return c.json({ error: 'Could not remove Telegram webhook', message: error instanceof Error ? error.message : 'Telegram API failed.' }, 502); }
  }
  await db.prepare('DELETE FROM telegram_bots WHERE id = ? AND user_id = ?').bind(bot.id, user.id).run();
  return c.json({ ok: true });
});

telegramServicesRoutes.post('/bots/:id/webhook', requireAuth, rateLimit({ keyPrefix: 'telegram_bot_manage', limit: 20, windowSeconds: 60 }), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const bot = await db.prepare('SELECT id, bot_token FROM telegram_bots WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).first<{ id: string; bot_token: string }>();
  if (!bot) return c.json({ error: 'Bot not found' }, 404);
  const webhookUrl = new URL(`/api/telegram-services/bots/${encodeURIComponent(bot.id)}/receiver`, c.req.url).toString();
  const webhookSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  try {
    await callTelegram(bot.bot_token, 'setWebhook', { url: webhookUrl, secret_token: webhookSecret, allowed_updates: ['message', 'edited_message', 'callback_query', 'inline_query', 'channel_post'] });
  } catch (error) {
    return c.json({ error: 'Could not configure Telegram webhook', message: error instanceof Error ? error.message : 'Telegram API failed.' }, 502);
  }
  await db.prepare(
    "UPDATE telegram_bots SET webhook_url = ?, webhook_secret = ?, webhook_active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?"
  ).bind(webhookUrl, webhookSecret, bot.id, user.id).run();
  return c.json({ webhook_url: webhookUrl, webhook_active: true });
});

telegramServicesRoutes.delete('/bots/:id/webhook', requireAuth, rateLimit({ keyPrefix: 'telegram_bot_manage', limit: 20, windowSeconds: 60 }), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const bot = await db.prepare('SELECT id, bot_token FROM telegram_bots WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).first<{ id: string; bot_token: string }>();
  if (!bot) return c.json({ error: 'Bot not found' }, 404);
  try { await callTelegram(bot.bot_token, 'deleteWebhook', { drop_pending_updates: false }); }
  catch (error) { return c.json({ error: 'Could not delete Telegram webhook', message: error instanceof Error ? error.message : 'Telegram API failed.' }, 502); }
  await db.prepare(
    "UPDATE telegram_bots SET webhook_active = 0, webhook_secret = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?"
  ).bind(bot.id, user.id).run();
  return c.json({ ok: true, webhook_active: false });
});

export default telegramServicesRoutes;
