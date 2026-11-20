import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createIntegrationSchema,
  updateIntegrationSchema,
} from '../../shared/schemas.ts';
import type {
  IntegrationProvider,
  IntegrationRecord,
  IntegrationStatus,
} from '../../shared/types.ts';
import {
  decryptSecretValue,
  encryptSecretValue,
  isPublicSafeHttpUrl,
  maskSecretPreview,
  validateBotTokenEncryptionKey,
} from '../lib/botTokenCrypto.ts';
import { createNotificationSafe, logSystemEvent, scrubSensitiveText } from '../lib/monitoring.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const integrationRoutes = new Hono<AppEnv>();

integrationRoutes.use('*', requireAuth);

interface DbIntegrationRow {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  name: string;
  endpoint_url: string | null;
  credentials_encrypted: string | null;
  config_json: string;
  status: IntegrationStatus;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function safeParseConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapIntegrationPublic(row: DbIntegrationRow, previewOverride?: string | null): IntegrationRecord {
  const hasCred = Boolean(row.credentials_encrypted && row.credentials_encrypted.length > 0);
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    name: row.name,
    endpointUrl: row.endpoint_url,
    hasCredential: hasCred,
    credentialPreview: previewOverride ?? (hasCred ? 'Encrypted (AES-256-GCM)' : null),
    config: safeParseConfig(row.config_json),
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

integrationRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const providerFilter = c.req.query('provider');
  const validProvider =
    providerFilter &&
    ['telegram_bot', 'webhook', 'external_api', 'openai_compatible', 'custom'].includes(providerFilter);

  const rows = validProvider
    ? await db
        .prepare(
          `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                  status, last_tested_at, last_error, created_at, updated_at
           FROM integrations
           WHERE user_id = ? AND provider = ?
           ORDER BY updated_at DESC`
        )
        .bind(user.id, providerFilter)
        .all<DbIntegrationRow>()
    : await db
        .prepare(
          `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                  status, last_tested_at, last_error, created_at, updated_at
           FROM integrations
           WHERE user_id = ?
           ORDER BY updated_at DESC`
        )
        .bind(user.id)
        .all<DbIntegrationRow>();

  return c.json({
    integrations: (rows.results ?? []).map((row) => mapIntegrationPublic(row)),
  });
});

