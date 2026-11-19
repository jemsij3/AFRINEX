import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../worker/index.ts';
import type { WorkerBindings } from '../worker/types.ts';
import {
  decryptBotToken,
  encryptBotToken,
  isEncryptedBotToken,
  validateBotTokenEncryptionKey,
} from '../worker/lib/botTokenCrypto.ts';
import { resolveAppBaseUrl } from '../worker/lib/origin.ts';
import { computeInitDataHash } from '../worker/lib/telegramAuth.ts';
import { createMigratedTestDb, createSignedTelegramInitData } from './d1-shim.ts';

const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_KEY_BASE64 = Buffer.from(TEST_KEY_HEX, 'hex').toString('base64');
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
    ...overrides,
  };
}

describe('Phase 1: Bot Token Encryption, Auth Replay Protection, Origin & Security Headers', () => {
  it('AES-GCM bot token encryption supports hex/base64 keys, binds AAD to botId, and rejects invalid keys', async () => {
    await validateBotTokenEncryptionKey(TEST_KEY_HEX);
    await validateBotTokenEncryptionKey(TEST_KEY_BASE64);

    await assert.rejects(() => validateBotTokenEncryptionKey(undefined));
    await assert.rejects(() => validateBotTokenEncryptionKey('0'.repeat(64)));
    await assert.rejects(() => validateBotTokenEncryptionKey('too-short'));

    const token = '987654321:AAExamplePlaintextBotTokenSecret12345';
    const encrypted = await encryptBotToken(token, TEST_KEY_HEX, 'bot_abc');
    assert.equal(isEncryptedBotToken(encrypted), true);
    assert.equal(encrypted.includes(token), false);

    const decrypted = await decryptBotToken(encrypted, TEST_KEY_BASE64, 'bot_abc');
    assert.equal(decrypted, token);

    // Different botId (AAD mismatch) must fail decryption
    await assert.rejects(() => decryptBotToken(encrypted, TEST_KEY_HEX, 'bot_other'));

    // Unencrypted value rejected unless allowLegacyPlaintext is explicitly set
    await assert.rejects(() => decryptBotToken(token, TEST_KEY_HEX, 'bot_abc'));
    assert.equal(
      await decryptBotToken(token, TEST_KEY_HEX, 'bot_abc', { allowLegacyPlaintext: true }),
      token
    );
  });

  it('resolveAppBaseUrl enforces HTTPS public APP_BASE_URL in production and allows dev fallback', () => {
    const missingProd = resolveAppBaseUrl({ ENVIRONMENT: 'production' }, 'http://localhost:8787/api/test');
    assert.equal(missingProd.ok, false);

    const httpProd = resolveAppBaseUrl(
      { ENVIRONMENT: 'production', APP_BASE_URL: 'http://afrinex.example.com' },
      'https://ignored.local'
    );
    assert.equal(httpProd.ok, false);

    const localhostProd = resolveAppBaseUrl(
      { ENVIRONMENT: 'production', APP_BASE_URL: 'https://localhost:8787' },
      'https://ignored.local'
    );
    assert.equal(localhostProd.ok, false);

    const validProd = resolveAppBaseUrl(
      { ENVIRONMENT: 'production', APP_BASE_URL: 'https://mini.afrinex.example.com/subpath' },
      'http://localhost:8787'
    );
    assert.deepEqual(validProd, { ok: true, baseUrl: 'https://mini.afrinex.example.com' });

    const devFallback = resolveAppBaseUrl({ ENVIRONMENT: 'development' }, 'http://127.0.0.1:8787/api/x');
    assert.deepEqual(devFallback, { ok: true, baseUrl: 'http://127.0.0.1:8787' });
  });

  it('POST /api/auth/telegram blocks replays atomically, stores only SHA-256 hash, and preserves nonce on pre-auth rejections', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);

    const validInitData = await createSignedTelegramInitData(
      { id: 100200300, first_name: 'Amina', username: 'amina_dev' },
      TEST_TG_BOT_TOKEN
    );

    // 1. Pre-check rejection (registration disabled) must NOT consume the nonce
    sqlite
      .prepare("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES ('registration_enabled', 'false')")
      .run();

    const closedRes = await app.request(
      'https://afrinex.example.com/api/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: validInitData }),
      },
      env
    );
    assert.equal(closedRes.status, 403);
    const noncesAfterClosed = sqlite.prepare('SELECT COUNT(*) AS c FROM auth_nonces').get() as { c: number };
    assert.equal(noncesAfterClosed.c, 0);

    // 2. Re-enable registration -> first valid login succeeds
    sqlite
      .prepare("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES ('registration_enabled', 'true')")
      .run();

    const firstRes = await app.request(
      'https://afrinex.example.com/api/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: validInitData }),
      },
      env
    );
    assert.equal(firstRes.status, 200);
    const firstJson = (await firstRes.json()) as { token: string; user: { id: string } };
    assert.ok(firstJson.token);

    const expectedHash = await computeInitDataHash(validInitData);
    const nonceRow = sqlite
      .prepare('SELECT hash, expires_at FROM auth_nonces WHERE hash = ?')
      .get(expectedHash) as { hash: string; expires_at: number } | undefined;
    assert.ok(nonceRow);
    assert.equal(nonceRow.hash, expectedHash);
    assert.equal(nonceRow.hash.includes('amina_dev'), false);

    // 3. Replaying the exact same initData is rejected with 401 INIT_DATA_REPLAYED
    const replayRes = await app.request(
      'https://afrinex.example.com/api/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: validInitData }),
      },
      env
    );
    assert.equal(replayRes.status, 401);
    const replayJson = (await replayRes.json()) as { code: string };
    assert.equal(replayJson.code, 'INIT_DATA_REPLAYED');

    // 4. Expired initData rejected
    const expiredInitData = await createSignedTelegramInitData(
      { id: 100200300, first_name: 'Amina' },
      TEST_TG_BOT_TOKEN,
      Math.floor(Date.now() / 1000) - 600
    );
    const expiredRes = await app.request(
      'https://afrinex.example.com/api/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: expiredInitData }),
      },
      env
    );
    assert.equal(expiredRes.status, 401);

    // 5. Security headers verified on response
    assert.equal(firstRes.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(firstRes.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.ok(firstRes.headers.get('Permissions-Policy'));
    const csp = firstRes.headers.get('Content-Security-Policy') ?? '';
    assert.ok(csp.includes("frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://*.t.me"));
    assert.ok(firstRes.headers.get('Strict-Transport-Security')?.includes('max-age=31536000'));
  });

  it('telegramBots routes encrypt tokens at rest, omit tokens in responses, and reject missing encryption key or APP_BASE_URL', async () => {
    const { d1, sqlite } = createMigratedTestDb();
    const env = makeEnv(d1);

    // Sign in user
    const initData = await createSignedTelegramInitData(
      { id: 555666777, first_name: 'Kofi', username: 'kofi' },
      TEST_TG_BOT_TOKEN
    );
    const authRes = await app.request(
      'https://afrinex.example.com/api/auth/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      },
      env
    );
    const { token: jwt } = (await authRes.json()) as { token: string };

    const plainUserBotToken = '777111222:AAHUserOwnedTestBotTokenForAfrinex99';
    const originalFetch = globalThis.fetch;
    const telegramApiCalls: Array<{ url: string; body?: string }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      telegramApiCalls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.endsWith('/getMe')) {
        return new Response(
          JSON.stringify({ ok: true, result: { id: 777111222, username: 'kofi_test_bot', first_name: 'Kofi Bot' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/setWebhook') || url.endsWith('/deleteWebhook')) {
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      // Missing BOT_TOKEN_ENCRYPTION_KEY fails closed with 500 before writing plaintext
      const noKeyEnv = makeEnv(d1, { BOT_TOKEN_ENCRYPTION_KEY: '' });
      const noKeyRes = await app.request(
        'https://afrinex.example.com/api/telegram-bots/register-bot',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ bot_token: plainUserBotToken }),
        },
        noKeyEnv
      );
      assert.equal(noKeyRes.status, 500);
      assert.equal((sqlite.prepare('SELECT COUNT(*) AS c FROM telegram_bots').get() as { c: number }).c, 0);

      // Valid key encrypts token at rest and returns sanitized bot
      const regRes = await app.request(
        'https://afrinex.example.com/api/telegram-bots/register-bot',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ bot_token: plainUserBotToken }),
        },
        env
      );
      assert.equal(regRes.status, 201);
      const regBodyText = await regRes.text();
      assert.equal(regBodyText.includes(plainUserBotToken), false);
      const regJson = JSON.parse(regBodyText) as { bot: { id: string; bot_token?: string } };
      assert.equal(regJson.bot.bot_token, undefined);

      const stored = sqlite
        .prepare('SELECT id, bot_token FROM telegram_bots WHERE id = ?')
        .get(regJson.bot.id) as { id: string; bot_token: string };
      assert.equal(isEncryptedBotToken(stored.bot_token), true);
      assert.equal(stored.bot_token.includes(plainUserBotToken), false);

      // Missing APP_BASE_URL in production must fail webhook setup cleanly
      const noBaseUrlRes = await app.request(
        `https://afrinex.example.com/api/telegram-bots/bots/${regJson.bot.id}/webhook`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        },
        makeEnv(d1, { APP_BASE_URL: '' })
      );
      assert.equal(noBaseUrlRes.status, 500);

      // Valid APP_BASE_URL uses configured origin (never hardcoded workers.dev)
      const webhookRes = await app.request(
        `http://localhost:8787/api/telegram-bots/bots/${regJson.bot.id}/webhook`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        },
        env
      );
      assert.equal(webhookRes.status, 200);
      const webhookJson = (await webhookRes.json()) as { webhook_url: string; webhook_active: boolean };
      assert.equal(webhookJson.webhook_active, true);
      assert.ok(webhookJson.webhook_url.startsWith('https://afrinex.example.com/api/telegram-bots/bots/'));
      assert.equal(webhookJson.webhook_url.includes('derartuaman8'), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
