/**
 * Authoritative schema changes live in numbered `migrations/*.sql` files.
 * This wrapper reconciles legacy Stage-0 / partially-migrated remote tables before
 * invoking `wrangler d1 migrations apply`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DB_NAME = 'afrinex-db';
const targetFlag = process.argv.includes('--local') ? '--local' : '--remote';
const persistIndex = process.argv.indexOf('--persist-to');
const extraLocalFlags =
  targetFlag === '--local' && persistIndex !== -1 && process.argv[persistIndex + 1]
    ? ['--persist-to', process.argv[persistIndex + 1]]
    : [];

const LOCAL_WRANGLER_BIN = resolve(process.cwd(), 'node_modules/wrangler/bin/wrangler.js');

function buildChildEnv() {
  const env = { ...process.env, CI: 'true' };
  if (typeof env.CLOUDFLARE_API_TOKEN === 'string') {
    env.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_API_TOKEN.trim();
  }
  if (typeof env.CLOUDFLARE_ACCOUNT_ID === 'string') {
    env.CLOUDFLARE_ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID.trim();
  }
  return env;
}

function invokeWrangler(args, { captureOutput = true } = {}) {
  const useLocalBin = existsSync(LOCAL_WRANGLER_BIN);
  const command = useLocalBin ? process.execPath : 'npx';
  const finalArgs = useLocalBin ? [LOCAL_WRANGLER_BIN, ...args] : ['wrangler', ...args];

  const result = spawnSync(command, finalArgs, {
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    env: buildChildEnv(),
  });

  if (result.error) {
    throw new Error(`Failed to start Wrangler CLI: ${result.error.message}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function extractWranglerErrorSummary(stdout, stderr) {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  if (!combined) {
    return 'Wrangler exited with a non-zero status and produced no output.';
  }

  const jsonStart = combined.search(/[\[{]/);
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(combined.slice(jsonStart));
      const errObj = parsed && typeof parsed === 'object' ? parsed.error : null;
      if (errObj && typeof errObj === 'object') {
        const parts = [];
        if (errObj.text) parts.push(String(errObj.text));
        if (Array.isArray(errObj.notes)) {
          for (const note of errObj.notes) {
            if (note && note.text) parts.push(String(note.text));
          }
        }
        if (errObj.code !== undefined && !parts.some((p) => p.includes(String(errObj.code)))) {
          parts.push(`code: ${errObj.code}`);
        }
        if (parts.length > 0) {
          return parts.join(' | ');
        }
      }
    } catch {
      // Fall through to plain text summary
    }
  }

  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-6).join(' | ');
}

function diagnoseFailure(message) {
  const lower = message.toLowerCase();
  if (
    lower.includes('authentication error') ||
    lower.includes('code: 10000') ||
    lower.includes('7403') ||
    lower.includes('not authorized') ||
    lower.includes('unauthorized') ||
    lower.includes('unable to authenticate') ||
    lower.includes('forbidden')
  ) {
    return [
      'Cloudflare rejected the D1 API request due to credentials or missing token permissions.',
      'Fix in Cloudflare Dashboard -> My Profile -> API Tokens:',
      '  1. Edit or recreate CLOUDFLARE_API_TOKEN and include Account -> D1 -> Edit (plus Account -> Workers Scripts -> Edit).',
      '     Note: Cloudflare\'s "Edit Cloudflare Workers" template does NOT include D1 permissions by default.',
      '  2. Verify CLOUDFLARE_ACCOUNT_ID in GitHub Secrets matches your 32-character Cloudflare Account ID (with no extra spaces).',
    ].join('\n');
  }
  return null;
}

function runWranglerExecute(sql) {
  const { status, stdout, stderr } = invokeWrangler([
    'd1',
    'execute',
    DB_NAME,
    targetFlag,
    ...extraLocalFlags,
    '--yes',
    '--json',
    '--command',
    sql,
  ]);

  if (status !== 0) {
    const summary = extractWranglerErrorSummary(stdout, stderr);
    const err = new Error(`D1 execute failed for SQL "${sql}": ${summary}`);
    err.rawDetails = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw err;
  }

  const jsonStart = stdout.search(/[\[{]/);
  if (jsonStart === -1) {
    throw new Error(`Unexpected non-JSON output from wrangler d1 execute:\n${stdout || stderr}`);
  }
  const parsed = JSON.parse(stdout.slice(jsonStart));
  const firstResult = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!firstResult || firstResult.success === false) {
    throw new Error(`D1 execute returned unsuccessful result for SQL: ${sql}`);
  }
  return firstResult.results ?? [];
}

const SHARED_DEFAULT_SETTINGS = JSON.parse(
  readFileSync(new URL('../shared/defaultAppSettings.json', import.meta.url), 'utf8')
);

const DEFAULT_APP_SETTINGS_ROWS = Object.values(SHARED_DEFAULT_SETTINGS).map((entry) => [
  entry.dbKey,
  JSON.stringify(entry.value),
]);

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getExistingTables() {
  const rows = runWranglerExecute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map((r) => String(r.name)));
}

function getTableInfo(tableName) {
  return runWranglerExecute(`PRAGMA table_info(${tableName})`);
}

function getTableColumns(tableName) {
  const rows = getTableInfo(tableName);
  return new Set(rows.map((r) => String(r.name)));
}

function getTableIndexes(tableName) {
  return runWranglerExecute(`PRAGMA index_list(${tableName})`);
}

function hasUniqueKeyColumn(tableName, infoRows, columnName) {
  const col = infoRows.find((r) => String(r.name) === columnName);
  if (col && Number(col.pk) > 0) {
    // Check if single-column primary key
    const pkCols = infoRows.filter((r) => Number(r.pk) > 0);
    if (pkCols.length === 1) return true;
  }
  const indexes = getTableIndexes(tableName);
  for (const idx of indexes) {
    if (Number(idx.unique) !== 1 || !idx.name) continue;
    const idxCols = runWranglerExecute(`PRAGMA index_info(${sqlLiteral(idx.name)})`);
    if (idxCols.length === 1 && String(idxCols[0].name) === columnName) {
      return true;
    }
  }
  return false;
}

function ensureColumn(tableName, existingCols, columnName, definition, backfillSql) {
  if (existingCols.has(columnName)) {
    return false;
  }
  console.log(`[d1-reconcile] Adding missing column ${tableName}.${columnName}`);
  runWranglerExecute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  if (backfillSql) {
    runWranglerExecute(backfillSql);
  }
  existingCols.add(columnName);
  return true;
}

function normalizeJsonSettingValue(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return 'null';
  }
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return '""';
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify(rawValue);
    }
  }
  return JSON.stringify(rawValue);
}

function pickNextBackupName(existingTables, baseName) {
  if (!existingTables.has(baseName)) return baseName;
  let counter = 1;
  while (existingTables.has(`${baseName}_${counter}`)) {
    counter += 1;
  }
  return `${baseName}_${counter}`;
}

function seedDefaultAppSettings() {
  const valuesSql = DEFAULT_APP_SETTINGS_ROWS.map(
    ([key, valueJson]) => `(${sqlLiteral(key)}, ${sqlLiteral(valueJson)})`
  ).join(', ');
  runWranglerExecute(`INSERT OR IGNORE INTO app_settings (key, value_json) VALUES ${valuesSql}`);
}

function reconcileLegacyAppSettings(existingTables) {
  if (!existingTables.has('app_settings')) {
    return;
  }

  const infoRows = getTableInfo('app_settings');
  const cols = new Set(infoRows.map((r) => String(r.name)));
  const canonicalCols = new Set(['key', 'value_json', 'updated_by', 'updated_at']);
  const hasKeyConstraint = cols.has('key') && hasUniqueKeyColumn('app_settings', infoRows, 'key');
  const hasIncompatibleNotNull = infoRows.some(
    (r) =>
      !canonicalCols.has(String(r.name)) &&
      Number(r.notnull) === 1 &&
      (r.dflt_value === null || r.dflt_value === undefined)
  );

  if (
    hasKeyConstraint &&
    cols.has('key') &&
    cols.has('value_json') &&
    cols.has('updated_by') &&
    cols.has('updated_at') &&
    !hasIncompatibleNotNull
  ) {
    return;
  }

  console.log(
    `[d1-reconcile] Legacy app_settings schema detected (columns: ${Array.from(cols).join(', ')}). Preserving data and rebuilding canonical app_settings...`
  );

  const legacyRows = runWranglerExecute('SELECT * FROM app_settings');
  const backupTable = pickNextBackupName(existingTables, 'app_settings_legacy');

  runWranglerExecute(`ALTER TABLE app_settings RENAME TO ${backupTable}`);
  existingTables.add(backupTable);

  runWranglerExecute(
    "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
  );

  let migratedCount = 0;
  for (const row of legacyRows) {
    const rawKey = row.key ?? row.setting_key ?? row.name ?? row.config_key ?? row.id;
    if (rawKey === null || rawKey === undefined) continue;
    const keyStr = String(rawKey).trim();
    if (!keyStr) continue;

    const rawVal =
      row.value_json ??
      row.value ??
      row.setting_value ??
      row.val ??
      row.config_value ??
      row.data ??
      null;
    const valueJson = normalizeJsonSettingValue(rawVal);
    const updatedBy =
      row.updated_by !== undefined && row.updated_by !== null ? String(row.updated_by) : null;
    const updatedAt =
      row.updated_at !== undefined && row.updated_at !== null && String(row.updated_at).trim()
        ? String(row.updated_at)
        : new Date().toISOString();

    runWranglerExecute(
      `INSERT OR IGNORE INTO app_settings (key, value_json, updated_by, updated_at) VALUES (${sqlLiteral(keyStr)}, ${sqlLiteral(valueJson)}, ${sqlLiteral(updatedBy)}, ${sqlLiteral(updatedAt)})`
    );
    migratedCount += 1;
  }

  if (legacyRows.length === 0) {
    runWranglerExecute(`DROP TABLE IF EXISTS ${backupTable}`);
    existingTables.delete(backupTable);
    console.log('[d1-reconcile] Rebuilt empty app_settings with canonical schema.');
  } else {
    console.log(
      `[d1-reconcile] Migrated ${migratedCount}/${legacyRows.length} legacy app_settings row(s); original rows preserved in ${backupTable}.`
    );
  }
}

function reconcileLegacyAnnouncements(existingTables) {
  if (!existingTables.has('announcements')) {
    return;
  }
  const infoRows = getTableInfo('announcements');
  const cols = new Set(infoRows.map((r) => String(r.name)));
  const canonicalCols = new Set([
    'id',
    'title',
    'body',
    'audience',
    'published',
    'created_by',
    'sent_at',
    'delivery_count',
    'delivery_status',
    'created_at',
    'updated_at',
  ]);
  const hasIncompatibleNotNull = infoRows.some(
    (r) =>
      !canonicalCols.has(String(r.name)) &&
      Number(r.notnull) === 1 &&
      (r.dflt_value === null || r.dflt_value === undefined)
  );

  if (!cols.has('id') || !cols.has('title') || !cols.has('body') || hasIncompatibleNotNull) {
    const legacyRows = runWranglerExecute('SELECT * FROM announcements');
    const backupTable = pickNextBackupName(existingTables, 'announcements_legacy');
    console.log(
      `[d1-reconcile] Incompatible legacy announcements schema detected. Moving old table to ${backupTable} and creating canonical announcements...`
    );
    runWranglerExecute(`ALTER TABLE announcements RENAME TO ${backupTable}`);
    existingTables.add(backupTable);
    runWranglerExecute('DROP INDEX IF EXISTS idx_announcements_published');
    runWranglerExecute(
      "CREATE TABLE announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'free', 'pro')), published INTEGER NOT NULL DEFAULT 0, created_by TEXT, sent_at TEXT, delivery_count INTEGER NOT NULL DEFAULT 0, delivery_status TEXT NOT NULL DEFAULT 'draft' CHECK (delivery_status IN ('draft', 'published', 'sent', 'partial')), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
    );
    runWranglerExecute(
      'CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published, created_at DESC)'
    );
    if (legacyRows.length === 0) {
      runWranglerExecute(`DROP TABLE IF EXISTS ${backupTable}`);
      existingTables.delete(backupTable);
    }
    return;
  }

  ensureColumn('announcements', cols, 'audience', "TEXT NOT NULL DEFAULT 'all'");
  ensureColumn('announcements', cols, 'published', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('announcements', cols, 'created_by', 'TEXT');
  ensureColumn('announcements', cols, 'sent_at', 'TEXT');
  ensureColumn('announcements', cols, 'delivery_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('announcements', cols, 'delivery_status', "TEXT NOT NULL DEFAULT 'draft'");
  ensureColumn(
    'announcements',
    cols,
    'created_at',
    'TEXT',
    "UPDATE announcements SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
  );
  ensureColumn(
    'announcements',
    cols,
    'updated_at',
    'TEXT',
    "UPDATE announcements SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL"
  );
}

function reconcileLegacyAiRequestLogs(existingTables) {
  if (!existingTables.has('ai_request_logs')) {
    return;
  }
  const infoRows = getTableInfo('ai_request_logs');
  const cols = new Set(infoRows.map((r) => String(r.name)));
  const canonicalCols = new Set([
    'id',
    'user_id',
    'model',
    'status',
    'error_message',
    'created_at',
  ]);
  const hasIncompatibleNotNull = infoRows.some(
    (r) =>
      !canonicalCols.has(String(r.name)) &&
      Number(r.notnull) === 1 &&
      (r.dflt_value === null || r.dflt_value === undefined)
  );

  if (!cols.has('id') || !cols.has('user_id') || !cols.has('model') || !cols.has('status') || hasIncompatibleNotNull) {
    const legacyRows = runWranglerExecute('SELECT * FROM ai_request_logs');
    const backupTable = pickNextBackupName(existingTables, 'ai_request_logs_legacy');
    console.log(
      `[d1-reconcile] Incompatible legacy ai_request_logs schema detected. Moving old table to ${backupTable} and creating canonical ai_request_logs...`
    );
    runWranglerExecute(`ALTER TABLE ai_request_logs RENAME TO ${backupTable}`);
    existingTables.add(backupTable);
    runWranglerExecute(
      "CREATE TABLE ai_request_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')), error_message TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
    );
    if (legacyRows.length === 0) {
      runWranglerExecute(`DROP TABLE IF EXISTS ${backupTable}`);
      existingTables.delete(backupTable);
    }
    return;
  }

  ensureColumn('ai_request_logs', cols, 'error_message', 'TEXT');
  ensureColumn(
    'ai_request_logs',
    cols,
    'created_at',
    'TEXT',
    "UPDATE ai_request_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
  );
}

function main() {
  if (targetFlag === '--remote') {
    const env = buildChildEnv();
    if (!env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN is empty or missing.');
    }
    if (!env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID is empty or missing.');
    }
  }

  console.log(`[d1-reconcile] Inspecting ${DB_NAME} (${targetFlag})...`);

  runWranglerExecute(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)'
  );

  const existingTables = getExistingTables();
  const appliedRows = runWranglerExecute('SELECT name FROM d1_migrations ORDER BY id ASC');
  const appliedMigrations = new Set(appliedRows.map((r) => String(r.name)));

  if (existingTables.has('users')) {
    const userCols = getTableColumns('users');
    ensureColumn('users', userCols, 'username', 'TEXT');
    ensureColumn('users', userCols, 'first_name', "TEXT NOT NULL DEFAULT 'Member'");
    ensureColumn('users', userCols, 'last_name', 'TEXT');
    ensureColumn('users', userCols, 'photo_url', 'TEXT');
    ensureColumn('users', userCols, 'language_code', "TEXT DEFAULT 'en'");
    ensureColumn('users', userCols, 'role', "TEXT NOT NULL DEFAULT 'member'");
    ensureColumn('users', userCols, 'tier', "TEXT NOT NULL DEFAULT 'free'");
    ensureColumn('users', userCols, 'pro_expires_at', 'TEXT');
    ensureColumn(
      'users',
      userCols,
      'created_at',
      'TEXT',
      "UPDATE users SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
    );
    ensureColumn(
      'users',
      userCols,
      'updated_at',
      'TEXT',
      "UPDATE users SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL"
    );

    if (
      !appliedMigrations.has('0003_security_and_billing_hardening.sql') &&
      userCols.has('token_version')
    ) {
      console.log(
        '[d1-reconcile] users.token_version already exists; applying ai_daily_usage and recording 0003_security_and_billing_hardening.sql'
      );
      runWranglerExecute(
        'CREATE TABLE IF NOT EXISTS ai_daily_usage (user_id TEXT NOT NULL, usage_date TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, usage_date), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)'
      );
      const updatedTables = getExistingTables();
      if (!updatedTables.has('ai_daily_usage')) {
        throw new Error('Failed to verify ai_daily_usage table creation.');
      }
      runWranglerExecute(
        "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0003_security_and_billing_hardening.sql')"
      );
      appliedMigrations.add('0003_security_and_billing_hardening.sql');
    }
  }

  if (existingTables.has('courses')) {
    const courseCols = getTableColumns('courses');
    ensureColumn('courses', courseCols, 'is_pro', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('courses', courseCols, 'published', 'INTEGER NOT NULL DEFAULT 1');
    ensureColumn(
      'courses',
      courseCols,
      'created_at',
      'TEXT',
      "UPDATE courses SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
    );
  }

  if (existingTables.has('lessons')) {
    const lessonCols = getTableColumns('lessons');
    ensureColumn('lessons', lessonCols, 'duration_mins', 'INTEGER NOT NULL DEFAULT 10');
    ensureColumn('lessons', lessonCols, 'sort_order', 'INTEGER NOT NULL DEFAULT 1');
    ensureColumn(
      'lessons',
      lessonCols,
      'created_at',
      'TEXT',
      "UPDATE lessons SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
    );

    if (
      !appliedMigrations.has('0006_enrollments_certificates.sql') &&
      lessonCols.has('published')
    ) {
      console.log(
        '[d1-reconcile] lessons.published already exists; applying enrollments/certificates tables and recording 0006_enrollments_certificates.sql'
      );
      runWranglerExecute(
        `CREATE TABLE IF NOT EXISTS course_enrollments (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(user_id, course_id)
        )`
      );
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_enrollments_user ON course_enrollments(user_id, enrolled_at DESC)'
      );
      runWranglerExecute(
        `CREATE TABLE IF NOT EXISTS certificates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          certificate_code TEXT NOT NULL UNIQUE,
          issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(user_id, course_id)
        )`
      );
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id, issued_at DESC)'
      );
      const updatedTables = getExistingTables();
      if (!updatedTables.has('course_enrollments') || !updatedTables.has('certificates')) {
        throw new Error('Failed to verify course_enrollments or certificates creation.');
      }
      runWranglerExecute(
        "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0006_enrollments_certificates.sql')"
      );
      appliedMigrations.add('0006_enrollments_certificates.sql');
    }
  }

  if (existingTables.has('course_enrollments')) {
    const enrollCols = getTableColumns('course_enrollments');
    ensureColumn(
      'course_enrollments',
      enrollCols,
      'enrolled_at',
      'TEXT',
      "UPDATE course_enrollments SET enrolled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE enrolled_at IS NULL"
    );
  }

  if (existingTables.has('certificates')) {
    const certCols = getTableColumns('certificates');
    ensureColumn(
      'certificates',
      certCols,
      'certificate_code',
      'TEXT',
      "UPDATE certificates SET certificate_code = 'AFRINEX-' || course_id || '-' || user_id || '-' || id WHERE certificate_code IS NULL"
    );
    ensureColumn(
      'certificates',
      certCols,
      'issued_at',
      'TEXT',
      "UPDATE certificates SET issued_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE issued_at IS NULL"
    );
  }

  if (existingTables.has('ai_tools')) {
    const toolCols = getTableColumns('ai_tools');
    ensureColumn('ai_tools', toolCols, 'pricing_model', "TEXT NOT NULL DEFAULT 'freemium'");
    ensureColumn('ai_tools', toolCols, 'featured', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('ai_tools', toolCols, 'published', 'INTEGER NOT NULL DEFAULT 1');
    ensureColumn(
      'ai_tools',
      toolCols,
      'created_at',
      'TEXT',
      "UPDATE ai_tools SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
    );
  }

  if (existingTables.has('opportunities')) {
    const oppCols = getTableColumns('opportunities');
    ensureColumn('opportunities', oppCols, 'deadline', 'TEXT');
    ensureColumn('opportunities', oppCols, 'published', 'INTEGER NOT NULL DEFAULT 1');
    ensureColumn(
      'opportunities',
      oppCols,
      'created_at',
      'TEXT',
      "UPDATE opportunities SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
    );
  }

  for (const tableName of [
    'ai_conversations',
    'builder_projects',
    'telegram_bots',
  ]) {
    if (existingTables.has(tableName)) {
      const cols = getTableColumns(tableName);
      ensureColumn(
        tableName,
        cols,
        'created_at',
        'TEXT',
        `UPDATE ${tableName} SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL`
      );
      ensureColumn(
        tableName,
        cols,
        'updated_at',
        'TEXT',
        `UPDATE ${tableName} SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL`
      );
    }
  }

  if (existingTables.has('audit_logs')) {
    const auditCols = getTableColumns('audit_logs');
    ensureColumn(
      'audit_logs',
      auditCols,
      'created_at',
      'TEXT',
      "UPDATE audit_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL"
    );
  }

  // Always normalize pre-existing Stage 0 / legacy tables touched by migration 0008
  // BEFORE checking partial 0008 columns or invoking `wrangler d1 migrations apply`.
  reconcileLegacyAppSettings(existingTables);
  reconcileLegacyAnnouncements(existingTables);
  reconcileLegacyAiRequestLogs(existingTables);

  if (!appliedMigrations.has('0008_admin_platform_controls.sql') && existingTables.has('users')) {
    const userCols = getTableColumns('users');
    const courseCols = existingTables.has('courses') ? getTableColumns('courses') : new Set();
    const oppCols = existingTables.has('opportunities')
      ? getTableColumns('opportunities')
      : new Set();
    const paymentCols = existingTables.has('payments') ? getTableColumns('payments') : new Set();

    const hasPartial0008 =
      ['account_status', 'admin_permissions_json', 'last_active_at', 'suspended_at', 'suspended_reason'].some((c) =>
        userCols.has(c)
      ) ||
      ['image_url', 'resources_json'].some((c) => courseCols.has(c)) ||
      ['featured', 'archived'].some((c) => oppCols.has(c)) ||
      ['reconciliation_note', 'reconciled_at', 'failed_reason'].some((c) => paymentCols.has(c));

    if (hasPartial0008) {
      console.log(
        '[d1-reconcile] Partial 0008 columns already exist; reconciling remaining 0008_admin_platform_controls.sql objects and seed settings...'
      );
      ensureColumn('users', userCols, 'account_status', "TEXT NOT NULL DEFAULT 'active'");
      ensureColumn('users', userCols, 'admin_permissions_json', "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn('users', userCols, 'last_active_at', 'TEXT');
      ensureColumn('users', userCols, 'suspended_at', 'TEXT');
      ensureColumn('users', userCols, 'suspended_reason', 'TEXT');

      if (existingTables.has('courses')) {
        ensureColumn('courses', courseCols, 'image_url', 'TEXT');
        ensureColumn('courses', courseCols, 'resources_json', "TEXT NOT NULL DEFAULT '[]'");
      }
      if (existingTables.has('opportunities')) {
        ensureColumn('opportunities', oppCols, 'featured', 'INTEGER NOT NULL DEFAULT 0');
        ensureColumn('opportunities', oppCols, 'archived', 'INTEGER NOT NULL DEFAULT 0');
      }
      if (existingTables.has('payments')) {
        ensureColumn('payments', paymentCols, 'reconciliation_note', 'TEXT');
        ensureColumn('payments', paymentCols, 'reconciled_at', 'TEXT');
        ensureColumn('payments', paymentCols, 'failed_reason', 'TEXT');
      }

      runWranglerExecute(
        "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
      );
      runWranglerExecute(
        "CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'free', 'pro')), published INTEGER NOT NULL DEFAULT 0, created_by TEXT, sent_at TEXT, delivery_count INTEGER NOT NULL DEFAULT 0, delivery_status TEXT NOT NULL DEFAULT 'draft' CHECK (delivery_status IN ('draft', 'published', 'sent', 'partial')), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
      );
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published, created_at DESC)'
      );
      runWranglerExecute(
        "CREATE TABLE IF NOT EXISTS ai_request_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')), error_message TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
      );
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created ON ai_request_logs(created_at DESC, status)'
      );

      seedDefaultAppSettings();

      runWranglerExecute(
        "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0008_admin_platform_controls.sql')"
      );
      appliedMigrations.add('0008_admin_platform_controls.sql');
    }
  }

  if (!appliedMigrations.has('0010_security_and_schema_fixes.sql') && existingTables.has('users')) {
    const subCols = existingTables.has('subscriptions')
      ? getTableColumns('subscriptions')
      : new Set();
    const oppMasterRows = existingTables.has('opportunities')
      ? runWranglerExecute(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'opportunities'"
        )
      : [];
    const oppSql = String(oppMasterRows[0]?.sql ?? '');
    const oppNeedsRebuild =
      existingTables.has('opportunities') &&
      (!oppSql.includes("'startup'") || !oppSql.includes("'programs'"));
    const hasPartial0010 =
      subCols.has('payment_id') ||
      existingTables.has('auth_nonces') ||
      (existingTables.has('opportunities') && !oppNeedsRebuild);

    if (hasPartial0010) {
      console.log(
        '[d1-reconcile] Partial 0010 objects detected; reconciling 0010_security_and_schema_fixes.sql safely...'
      );
      if (existingTables.has('opportunities') && oppNeedsRebuild) {
        const oppCols = getTableColumns('opportunities');
        ensureColumn('opportunities', oppCols, 'featured', 'INTEGER NOT NULL DEFAULT 0');
        ensureColumn('opportunities', oppCols, 'archived', 'INTEGER NOT NULL DEFAULT 0');
        runWranglerExecute(
          `CREATE TABLE opportunities_new (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            organization TEXT NOT NULL,
            summary TEXT NOT NULL,
            opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('job', 'freelance', 'scholarship', 'grant', 'event', 'startup', 'programs')),
            region TEXT NOT NULL CHECK (region IN ('africa', 'global', 'remote')),
            url TEXT NOT NULL,
            deadline TEXT,
            published INTEGER NOT NULL DEFAULT 1,
            featured INTEGER NOT NULL DEFAULT 0,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          )`
        );
        runWranglerExecute(
          `INSERT INTO opportunities_new (id, title, organization, summary, opportunity_type, region, url, deadline, published, featured, archived, created_at)
           SELECT id, title, organization, summary, opportunity_type, region, url, deadline, published, COALESCE(featured, 0), COALESCE(archived, 0), created_at FROM opportunities`
        );
        runWranglerExecute('DROP TABLE opportunities');
        runWranglerExecute('ALTER TABLE opportunities_new RENAME TO opportunities');
      }

      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_opportunities_type_region ON opportunities(opportunity_type, region, published)'
      );
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_opportunities_featured_created ON opportunities(published, archived, featured, created_at DESC)'
      );
      runWranglerExecute(
        'CREATE TABLE IF NOT EXISTS auth_nonces (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)'
      );
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at)'
      );
      if (existingTables.has('subscriptions')) {
        ensureColumn('subscriptions', subCols, 'payment_id', 'TEXT');
        runWranglerExecute(
          'CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_id ON subscriptions(payment_id)'
        );
        runWranglerExecute(
          'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status, started_at DESC)'
        );
      }
      if (existingTables.has('payments')) {
        runWranglerExecute(
          'CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments(user_id, created_at DESC)'
        );
        runWranglerExecute(
          'CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at DESC)'
        );
      }
      if (existingTables.has('ai_request_logs')) {
        runWranglerExecute(
          'CREATE INDEX IF NOT EXISTS idx_ai_request_logs_status_created ON ai_request_logs(status, created_at DESC)'
        );
      }
      runWranglerExecute(
        'CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(account_status, created_at DESC)'
      );
      if (existingTables.has('telegram_analytics')) {
        runWranglerExecute(
          'CREATE INDEX IF NOT EXISTS idx_telegram_analytics_bot_created ON telegram_analytics(bot_id, created_at DESC)'
        );
      }
      runWranglerExecute(
        "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0010_security_and_schema_fixes.sql')"
      );
      appliedMigrations.add('0010_security_and_schema_fixes.sql');
    }
  }

  console.log(`[d1-reconcile] Applying pending D1 migrations (${targetFlag})...`);
  const applyRes = invokeWrangler(
    ['d1', 'migrations', 'apply', DB_NAME, targetFlag, ...extraLocalFlags],
    { captureOutput: false }
  );
  if (applyRes.status !== 0) {
    throw new Error(`wrangler d1 migrations apply ${DB_NAME} ${targetFlag} exited with code ${applyRes.status}.`);
  }

  console.log('[d1-reconcile] D1 schema and migrations are up to date.');
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const singleLine = message.replace(/\s+/g, ' ').trim().slice(0, 450);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error(`::error title=Remote D1 Migration Failed::${singleLine}`);
  }
  console.error(`\n[d1-reconcile] ERROR: ${message}`);
  if (err && typeof err === 'object' && 'rawDetails' in err && err.rawDetails) {
    console.error(`\n[d1-reconcile] Wrangler response:\n${err.rawDetails}`);
  }
  const hint = diagnoseFailure(message);
  if (hint) {
    console.error(`\n[d1-reconcile] How to fix:\n${hint}\n`);
  }
  process.exit(1);
}
