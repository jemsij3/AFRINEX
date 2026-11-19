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

const MISSING_TABLE_DDL: Record<string, string[]> = {
  ai_conversations: [
    `CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT 'general' CHECK (topic IN ('general', 'tech', 'ai', 'web3', 'business')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC)`,
  ],
  ai_messages: [
    `CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, created_at ASC)`,
  ],
  ai_daily_usage: [
    `CREATE TABLE IF NOT EXISTS ai_daily_usage (
      user_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, usage_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ],
  courses: [
    `CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      track TEXT NOT NULL CHECK (track IN ('beginner', 'intermediate', 'advanced')),
      category TEXT NOT NULL,
      is_pro INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_courses_track ON courses(track, published)`,
  ],
  lessons: [
    `CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content_md TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 10,
      sort_order INTEGER NOT NULL DEFAULT 1,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, sort_order ASC)`,
  ],
  lesson_progress: [
    `CREATE TABLE IF NOT EXISTS lesson_progress (
      user_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (user_id, lesson_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    )`,
  ],
  ai_tools: [
    `CREATE TABLE IF NOT EXISTS ai_tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('writing', 'coding', 'design', 'productivity', 'business')),
      url TEXT NOT NULL,
      pricing_model TEXT NOT NULL DEFAULT 'freemium' CHECK (pricing_model IN ('free', 'freemium', 'paid', 'open-source')),
      featured INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_tools_category ON ai_tools(category, published)`,
  ],
  opportunities: [
    `CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      organization TEXT NOT NULL,
      summary TEXT NOT NULL,
      opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('job', 'freelance', 'scholarship', 'grant', 'event')),
      region TEXT NOT NULL CHECK (region IN ('africa', 'global', 'remote')),
      url TEXT NOT NULL,
      deadline TEXT,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_opportunities_type_region ON opportunities(opportunity_type, region, published)`,
  ],
  bookmarks: [
    `CREATE TABLE IF NOT EXISTS bookmarks (
      user_id TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('course', 'tool', 'opportunity')),
      item_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (user_id, item_type, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ],
  builder_projects: [
    `CREATE TABLE IF NOT EXISTS builder_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      builder_type TEXT NOT NULL CHECK (builder_type IN ('telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow')),
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      spec_json TEXT NOT NULL DEFAULT '{}',
      files_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'previewed', 'deployed')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_builder_projects_user ON builder_projects(user_id, updated_at DESC)`,
  ],
  telegram_services: [
    `CREATE TABLE IF NOT EXISTS telegram_services (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      service_type TEXT NOT NULL CHECK (service_type IN ('bot_dev', 'channel_tools', 'mini_app', 'integration', 'support_automation')),
      title TEXT NOT NULL,
      requirements TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'paused')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_telegram_services_user ON telegram_services(user_id, updated_at DESC)`,
  ],
  telegram_bots: [
    `CREATE TABLE IF NOT EXISTS telegram_bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bot_token TEXT NOT NULL,
      bot_username TEXT,
      bot_name TEXT,
      webhook_url TEXT,
      webhook_secret TEXT,
      webhook_active INTEGER NOT NULL DEFAULT 0 CHECK (webhook_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_telegram_bots_user ON telegram_bots(user_id, created_at DESC)`,
  ],
  telegram_analytics: [
    `CREATE TABLE IF NOT EXISTS telegram_analytics (
      id TEXT PRIMARY KEY,
      bot_id TEXT NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_telegram_analytics_bot_created ON telegram_analytics(bot_id, created_at DESC)`,
  ],
  course_enrollments: [
    `CREATE TABLE IF NOT EXISTS course_enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(user_id, course_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_user ON course_enrollments(user_id, enrolled_at DESC)`,
  ],
  certificates: [
    `CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      certificate_code TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(user_id, course_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id, issued_at DESC)`,
  ],
  subscriptions: [
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL CHECK (plan IN ('pro_monthly', 'pro_yearly')),
      status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ],
  payments: [
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      telegram_payment_charge_id TEXT NOT NULL UNIQUE,
      provider_payment_charge_id TEXT,
      currency TEXT NOT NULL DEFAULT 'XTR',
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ],
  rate_limits: [
    `CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at INTEGER NOT NULL
    )`,
  ],
  audit_logs: [
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)`,
  ],
  app_settings: [
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
  ],
  announcements: [
    `CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'free', 'pro')),
      published INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      sent_at TEXT,
      delivery_count INTEGER NOT NULL DEFAULT 0,
      delivery_status TEXT NOT NULL DEFAULT 'draft' CHECK (delivery_status IN ('draft', 'published', 'sent', 'partial')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published, created_at DESC)`,
  ],
  ai_request_logs: [
    `CREATE TABLE IF NOT EXISTS ai_request_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')),
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created ON ai_request_logs(created_at DESC, status)`,
  ],
};

const REQUIRED_COLUMNS: Record<string, ColumnSpec[]> = {
  users: [
    { name: 'username', definition: 'TEXT' },
    { name: 'first_name', definition: "TEXT NOT NULL DEFAULT 'Member'" },
    { name: 'last_name', definition: 'TEXT' },
    { name: 'photo_url', definition: 'TEXT' },
    { name: 'language_code', definition: "TEXT DEFAULT 'en'" },
    { name: 'role', definition: "TEXT NOT NULL DEFAULT 'member'" },
    { name: 'tier', definition: "TEXT NOT NULL DEFAULT 'free'" },
    { name: 'pro_expires_at', definition: 'TEXT' },
    { name: 'token_version', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'account_status', definition: "TEXT NOT NULL DEFAULT 'active'" },
    { name: 'admin_permissions_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'last_active_at', definition: 'TEXT' },
    { name: 'suspended_at', definition: 'TEXT' },
    { name: 'suspended_reason', definition: 'TEXT' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE users SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE users SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL",
    },
  ],
  courses: [
    { name: 'slug', definition: 'TEXT' },
    { name: 'summary', definition: "TEXT NOT NULL DEFAULT ''" },
    { name: 'track', definition: "TEXT NOT NULL DEFAULT 'beginner'" },
    { name: 'category', definition: "TEXT NOT NULL DEFAULT 'General'" },
    { name: 'is_pro', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'published', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'image_url', definition: 'TEXT' },
    { name: 'resources_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE courses SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  lessons: [
    { name: 'duration_mins', definition: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'published', definition: 'INTEGER NOT NULL DEFAULT 1' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE lessons SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  course_enrollments: [
    {
      name: 'enrolled_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE course_enrollments SET enrolled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE enrolled_at IS NULL",
    },
  ],
  certificates: [
    {
      name: 'certificate_code',
      definition: 'TEXT',
      backfillSql:
        "UPDATE certificates SET certificate_code = 'AFRINEX-' || course_id || '-' || user_id || '-' || id WHERE certificate_code IS NULL",
    },
    {
      name: 'issued_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE certificates SET issued_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE issued_at IS NULL",
    },
  ],
  bookmarks: [
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE bookmarks SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  lesson_progress: [
    {
      name: 'completed_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE lesson_progress SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE completed_at IS NULL",
    },
  ],
  ai_tools: [
    { name: 'pricing_model', definition: "TEXT NOT NULL DEFAULT 'freemium'" },
    { name: 'featured', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'published', definition: 'INTEGER NOT NULL DEFAULT 1' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE ai_tools SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  opportunities: [
    { name: 'deadline', definition: 'TEXT' },
    { name: 'published', definition: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'featured', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'archived', definition: 'INTEGER NOT NULL DEFAULT 0' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE opportunities SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  ai_conversations: [
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE ai_conversations SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE ai_conversations SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL",
    },
  ],
  builder_projects: [
    { name: 'spec_json', definition: "TEXT NOT NULL DEFAULT '{}'" },
    { name: 'files_json', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'draft'" },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE builder_projects SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE builder_projects SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL",
    },
  ],
  telegram_services: [
    { name: 'config_json', definition: "TEXT NOT NULL DEFAULT '{}'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'planned'" },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE telegram_services SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE telegram_services SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL",
    },
  ],
  telegram_bots: [
    { name: 'bot_username', definition: 'TEXT' },
    { name: 'bot_name', definition: 'TEXT' },
    { name: 'webhook_url', definition: 'TEXT' },
    { name: 'webhook_secret', definition: 'TEXT' },
    { name: 'webhook_active', definition: 'INTEGER NOT NULL DEFAULT 0' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE telegram_bots SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE telegram_bots SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL",
    },
  ],
  payments: [
    { name: 'provider_payment_charge_id', definition: 'TEXT' },
    { name: 'currency', definition: "TEXT NOT NULL DEFAULT 'XTR'" },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'completed'" },
    { name: 'reconciliation_note', definition: 'TEXT' },
    { name: 'reconciled_at', definition: 'TEXT' },
    { name: 'failed_reason', definition: 'TEXT' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE payments SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  app_settings: [
    { name: 'value_json', definition: "TEXT NOT NULL DEFAULT 'null'" },
    { name: 'updated_by', definition: 'TEXT' },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE app_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE updated_at IS NULL",
    },
  ],
  announcements: [
    { name: 'audience', definition: "TEXT NOT NULL DEFAULT 'all'" },
    { name: 'published', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'created_by', definition: 'TEXT' },
    { name: 'sent_at', definition: 'TEXT' },
    { name: 'delivery_count', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'delivery_status', definition: "TEXT NOT NULL DEFAULT 'draft'" },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE announcements SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
    {
      name: 'updated_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE announcements SET updated_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE updated_at IS NULL",
    },
  ],
  subscriptions: [
    {
      name: 'started_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE subscriptions SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE started_at IS NULL",
    },
    {
      name: 'expires_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE subscriptions SET expires_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE expires_at IS NULL",
    },
  ],
  audit_logs: [
    { name: 'actor_user_id', definition: 'TEXT' },
    { name: 'target_type', definition: 'TEXT' },
    { name: 'target_id', definition: 'TEXT' },
    { name: 'metadata_json', definition: "TEXT NOT NULL DEFAULT '{}'" },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE audit_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
  ai_request_logs: [
    { name: 'error_message', definition: 'TEXT' },
    {
      name: 'created_at',
      definition: 'TEXT',
      backfillSql:
        "UPDATE ai_request_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL",
    },
  ],
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

  // Do not pre-create core tables on a completely uninitialized database so
  // Wrangler migrations can still initialize a fresh DB from scratch.
  if (!existingTables.has('users')) {
    return;
  }

  for (const [tableName, statements] of Object.entries(MISSING_TABLE_DDL)) {
    if (!existingTables.has(tableName)) {
      for (const sql of statements) {
        await db.prepare(sql).run();
      }
      existingTables.add(tableName);
    }
  }

  const columnChecks = Object.entries(REQUIRED_COLUMNS).filter(([tableName]) =>
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

  ensuredDbRef.add(db);
}

/**
 * Ensures Stage 0 / partially-migrated D1 databases have all additive columns and
 * secondary tables expected by AFRINEX routes without dropping or altering data.
 * Runs at most once per Worker isolate for a given D1 binding.
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
