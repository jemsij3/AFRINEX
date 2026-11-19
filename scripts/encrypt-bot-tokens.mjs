import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_NAME = 'afrinex-db';
const ENC_PREFIX = 'enc:v1:';
const LOCAL_WRANGLER_BIN = resolve(process.cwd(), 'node_modules/wrangler/bin/wrangler.js');

const args = process.argv.slice(2);
const targetFlag = args.includes('--remote') ? '--remote' : '--local';
const applyChanges = args.includes('--apply') && !args.includes('--dry-run');
const persistIdx = args.indexOf('--persist-to');
const extraLocalFlags =
  targetFlag === '--local' && persistIdx !== -1 && args[persistIdx + 1]
    ? ['--persist-to', args[persistIdx + 1]]
    : [];

function readKeyFromDevVarsIfLocal() {
  if (targetFlag !== '--local') return undefined;
  const devVarsPath = resolve(process.cwd(), '.dev.vars');
  if (!existsSync(devVarsPath)) return undefined;
  const content = readFileSync(devVarsPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key === 'BOT_TOKEN_ENCRYPTION_KEY') {
      return trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return undefined;
}

function decodeKeyBytes(rawKey) {
  const trimmed = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!trimmed) {
    throw new Error('BOT_TOKEN_ENCRYPTION_KEY is missing.');
  }

  let bytes = null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      bytes[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    try {
      const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64');
      if (decoded.length === 32) {
        bytes = new Uint8Array(decoded);
      }
    } catch {
      bytes = null;
    }
  }

  if (!bytes || bytes.length !== 32) {
    throw new Error(
      'BOT_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.'
    );
  }

  if (!bytes.some((b) => b !== 0)) {
    throw new Error('BOT_TOKEN_ENCRYPTION_KEY must not be an all-zero key.');
  }

  return bytes;
}

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function importAesKey(rawKey) {
  const keyBytes = decodeKeyBytes(rawKey);
  return globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

async function encryptToken(plaintext, cryptoKey, botId) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const aad = encoder.encode(`afrinex:telegram_bot:v1:${botId}`);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    cryptoKey,
    encoder.encode(plaintext.trim())
  );
  return `${ENC_PREFIX}${toBase64Url(iv)}:${toBase64Url(new Uint8Array(ciphertext))}`;
}

function invokeWranglerExecute(sql) {
  const useLocalBin = existsSync(LOCAL_WRANGLER_BIN);
  const command = useLocalBin ? process.execPath : 'npx';
  const wranglerArgs = [
    'd1',
    'execute',
    DB_NAME,
    targetFlag,
    ...extraLocalFlags,
    '--yes',
    '--json',
    '--command',
    sql,
  ];
  const finalArgs = useLocalBin ? [LOCAL_WRANGLER_BIN, ...wranglerArgs] : ['wrangler', ...wranglerArgs];

  const env = { ...process.env, CI: 'true' };
  const result = spawnSync(command, finalArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  if (result.error) {
    throw new Error(`Failed to run Wrangler: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error('Wrangler D1 execute failed. Check target flags, database_id, and credentials.');
  }

  const jsonStart = result.stdout.search(/[\[{]/);
  if (jsonStart === -1) {
    throw new Error('Unexpected non-JSON output from Wrangler D1 execute.');
  }
  const parsed = JSON.parse(result.stdout.slice(jsonStart));
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!first || first.success === false) {
    throw new Error('Wrangler D1 execute reported failure.');
  }
  return first.results ?? [];
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const rawKey = process.env.BOT_TOKEN_ENCRYPTION_KEY || readKeyFromDevVarsIfLocal();
  const cryptoKey = await importAesKey(rawKey);

  console.log(
    `[bot-token-migrate] Target=${targetFlag} Mode=${applyChanges ? 'APPLY' : 'DRY-RUN'}`
  );

  const tables = invokeWranglerExecute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'telegram_bots'"
  );
  if (tables.length === 0) {
    console.log('[bot-token-migrate] telegram_bots table does not exist. Nothing to migrate.');
    return;
  }

  const rows = invokeWranglerExecute(
    'SELECT id, bot_token FROM telegram_bots ORDER BY created_at ASC'
  );

  let alreadyEncrypted = 0;
  let pendingEncryption = 0;
  let updatedCount = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    const stored = typeof row.bot_token === 'string' ? row.bot_token : '';

    if (!id || !stored.trim()) {
      skippedInvalid += 1;
      continue;
    }

    if (stored.startsWith(ENC_PREFIX)) {
      alreadyEncrypted += 1;
      continue;
    }

    pendingEncryption += 1;
    if (!applyChanges) {
      continue;
    }

    const encrypted = await encryptToken(stored, cryptoKey, id);
    invokeWranglerExecute(
      `UPDATE telegram_bots SET bot_token = ${sqlLiteral(encrypted)}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${sqlLiteral(id)} AND bot_token NOT LIKE 'enc:v1:%'`
    );
    updatedCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? 'apply' : 'dry-run',
        target: targetFlag,
        totalRows: rows.length,
        alreadyEncrypted,
        needsEncryption: pendingEncryption,
        encryptedNow: updatedCount,
        skippedInvalid,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[bot-token-migrate] ERROR: ${message}`);
  process.exit(1);
});
