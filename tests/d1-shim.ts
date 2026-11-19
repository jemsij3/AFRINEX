import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class TestD1PreparedStatement {
  private sqlite: DatabaseSync;
  private sql: string;
  private boundParams: unknown[];

  constructor(sqlite: DatabaseSync, sql: string, boundParams: unknown[] = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.boundParams = boundParams;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestD1PreparedStatement(this.sqlite, this.sql, values) as unknown as D1PreparedStatement;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.sqlite.prepare(this.sql);
    const row = stmt.get(...(this.boundParams as never[])) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) {
      return (row[colName] as T) ?? null;
    }
    return { ...row } as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.sqlite.prepare(this.sql);
    const result = stmt.run(...(this.boundParams as never[]));
    return {
      results: [],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0),
        changed_db: Number(result.changes ?? 0) > 0,
        changes: Number(result.changes ?? 0),
      },
    } as unknown as D1Result<T>;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.sqlite.prepare(this.sql);
    const rows = stmt.all(...(this.boundParams as never[])) as Record<string, unknown>[];
    return {
      results: rows.map((r) => ({ ...r })) as T[],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: rows.length,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
      },
    } as unknown as D1Result<T>;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const stmt = this.sqlite.prepare(this.sql);
    const rows = stmt.all(...(this.boundParams as never[])) as Record<string, unknown>[];
    return rows.map((r) => Object.values(r)) as unknown as T[];
  }
}

export class TestD1Database {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(query: string): D1PreparedStatement {
    return new TestD1PreparedStatement(this.sqlite, query) as unknown as D1PreparedStatement;
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.sqlite.exec(query);
    return { count: 1, duration: 0 };
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE;');
    try {
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        const res = await stmt.all<T>();
        results.push(res);
      }
      this.sqlite.exec('COMMIT;');
      return results;
    } catch (err) {
      try {
        this.sqlite.exec('ROLLBACK;');
      } catch {
        // Ignore rollback errors
      }
      throw err;
    }
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}

export function createMigratedTestDb(options?: { upToMigration?: string }): {
  d1: D1Database;
  sqlite: DatabaseSync;
  applyMigrationFile: (fileName: string) => void;
} {
  const instance = new TestD1Database();
  const migrationsDir = resolve(process.cwd(), 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applyMigrationFile = (fileName: string) => {
    const sql = readFileSync(resolve(migrationsDir, fileName), 'utf8');
    instance.sqlite.exec(sql);
  };

  for (const file of files) {
    if (options?.upToMigration && file > options.upToMigration) {
      break;
    }
    applyMigrationFile(file);
  }

  return {
    d1: instance as unknown as D1Database,
    sqlite: instance.sqlite,
    applyMigrationFile,
  };
}

export async function createSignedTelegramInitData(
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  },
  botToken: string,
  authDateSeconds = Math.floor(Date.now() / 1000),
  extraParams: Record<string, string> = {}
): Promise<string> {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDateSeconds));
  params.set('query_id', extraParams.query_id ?? `AAHdF6IQAAAAAN0XohD${Math.random().toString(36).slice(2, 8)}`);
  params.set('user', JSON.stringify(user));
  for (const [k, v] of Object.entries(extraParams)) {
    if (k !== 'query_id') params.set(k, v);
  }

  const entries = Array.from(params.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const encoder = new TextEncoder();

  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const botSecretBytes = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
  const dataKey = await crypto.subtle.importKey(
    'raw',
    botSecretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const hashBuffer = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  params.set('hash', hashHex);
  return params.toString();
}
