import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { timingSafeEqual } from '../../shared/utils.ts';
import {
  decryptBotToken,
  encryptBotToken,
  validateBotTokenEncryptionKey,
} from '../lib/botTokenCrypto.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { resolveAppBaseUrl } from '../lib/origin.ts';
import { getAppSettings } from '../lib/settings.ts';
import { callTelegramBotApi } from '../lib/telegramBot.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const telegramBotManagement = new Hono<AppEnv>();

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

const registerBotSchema = z.object({
  bot_token: z.string().trim().min(20).max(256),
});

const telegramUpdateSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 100, 'Telegram update has too many fields');

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

// Public Telegram webhook receiver (no user auth; verifies per-bot secret header)
telegramBotManagement.post(
  '/bots/:id/receiver',
  rateLimit({ keyPrefix: 'telegram_bot_webhook', limit: 120, windowSeconds: 60 }),
  zValidator('json', telegramUpdateSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const botId = c.req.param('id');
    const bot = await db
      .prepare(
        'SELECT id, bot_token, bot_name, bot_username, webhook_secret, webhook_active FROM telegram_bots WHERE id = ?'
      )
      .bind(botId)
      .first<{
        id: string;
        bot_token: string;
        bot_name: string | null;
        bot_username: string | null;
        webhook_secret: string | null;
        webhook_active: number;
      }>();

    if (!bot || bot.webhook_active !== 1 || !bot.webhook_secret) {
      return c.json({ error: 'Webhook is not active' }, 404);
    }

    const providedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
    if (!providedSecret || !timingSafeEqual(providedSecret, bot.webhook_secret)) {
      return c.json({ error: 'Unauthorized webhook' }, 401);
    }

    const update = c.req.valid('json');
    await db
      .prepare(
        'INSERT INTO telegram_analytics (id, bot_id, event_type, event_data) VALUES (?, ?, ?, ?)'
      )
      .bind(
        `tge_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        botId,
        getEventType(update),
        getSafeEventData(update)
      )
      .run();

    // Handle /start, /help, and echo text messages back via Telegram sendMessage
    const msg = update.message as
      | { chat?: { id?: unknown }; text?: unknown }
      | undefined;
    const chatId =
      msg?.chat && typeof msg.chat.id === 'number' ? msg.chat.id : null;
    const rawText = typeof msg?.text === 'string' ? msg.text.trim() : '';

    if (chatId !== null && rawText.length > 0) {
      let replyText: string;
      const commandToken = rawText.split(/\s/, 1)[0].split('@')[0].toLowerCase();
      if (commandToken === '/start') {
        const displayName = bot.bot_name || (bot.bot_username ? `@${bot.bot_username}` : 'AFRINEX Bot');
        replyText = `Welcome to ${displayName}! Connected via AFRINEX.\n\nSend /help for commands or send any message to test echo responses.`;
      } else if (commandToken === '/help') {
        replyText =
          'Available commands:\n/start — Welcome message\n/help — Show command help\n\nSend any other text message to receive an echo reply.';
      } else {
        replyText = `Echo: ${rawText.slice(0, 3500)}`;
      }

      try {
        const plainToken = await decryptBotToken(
          bot.bot_token,
          c.env.BOT_TOKEN_ENCRYPTION_KEY,
          bot.id,
          { allowLegacyPlaintext: true }
        );
        await callTelegramBotApi(plainToken, 'sendMessage', {
          chat_id: chatId,
          text: replyText,
        });
      } catch {
        // Event is already recorded; avoid failing Telegram webhook delivery
      }
    }

    return c.json({ ok: true });
  }
);

telegramBotManagement.post(
  '/register-bot',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_register', limit: 10, windowSeconds: 60 }),
  zValidator('json', registerBotSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureTelegramServicesEnabled', user)) {
      return featureDisabledResponse(c, 'Telegram Bot Services');
    }

    try {
      await validateBotTokenEncryptionKey(c.env.BOT_TOKEN_ENCRYPTION_KEY);
    } catch {
      return c.json(
        {
          error: 'Server misconfigured',
          message: 'BOT_TOKEN_ENCRYPTION_KEY must be configured with a valid 32-byte encryption key.',
        },
        500
      );
    }

    const { bot_token: botToken } = c.req.valid('json');
    let telegramBot: { id: number; username?: string; first_name?: string };
    try {
      telegramBot = await callTelegramBotApi(botToken, 'getMe');
    } catch (error) {
      return c.json(
        {
          error: 'Invalid Telegram bot token',
          message:
            error instanceof Error ? error.message : 'Telegram token validation failed.',
        },
        400
      );
    }

    const existing = await db
      .prepare('SELECT id FROM telegram_bots WHERE user_id = ? AND bot_username = ?')
      .bind(user.id, telegramBot.username ?? '')
      .first<{ id: string }>();
    if (existing) {
      return c.json({ error: 'This bot is already registered.' }, 409);
    }

    const id = `bot_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    let encryptedToken: string;
    try {
      encryptedToken = await encryptBotToken(botToken, c.env.BOT_TOKEN_ENCRYPTION_KEY, id);
    } catch {
      return c.json(
        {
          error: 'Server misconfigured',
          message: 'Failed to encrypt Telegram bot token.',
        },
        500
      );
    }

    await db
      .prepare(
        'INSERT INTO telegram_bots (id, user_id, bot_token, bot_username, bot_name) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(
        id,
        user.id,
        encryptedToken,
        telegramBot.username ?? null,
        telegramBot.first_name ?? null
      )
      .run();

    const row = await db
      .prepare(
        'SELECT id, user_id, bot_token, bot_username, bot_name, webhook_url, webhook_secret, webhook_active, created_at, updated_at FROM telegram_bots WHERE id = ?'
      )
      .bind(id)
      .first<DbBotRow>();

    return c.json({ bot: row ? publicBot(row) : null }, 201);
  }
);

telegramBotManagement.get('/bots', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const settings = await getAppSettings(db);
  if (!isFeatureAccessible(settings, 'featureTelegramServicesEnabled', user)) {
    return featureDisabledResponse(c, 'Telegram Bot Services');
  }

  const rows = await db
    .prepare(
      'SELECT id, user_id, bot_token, bot_username, bot_name, webhook_url, webhook_secret, webhook_active, created_at, updated_at FROM telegram_bots WHERE user_id = ? ORDER BY created_at DESC'
    )
    .bind(user.id)
    .all<DbBotRow>();

  return c.json({ bots: (rows.results ?? []).map(publicBot) });
});

