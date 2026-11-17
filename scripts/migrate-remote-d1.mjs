import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

function getExistingTables() {
  const rows = runWranglerExecute("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map((r) => String(r.name)));
}

function getTableColumns(tableName) {
  const rows = runWranglerExecute(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((r) => String(r.name)));
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
    'telegram_services',
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