integrationRoutes.post(
  '/',
  rateLimit({ keyPrefix: 'int_create', limit: 20, windowSeconds: 60 }),
  zValidator('json', createIntegrationSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const input = c.req.valid('json');
    const endpointUrl = input.endpointUrl ? input.endpointUrl.trim() : null;
    if (endpointUrl && !isPublicSafeHttpUrl(endpointUrl)) {
      return c.json(
        {
          error: 'Invalid endpoint URL',
          message: 'Endpoint URL must use a public http:// or https:// host.',
        },
        400
      );
    }

    const id = `int_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    let encryptedSecret: string | null = null;
    let preview: string | null = null;

    if (input.secretValue && input.secretValue.trim()) {
      try {
        await validateBotTokenEncryptionKey(c.env.BOT_TOKEN_ENCRYPTION_KEY);
        encryptedSecret = await encryptSecretValue(
          input.secretValue,
          c.env.BOT_TOKEN_ENCRYPTION_KEY,
          `integration:${id}`
        );
        preview = maskSecretPreview(input.secretValue);
      } catch (err) {
        return c.json(
          {
            error: 'Encryption unavailable',
            message:
              err instanceof Error
                ? err.message
                : 'BOT_TOKEN_ENCRYPTION_KEY must be configured to store integration secrets.',
          },
          500
        );
      }
    }

    await db
      .prepare(
        `INSERT INTO integrations (id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'connected')`
      )
      .bind(
        id,
        user.id,
        input.provider,
        input.name,
        endpointUrl,
        encryptedSecret,
        JSON.stringify(input.config ?? {})
      )
      .run();

    const row = await db
      .prepare(
        `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                status, last_tested_at, last_error, created_at, updated_at
         FROM integrations WHERE id = ?`
      )
      .bind(id)
      .first<DbIntegrationRow>();

    return c.json(
      { integration: row ? mapIntegrationPublic(row, preview) : null },
      201
    );
  }
);

integrationRoutes.patch(
  '/:id',
  rateLimit({ keyPrefix: 'int_upd', limit: 30, windowSeconds: 60 }),
  zValidator('json', updateIntegrationSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existing = await db
      .prepare(
        `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                status, last_tested_at, last_error, created_at, updated_at
         FROM integrations WHERE id = ? AND user_id = ?`
      )
      .bind(id, user.id)
      .first<DbIntegrationRow>();

    if (!existing) {
      return c.json({ error: 'Not found', message: 'Integration not found.' }, 404);
    }

    const input = c.req.valid('json');
    const nextEndpoint =
      input.endpointUrl === undefined
        ? existing.endpoint_url
        : input.endpointUrl === '' || input.endpointUrl === null
          ? null
          : input.endpointUrl.trim();

    if (nextEndpoint && !isPublicSafeHttpUrl(nextEndpoint)) {
      return c.json(
        { error: 'Invalid endpoint URL', message: 'Endpoint URL must use a public http:// or https:// host.' },
        400
      );
    }

    let nextEncrypted = existing.credentials_encrypted;
    let preview: string | null = null;
    if (input.secretValue !== undefined && input.secretValue.trim()) {
      try {
        await validateBotTokenEncryptionKey(c.env.BOT_TOKEN_ENCRYPTION_KEY);
        nextEncrypted = await encryptSecretValue(
          input.secretValue,
          c.env.BOT_TOKEN_ENCRYPTION_KEY,
          `integration:${id}`
        );
        preview = maskSecretPreview(input.secretValue);
      } catch (err) {
        return c.json(
          {
            error: 'Encryption unavailable',
            message: err instanceof Error ? err.message : 'Encryption key missing.',
          },
          500
        );
      }
    }

    await db
      .prepare(
        `UPDATE integrations
         SET name = ?, endpoint_url = ?, credentials_encrypted = ?, config_json = ?, status = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        input.name ?? existing.name,
        nextEndpoint,
        nextEncrypted,
        input.config ? JSON.stringify(input.config) : existing.config_json,
        input.status ?? existing.status,
        id,
        user.id
      )
      .run();

    const updated = await db
      .prepare(
        `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                status, last_tested_at, last_error, created_at, updated_at
         FROM integrations WHERE id = ?`
      )
      .bind(id)
      .first<DbIntegrationRow>();

    return c.json({ integration: updated ? mapIntegrationPublic(updated, preview) : null });
  }
);

