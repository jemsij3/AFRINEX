import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../worker/index.ts';
import type { WorkerBindings } from '../worker/types.ts';
import {
  APP_SETTING_DB_KEYS,
  DEFAULT_APP_SETTINGS,
  DEFAULT_APP_SETTINGS_ROWS,
} from '../shared/settingsDefaults.ts';
import { timingSafeEqual, utcDayStartIso, utcToday } from '../shared/utils.ts';
import { isEncryptedBotToken } from '../worker/lib/botTokenCrypto.ts';
import { ensureD1Schema, resetSchemaEnsureCacheForTests } from '../worker/lib/schemaEnsure.ts';
import { PRO_PLANS } from '../worker/lib/telegramBot.ts';
import { createMigratedTestDb, createSignedTelegramInitData } from './d1-shim.ts';

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_JWT_SECRET = 'test-jwt-secret-with-at-least-thirty-two-characters-here';
const TEST_TG_BOT_TOKEN = '123456789:AAHTestTelegramBotTokenForSigning123456';

function makeEnv(d1: D1Database, overrides: Partial<WorkerBindings> = {}): WorkerBindings {
  return {
    DB: d1,
    ENVIRONMENT: 'production',
    APP_BASE_URL: 'https://afrinex.example.com',
    BOT_TOKEN_ENCRYPTION_KEY: TEST_KEY_HEX,
    JWT_SECRET: TEST_JWT_SECRET,
    TELEGRAM_BOT_TOKEN: TEST_TG_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-with-at-least-thirty-two-chars',
    ADMIN_TELEGRAM_IDS: '999000111',
    AI: {
      run: async () => ({ response: 'Mock consolidated AFRINEX AI reply.' }),
    } as unknown as Ai,
    ...overrides,
  };
}

async function loginMember(d1: D1Database, env: WorkerBindings, tgId = 55001122) {
  const initData = await createSignedTelegramInitData(
    { id: tgId, first_name: 'Kofi', username: `kofi_${tgId}` },
    TEST_TG_BOT_TOKEN
  );
  const res = await app.request(
    'https://afrinex.example.com/api/auth/telegram',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    },
    env
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { token: string; user: { id: string } };
  return {
    userId: body.user.id,
    headers: { Authorization: `Bearer ${body.token}` },
  };
}

