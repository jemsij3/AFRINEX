import { execFileSync } from 'node:child_process';

const DB_NAME = 'afrinex-db';
const targetFlag = process.argv.includes('--local') ? '--local' : '--remote';
const persistIndex = process.argv.indexOf('--persist-to');
const extraLocalFlags =
  targetFlag === '--local' && persistIndex !== -1 && process.argv[persistIndex + 1]
    ? ['--persist-to', process.argv[persistIndex + 1]]
    : [];

function runWranglerExecute(sql) {
  let output;
  try {
    output = execFileSync(
      'npx',
      [
        'wrangler',
        'd1',
        'execute',
        DB_NAME,
        targetFlag,
        ...extraLocalFlags,
        '--yes',
        '--json',
        '--command',
        sql,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, CI: 'true' },
      }
    );
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr || '') : '';
    const stdout = err && typeof err === 'object' && 'stdout' in err ? String(err.stdout || '') : '';
    throw new Error(`D1 execute failed for SQL: ${sql}\n${stderr || stdout}`.trim());
  }

  const jsonStart = output.search(/[\[{]/);
  if (jsonStart === -1) {
    throw new Error(`Unexpected non-JSON output from wrangler d1 execute:\n${output}`);
  }
  const parsed = JSON.parse(output.slice(jsonStart));
  const firstResult = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!firstResult || firstResult.success === false) {
    throw new Error(`D1 execute failed for SQL: ${sql}`);
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
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'migrations', 'apply', DB_NAME, targetFlag, ...extraLocalFlags],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, CI: 'true' },
    }
  );

  console.log('[d1-reconcile] D1 schema and migrations are up to date.');
}

main();