integrationRoutes.post(
  '/:id/test',
  rateLimit({ keyPrefix: 'int_test', limit: 20, windowSeconds: 60 }),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existing = await db
      .prepare(
        `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                status, last_tested_at, last_error, created_at, updated_at
         FROM integrations WHERE id = ? AND user_id = ?`
      )
      .bind(id, user.id)
      .first<DbIntegrationRow>();

    if (!existing) {
      return c.json({ error: 'Not found', message: 'Integration not found.' }, 404);
    }

    let decryptedSecret: string | null = null;
    if (existing.credentials_encrypted) {
      try {
        decryptedSecret = await decryptSecretValue(
          existing.credentials_encrypted,
          c.env.BOT_TOKEN_ENCRYPTION_KEY,
          `integration:${id}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Credential decryption failed.';
        await db
          .prepare(
            `UPDATE integrations
             SET status = 'error', last_error = ?, last_tested_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND user_id = ?`
          )
          .bind(msg.slice(0, 240), id, user.id)
          .run();
        return c.json({ ok: false, error: 'Credential error', message: msg }, 400);
      }
    }

    let ok = false;
    let detailMessage = 'Connection verified.';
    let statusNext: IntegrationStatus = 'connected';
    let errorNext: string | null = null;

    try {
      if (existing.provider === 'telegram_bot') {
        if (!decryptedSecret) {
          throw new Error('Telegram Bot token credential is required to verify bot connectivity.');
        }
        const tgRes = await fetch(`https://api.telegram.org/bot${decryptedSecret}/getMe`, {
          method: 'GET',
        });
        const tgBody = (await tgRes.json()) as {
          ok: boolean;
          description?: string;
          result?: { username?: string; first_name?: string };
        };
        if (!tgRes.ok || !tgBody.ok) {
          throw new Error(tgBody.description || `Telegram API returned ${tgRes.status}`);
        }
        ok = true;
        detailMessage = `Connected to @${tgBody.result?.username ?? tgBody.result?.first_name ?? 'bot'}.`;
      } else if (existing.endpoint_url) {
        if (!isPublicSafeHttpUrl(existing.endpoint_url)) {
          throw new Error('Endpoint URL is not a permitted public HTTP(S) host.');
        }
        const headers: Record<string, string> = {
          'User-Agent': 'AFRINEX-Integration-Probe/1.0',
        };
        if (decryptedSecret) {
          headers.Authorization = `Bearer ${decryptedSecret}`;
        }
        const pingMethod = existing.provider === 'webhook' ? 'POST' : 'GET';
        const pingRes = await fetch(existing.endpoint_url, {
          method: pingMethod,
          headers:
            pingMethod === 'POST'
              ? { ...headers, 'Content-Type': 'application/json' }
              : headers,
          body: pingMethod === 'POST' ? JSON.stringify({ event: 'afrinex.ping', timestamp: new Date().toISOString() }) : undefined,
        });
        if (!pingRes.ok) {
          throw new Error(`Endpoint responded with HTTP ${pingRes.status}`);
        }
        ok = true;
        detailMessage = `Endpoint responded with HTTP ${pingRes.status}.`;
      } else if (decryptedSecret) {
        ok = true;
        detailMessage = 'Encrypted credential verified (no endpoint probe URL configured).';
      } else {
        throw new Error('Provide either an endpoint URL or credential to test this integration.');
      }
    } catch (err) {
      ok = false;
      statusNext = 'error';
      errorNext = scrubSensitiveText(err instanceof Error ? err.message : 'Integration test failed.');
      detailMessage = errorNext;
      await logSystemEvent(db, {
        level: 'warn',
        category: 'integration',
        eventName: 'integration.test_failed',
        message: errorNext,
        userId: user.id,
        metadata: { integrationId: id, provider: existing.provider },
      });
      await createNotificationSafe(db, {
        userId: user.id,
        type: 'integration',
        title: `Integration Issue: ${existing.name}`,
        body: errorNext,
        linkSection: 'integrations',
        linkRefId: id,
        dedupeKey: `int_err:${id}:${new Date().toISOString().slice(0, 13)}`,
      });
    }

    await db
      .prepare(
        `UPDATE integrations
         SET status = ?, last_error = ?, last_tested_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(statusNext, errorNext, id, user.id)
      .run();

    const refreshed = await db
      .prepare(
        `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
                status, last_tested_at, last_error, created_at, updated_at
         FROM integrations WHERE id = ?`
      )
      .bind(id)
      .first<DbIntegrationRow>();

    return c.json(
      {
        ok,
        message: detailMessage,
        integration: refreshed ? mapIntegrationPublic(refreshed) : null,
      },
      ok ? 200 : 400
    );
  }
);

integrationRoutes.post('/:id/disconnect', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const res = await db
    .prepare(
      `UPDATE integrations
       SET status = 'disconnected', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND user_id = ?`
    )
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Not found', message: 'Integration not found.' }, 404);
  }

  const row = await db
    .prepare(
      `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
              status, last_tested_at, last_error, created_at, updated_at
       FROM integrations WHERE id = ?`
    )
    .bind(id)
    .first<DbIntegrationRow>();

  return c.json({ integration: row ? mapIntegrationPublic(row) : null });
});

integrationRoutes.delete('/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const res = await db
    .prepare('DELETE FROM integrations WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Not found', message: 'Integration not found.' }, 404);
  }

  return c.json({ ok: true });
});

export default integrationRoutes;