telegramBotManagement.delete(
  '/bots/:id',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_manage', limit: 30, windowSeconds: 60 }),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureTelegramServicesEnabled', user)) {
      return featureDisabledResponse(c, 'Telegram Bot Services');
    }

    const bot = await db
      .prepare('SELECT id, bot_token, webhook_active FROM telegram_bots WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), user.id)
      .first<{ id: string; bot_token: string; webhook_active: number }>();

    if (!bot) return c.json({ error: 'Bot not found' }, 404);

    if (bot.webhook_active) {
      let plainToken: string;
      try {
        plainToken = await decryptBotToken(
          bot.bot_token,
          c.env.BOT_TOKEN_ENCRYPTION_KEY,
          bot.id,
          { allowLegacyPlaintext: true }
        );
      } catch (err) {
        return c.json(
          {
            error: 'Server misconfigured',
            message:
              err instanceof Error
                ? err.message
                : 'BOT_TOKEN_ENCRYPTION_KEY cannot decrypt stored bot token.',
          },
          500
        );
      }

      try {
        await callTelegramBotApi(plainToken, 'deleteWebhook', {
          drop_pending_updates: false,
        });
      } catch (error) {
        return c.json(
          {
            error: 'Could not remove Telegram webhook',
            message: error instanceof Error ? error.message : 'Telegram API failed.',
          },
          502
        );
      }
    }

    await db.batch([
      db.prepare('DELETE FROM telegram_analytics WHERE bot_id = ?').bind(bot.id),
      db
        .prepare('DELETE FROM telegram_bots WHERE id = ? AND user_id = ?')
        .bind(bot.id, user.id),
    ]);

    return c.json({ ok: true });
  }
);

