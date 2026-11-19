/**
 * Authoritative DDL lives in numbered `migrations/*.sql` files (`0001`..`0010`+).
 *
 * This module provides ONLY a lightweight, idempotent runtime compatibility guard
 * for Stage-0 / partially-migrated D1 databases (e.g., upgraded through `0009` before
 * `0010_security_and_schema_fixes.sql` is applied). It intentionally avoids duplicating
 * full-table schemas from `migrations/*.sql`.
 */

interface PragmaColumnInfo {
  name: string;
}

interface TableMasterRow {
  name: string;
}

interface ColumnSpec {
  name: string;
  definition: string;
  backfillSql?: string;
}

const RUNTIME_COMPAT_COLUMNS: Record<string, ColumnSpec[]> = {
  users: [
    { name: 'account_status', definition: "TEXT NOT NULL DEFAULT 'active'" },
    { name: 'admin_permissions_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'last_active_at', definition: 'TEXT' },
    { name: 'suspended_at', definition: 'TEXT' },
    { name: 'suspended_reason', definition: 'TEXT' },
  ],
  courses: [
    { name: 'image_url', definition: 'TEXT' },
    { name: 'resources_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
  ],
  opportunities: [
    { name: 'featured', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'archived', definition: 'INTEGER NOT NULL DEFAULT 0' },
  ],
  payments: [
    { name: 'reconciliation_note', definition: 'TEXT' },
    { name: 'reconciled_at', definition: 'TEXT' },
    { name: 'failed_reason', definition: 'TEXT' },
  ],
  subscriptions: [{ name: 'payment_id', definition: 'TEXT' }],
};

let ensuredDbRef: WeakSet<D1Database> = new WeakSet();
let inflightEnsure: Promise<void> | null = null;

async function safeAddColumn(db: D1Database, tableName: string, spec: ColumnSpec): Promise<void> {
  try {
    await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${spec.name} ${spec.definition}`).run();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw err;
    }
  }
  if (spec.backfillSql) {
    await db.prepare(spec.backfillSql).run();
  }
}

async function runSchemaEnsure(db: D1Database): Promise<void> {
  const tablesResult = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all<TableMasterRow>();
  const existingTables = new Set((tablesResult.results ?? []).map((row) => row.name));

  // Leave uninitialized databases untouched so `wrangler d1 migrations apply` runs cleanly from 0001.
  if (!existingTables.has('users')) {
    return;
  }

  // Fast-path: if the latest authoritative migration is already applied, skip runtime checks.
  if (existingTables.has('d1_migrations')) {
    const latestApplied = await db
      .prepare("SELECT name FROM d1_migrations WHERE name = '0010_security_and_schema_fixes.sql' LIMIT 1")
      .first<{ name: string }>();
    if (latestApplied) {
      ensuredDbRef.add(db);
      return;
    }
  }

  // Ensure auth_nonces replay-protection table exists for pre-0010 runtimes.
  if (!existingTables.has('auth_nonces')) {
    await db
      .prepare('CREATE TABLE IF NOT EXISTS auth_nonces (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)')
      .run();
    await db
      .prepare('CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at)')
      .run();
    existingTables.add('auth_nonces');
  }

  const columnChecks = Object.entries(RUNTIME_COMPAT_COLUMNS).filter(([tableName]) =>
    existingTables.has(tableName)
  );

  const columnResults = await Promise.all(
    columnChecks.map(async ([tableName, specs]) => {
      const info = await db.prepare(`PRAGMA table_info(${tableName})`).all<PragmaColumnInfo>();
      const existingCols = new Set((info.results ?? []).map((col) => col.name));
      return { tableName, specs, existingCols };
    })
  );

  for (const { tableName, specs, existingCols } of columnResults) {
    for (const spec of specs) {
      if (!existingCols.has(spec.name)) {
        await safeAddColumn(db, tableName, spec);
      }
    }
  }

  if (existingTables.has('subscriptions')) {
    await db
      .prepare('CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_id ON subscriptions(payment_id)')
      .run();
  }

  // Reconcile pre-0010 opportunities CHECK constraint cleanly without dropping rows.
  if (existingTables.has('opportunities')) {
    const oppTableRow = await db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'opportunities'")
      .first<{ sql: string | null }>();
    const oppSql = oppTableRow?.sql ?? '';
    if (oppSql && (!oppSql.includes("'startup'") || !oppSql.includes("'programs'"))) {
      await db.batch([
        db.prepare(
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
        ),
        db.prepare(
          `INSERT INTO opportunities_new (id, title, organization, summary, opportunity_type, region, url, deadline, published, featured, archived, created_at)
           SELECT id, title, organization, summary, opportunity_type, region, url, deadline, published, COALESCE(featured, 0), COALESCE(archived, 0), created_at
           FROM opportunities`
        ),
        db.prepare('DROP TABLE opportunities'),
        db.prepare('ALTER TABLE opportunities_new RENAME TO opportunities'),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_opportunities_type_region ON opportunities(opportunity_type, region, published)'
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_opportunities_featured_created ON opportunities(published, archived, featured, created_at DESC)'
        ),
      ]);
    }
  }

  ensuredDbRef.add(db);
}

/**
 * Lightweight runtime compatibility guard for partially-migrated D1 databases.
 * Authoritative DDL lives strictly in `migrations/*.sql`.
 */
export async function ensureD1Schema(db: D1Database): Promise<void> {
  if (ensuredDbRef.has(db)) {
    return;
  }

  if (!inflightEnsure) {
    inflightEnsure = runSchemaEnsure(db).finally(() => {
      inflightEnsure = null;
    });
  }

  await inflightEnsure;
}

export function invalidateSchemaEnsureCache(db?: D1Database): void {
  if (db) {
    ensuredDbRef.delete(db);
  } else {
    ensuredDbRef = new WeakSet();
  }
}

export function resetSchemaEnsureCacheForTests(): void {
  ensuredDbRef = new WeakSet();
  inflightEnsure = null;
}