describe('Phase 2: Code Consolidation & Architecture Cleanup', () => {
  it('shared timingSafeEqual handles equal, unequal, UTF-8, and differing lengths cleanly', () => {
    assert.equal(timingSafeEqual('', ''), true);
    assert.equal(timingSafeEqual('secret-token-123', 'secret-token-123'), true);
    assert.equal(timingSafeEqual('secret-token-123', 'secret-token-124'), false);
    assert.equal(timingSafeEqual('short', 'short-extra'), false);
    assert.equal(timingSafeEqual('afrinex-ütf8', 'afrinex-ütf8'), true);
    assert.equal(timingSafeEqual('afrinex-ütf8', 'afrinex-utf8'), false);
  });

  it('shared utcToday and utcDayStartIso align strictly to UTC calendar dates', () => {
    const beforeMidnight = new Date('2026-03-01T23:59:59.999Z');
    const atMidnight = new Date('2026-03-02T00:00:00.000Z');

    assert.equal(utcToday(beforeMidnight), '2026-03-01');
    assert.equal(utcToday(beforeMidnight.getTime()), '2026-03-01');
    assert.equal(utcToday(atMidnight), '2026-03-02');
    assert.equal(utcDayStartIso(beforeMidnight), '2026-03-01T00:00:00.000Z');
  });

  it('single-sources default app settings between JSON, TypeScript Worker config, and D1 seed rows', () => {
    const rawJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'shared/defaultAppSettings.json'), 'utf8')
    ) as Record<string, { dbKey: string; value: unknown }>;

    assert.equal(Object.keys(rawJson).length, Object.keys(DEFAULT_APP_SETTINGS).length);
    assert.equal(DEFAULT_APP_SETTINGS_ROWS.length, Object.keys(rawJson).length);

    for (const [camelKey, def] of Object.entries(rawJson)) {
      const typedKey = camelKey as keyof typeof DEFAULT_APP_SETTINGS;
      assert.equal(APP_SETTING_DB_KEYS[typedKey], def.dbKey);
      assert.deepEqual(DEFAULT_APP_SETTINGS[typedKey], def.value);
    }

    assert.equal(PRO_PLANS.pro_monthly.starsAmount, DEFAULT_APP_SETTINGS.proMonthlyStars);
    assert.equal(PRO_PLANS.pro_yearly.starsAmount, DEFAULT_APP_SETTINGS.proYearlyStars);
  });

  it('removes legacy /api/telegram-services route and updates platform blueprint to /api/telegram-bots', async () => {
    const { d1 } = createMigratedTestDb();
    const env = makeEnv(d1);
    const member = await loginMember(d1, env, 77001122);

    const legacyGet = await app.request(
      'https://afrinex.example.com/api/telegram-services',
      { method: 'GET', headers: member.headers },
      env
    );
    assert.equal(legacyGet.status, 404);

    const legacyPost = await app.request(
      'https://afrinex.example.com/api/telegram-services',
      {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceType: 'bot_dev', title: 'Old', requirements: 'Obsolete test payload' }),
      },
      env
    );
    assert.equal(legacyPost.status, 404);

    const bpRes = await app.request('https://afrinex.example.com/api/platform/blueprint', undefined, env);
    assert.equal(bpRes.status, 200);
    const bpBody = (await bpRes.json()) as {
      sections: Array<{ id: string; title: string; endpoints: string[] }>;
    };
    assert.equal(bpBody.sections.some((s) => s.id === 'telegram'), false);
    const botsSection = bpBody.sections.find((s) => s.id === 'telegram-bots');
    assert.ok(botsSection);
    assert.equal(botsSection.title, 'Telegram Bots');
    assert.ok(botsSection.endpoints.some((e) => e.includes('/api/telegram-bots')));
  });

  it('keeps consolidated /api/telegram-bots/* lifecycle, AES-GCM encryption, and webhook receiver intact', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);
    const member = await loginMember(d1, env, 88001122);

    const originalFetch = globalThis.fetch;
    const sentMessages: Array<{ chat_id: number; text: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/getMe')) {
        return new Response(
          JSON.stringify({ ok: true, result: { id: 901, username: 'afrinex_sample_bot', first_name: 'SampleBot' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/setWebhook') || url.endsWith('/deleteWebhook')) {
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/sendMessage')) {
        sentMessages.push(JSON.parse(String(init?.body ?? '{}')) as { chat_id: number; text: string });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const sampleToken = '998877665:AAHConsolidatedSampleBotToken12345';
      const regRes = await app.request(
        'https://afrinex.example.com/api/telegram-bots/register-bot',
        {
          method: 'POST',
          headers: { ...member.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bot_token: sampleToken }),
        },
        env
      );
      assert.equal(regRes.status, 201);
      const regData = (await regRes.json()) as { bot: { id: string; bot_username: string } };
      const botId = regData.bot.id;

      const storedRow = sqlite
        .prepare('SELECT bot_token FROM telegram_bots WHERE id = ?')
        .get(botId) as { bot_token: string };
      assert.equal(isEncryptedBotToken(storedRow.bot_token), true);

      const hookRes = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${botId}/webhook`,
        { method: 'POST', headers: member.headers },
        env
      );
      assert.equal(hookRes.status, 200);

      const dbHook = sqlite
        .prepare('SELECT webhook_secret, webhook_active FROM telegram_bots WHERE id = ?')
        .get(botId) as { webhook_secret: string; webhook_active: number };
      assert.equal(dbHook.webhook_active, 1);

      const badReceiver = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${botId}/receiver`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
          },
          body: JSON.stringify({ update_id: 1, message: { chat: { id: 42 }, text: '/start' } }),
        },
        env
      );
      assert.equal(badReceiver.status, 401);

      const goodReceiver = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${botId}/receiver`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': dbHook.webhook_secret,
          },
          body: JSON.stringify({ update_id: 2, message: { message_id: 9, chat: { id: 42 }, from: { id: 42 }, text: '/start' } }),
        },
        env
      );
      assert.equal(goodReceiver.status, 200);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].text.includes('SampleBot'));

      const analyticsRes = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${botId}/analytics`,
        { method: 'GET', headers: member.headers },
        env
      );
      assert.equal(analyticsRes.status, 200);
      const analytics = (await analyticsRes.json()) as { stats: Array<{ event_type: string; count: number }> };
      assert.equal(analytics.stats[0].event_type, 'command');
      assert.equal(analytics.stats[0].count, 1);

      const delHook = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${botId}/webhook`,
        { method: 'DELETE', headers: member.headers },
        env
      );
      assert.equal(delHook.status, 200);

      const delBot = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${botId}`,
        { method: 'DELETE', headers: member.headers },
        env
      );
      assert.equal(delBot.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('supports consolidated AI Assistant chat, usage, rename, and delete endpoints', async () => {
    const { d1 } = createMigratedTestDb();
    const env = makeEnv(d1);
    const member = await loginMember(d1, env, 99112233);

    const chatRes = await app.request(
      'https://afrinex.example.com/api/ai/chat',
      {
        method: 'POST',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'tech', message: 'Summarize Cloudflare D1 benefits.' }),
      },
      env
    );
    assert.equal(chatRes.status, 200);
    const chatData = (await chatRes.json()) as {
      conversation: { id: string; title: string };
      assistantMessage: { content: string };
    };
    assert.ok(chatData.conversation.id);
    assert.ok(chatData.assistantMessage.content.includes('AFRINEX AI'));

    const usageRes = await app.request(
      'https://afrinex.example.com/api/ai/usage',
      { method: 'GET', headers: member.headers },
      env
    );
    assert.equal(usageRes.status, 200);
    const usage = (await usageRes.json()) as { used: number; limit: number | string };
    assert.equal(usage.used, 1);
    assert.equal(usage.limit, 20);

    const renameRes = await app.request(
      `https://afrinex.example.com/api/ai/conversations/${chatData.conversation.id}`,
      {
        method: 'PATCH',
        headers: { ...member.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Cloudflare D1 Notes' }),
      },
      env
    );
    assert.equal(renameRes.status, 200);
    const renamed = (await renameRes.json()) as { conversation: { title: string } };
    assert.equal(renamed.conversation.title, 'Cloudflare D1 Notes');

    const delRes = await app.request(
      `https://afrinex.example.com/api/ai/conversations/${chatData.conversation.id}`,
      { method: 'DELETE', headers: member.headers },
      env
    );
    assert.equal(delRes.status, 200);
  });

  it('ensureD1Schema fast-paths on fully migrated DB and has no conflicting full-table DDL', async () => {
    resetSchemaEnsureCacheForTests();
    const { d1 } = createMigratedTestDb();
    await ensureD1Schema(d1);

    const schemaEnsureSource = readFileSync(resolve(process.cwd(), 'worker/lib/schemaEnsure.ts'), 'utf8');
    assert.equal(schemaEnsureSource.includes('MISSING_TABLE_DDL'), false);
    assert.equal(schemaEnsureSource.includes('telegram_services'), false);
  });
});