telegramBotManagement.post(
  '/bots/:id/webhook',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_manage', limit: 20, windowSeconds: 60 }),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureTelegramServicesEnabled', user)) {
      return featureDisabledResponse(c, 'Telegram Bot Services');
    }

    const originRes = resolveAppBaseUrl(c.env, c.req.url);
    if (!originRes.ok) {
      return c.json({ error: 'Server misconfigured', message: originRes.message }, 500);
    }

    const bot = await db
      .prepare('SELECT id, bot_token FROM telegram_bots WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), user.id)
      .first<{ id: string; bot_token: string }>();

    if (!bot) return c.json({ error: 'Bot not found' }, 404);

    let plainToken: string;
    try {
      plainToken = await decryptBotToken(
        bot.bot_token,
        c.env.BOT_TOKEN_ENCRYPTION_KEY,
        bot.id,
        { allowLegacyPlaintext: true }
      );
    } catch (err) {
      return c.json(
        {
          error: 'Server misconfigured',
          message:
            err instanceof Error
              ? err.message
              : 'BOT_TOKEN_ENCRYPTION_KEY cannot decrypt stored bot token.',
        },
        500
      );
    }

    const webhookUrl = `${originRes.baseUrl}/api/telegram-bots/bots/${encodeURIComponent(bot.id)}/receiver`;
    const webhookSecret =
      crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    try {
      await callTelegramBotApi(plainToken, 'setWebhook', {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: [
          'message',
          'edited_message',
          'callback_query',
          'inline_query',
          'channel_post',
        ],
      });
    } catch (error) {
      return c.json(
        {
          error: 'Could not configure Telegram webhook',
          message: error instanceof Error ? error.message : 'Telegram API failed.',
        },
        502
      );
    }

    await db
      .prepare(
        "UPDATE telegram_bots SET webhook_url = ?, webhook_secret = ?, webhook_active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?"
      )
      .bind(webhookUrl, webhookSecret, bot.id, user.id)
      .run();

    return c.json({ webhook_url: webhookUrl, webhook_active: true });
  }
);

telegramBotManagement.delete(
  '/bots/:id/webhook',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_manage', limit: 20, windowSeconds: 60 }),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureTelegramServicesEnabled', user)) {
      return featureDisabledResponse(c, 'Telegram Bot Services');
    }

    const bot = await db
      .prepare('SELECT id, bot_token FROM telegram_bots WHERE id = ? AND user_id = ?')
      .bind(c.req.param('id'), user.id)
      .first<{ id: string; bot_token: string }>();

    if (!bot) return c.json({ error: 'Bot not found' }, 404);

    let plainToken: string;
    try {
      plainToken = await decryptBotToken(
        bot.bot_token,
        c.env.BOT_TOKEN_ENCRYPTION_KEY,
        bot.id,
        { allowLegacyPlaintext: true }
      );
    } catch (err) {
      return c.json(
        {
          error: 'Server misconfigured',
          message:
            err instanceof Error
              ? err.message
              : 'BOT_TOKEN_ENCRYPTION_KEY cannot decrypt stored bot token.',
        },
        500
      );
    }

    try {
      await callTelegramBotApi(plainToken, 'deleteWebhook', {
        drop_pending_updates: false,
      });
    } catch (error) {
      return c.json(
        {
          error: 'Could not delete Telegram webhook',
          message: error instanceof Error ? error.message : 'Telegram API failed.',
        },
        502
      );
    }

    await db
      .prepare(
        "UPDATE telegram_bots SET webhook_url = NULL, webhook_active = 0, webhook_secret = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?"
      )
      .bind(bot.id, user.id)
      .run();

    return c.json({ ok: true, webhook_active: false });
  }
);

telegramBotManagement.get(
  '/bots/:id/analytics',
  requireAuth,
  rateLimit({ keyPrefix: 'telegram_bot_analytics', limit: 60, windowSeconds: 60 }),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const botId = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureTelegramServicesEnabled', user)) {
      return featureDisabledResponse(c, 'Telegram Bot Services');
    }

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
  }
);

export default telegramBotManagement;
