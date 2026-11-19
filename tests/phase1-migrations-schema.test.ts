import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedTestDb } from './d1-shim.ts';
import { ensureD1Schema, resetSchemaEnsureCacheForTests } from '../worker/lib/schemaEnsure.ts';

describe('Phase 1: D1 Migrations & Schema Fixes', () => {
  it('migration 0010 preserves existing opportunities and adds startup/programs + indexes + auth_nonces + payment_id', async () => {
    const { sqlite, applyMigrationFile } = createMigratedTestDb({
      upToMigration: '0009_seed_curated_courses.sql',
    });

    // Seed pre-existing opportunity records before 0010 runs
    sqlite
      .prepare(
        `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url, deadline, published, featured, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'opp_existing_1',
        'Edge Engineer',
        'AFRINEX Labs',
        'Remote systems role',
        'job',
        'remote',
        'https://example.com/job',
        '2027-01-01',
        1,
        1,
        0
      );

    // Before 0010, inserting 'startup' should fail CHECK constraint
    assert.throws(() => {
      sqlite
        .prepare(
          `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run('opp_fail', 'Seed Fund', 'VC', 'Summary', 'startup', 'africa', 'https://example.com');
    });

    // Apply 0010 forward-only migration
    applyMigrationFile('0010_security_and_schema_fixes.sql');

    // Verify pre-existing opportunity row and columns are intact
    const existing = sqlite
      .prepare('SELECT id, title, opportunity_type, featured, archived FROM opportunities WHERE id = ?')
      .get('opp_existing_1') as Record<string, unknown>;
    assert.equal(existing.id, 'opp_existing_1');
    assert.equal(existing.opportunity_type, 'job');
    assert.equal(existing.featured, 1);
    assert.equal(existing.archived, 0);

    // Now inserting 'startup' and 'programs' succeeds
    sqlite
      .prepare(
        `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('opp_startup_1', 'African Founders Accelerator', 'AFRINEX', 'Seed support', 'startup', 'africa', 'https://example.com/startup');

    sqlite
      .prepare(
        `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('opp_program_1', 'Cloud Builders Fellowship', 'AFRINEX', 'Fellowship cohort', 'programs', 'global', 'https://example.com/program');

    // Invalid opportunity_type is still rejected by CHECK constraint
    assert.throws(() => {
      sqlite
        .prepare(
          `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run('opp_bad', 'Invalid', 'Org', 'Sum', 'invalid_type', 'global', 'https://example.com');
    });

    // Verify auth_nonces table and subscriptions.payment_id column exist
    const authNonceCols = sqlite.prepare('PRAGMA table_info(auth_nonces)').all() as Array<{ name: string }>;
    assert.deepEqual(
      authNonceCols.map((c) => c.name),
      ['hash', 'expires_at']
    );

    const subCols = sqlite.prepare('PRAGMA table_info(subscriptions)').all() as Array<{ name: string }>;
    assert.ok(subCols.some((c) => c.name === 'payment_id'));

    // Verify expected indexes exist
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const indexNames = new Set(indexes.map((r) => r.name));
    for (const expectedIdx of [
      'idx_opportunities_type_region',
      'idx_opportunities_featured_created',
      'idx_auth_nonces_expires',
      'idx_subscriptions_payment_id',
      'idx_payments_user_created',
      'idx_payments_status_created',
      'idx_subscriptions_user_status',
      'idx_ai_request_logs_status_created',
      'idx_users_status_created',
      'idx_telegram_analytics_bot_created',
    ]) {
      assert.ok(indexNames.has(expectedIdx), `Missing expected index: ${expectedIdx}`);
    }
  });

  it('ensureD1Schema reconciles a partially-migrated DB safely without data loss', async () => {
    resetSchemaEnsureCacheForTests();
    const { d1, sqlite } = createMigratedTestDb({
      upToMigration: '0009_seed_curated_courses.sql',
    });

    sqlite
      .prepare(
        `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url, featured)
         VALUES ('opp_keep', 'Grant Role', 'Foundation', 'Details', 'grant', 'global', 'https://example.com', 1)`
      )
      .run();

    await ensureD1Schema(d1);

    const kept = sqlite
      .prepare('SELECT id, featured FROM opportunities WHERE id = ?')
      .get('opp_keep') as { id: string; featured: number };
    assert.equal(kept.id, 'opp_keep');
    assert.equal(kept.featured, 1);

    // Rebuilt CHECK allows startup & programs
    sqlite
      .prepare(
        `INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url)
         VALUES ('opp_prog_ensure', 'Builder Cohort', 'Org', 'Desc', 'programs', 'remote', 'https://example.com')`
      )
      .run();

    const subCols = sqlite.prepare('PRAGMA table_info(subscriptions)').all() as Array<{ name: string }>;
    assert.ok(subCols.some((c) => c.name === 'payment_id'));

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_nonces'")
      .all();
    assert.equal(tables.length, 1);
  });
});
