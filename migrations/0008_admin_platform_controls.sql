-- Additive migration 0008: Admin platform controls, RBAC metadata, announcements, settings, and AI telemetry

-- 1. User account status, granular delegated admin permissions, and activity timestamps
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN admin_permissions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN last_active_at TEXT;
ALTER TABLE users ADD COLUMN suspended_at TEXT;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;

-- 2. Course cover image URL and learning resource links
ALTER TABLE courses ADD COLUMN image_url TEXT;
ALTER TABLE courses ADD COLUMN resources_json TEXT NOT NULL DEFAULT '[]';

-- 3. Opportunity featuring and archiving
ALTER TABLE opportunities ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- 4. Payment reconciliation metadata & failure details
ALTER TABLE payments ADD COLUMN reconciliation_note TEXT;
ALTER TABLE payments ADD COLUMN reconciled_at TEXT;
ALTER TABLE payments ADD COLUMN failed_reason TEXT;

-- 5. Application configuration settings (never stores secrets or tokens)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 6. Platform announcements & Telegram Bot broadcast tracking
CREATE TABLE IF NOT EXISTS announcements (
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
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published, created_at DESC);

-- 7. Aggregate AI inference health log (no private user chat content stored)
CREATE TABLE IF NOT EXISTS ai_request_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created ON ai_request_logs(created_at DESC, status);

-- 8. Seed default platform settings safely
INSERT OR IGNORE INTO app_settings (key, value_json) VALUES
  ('platform_name', '"AFRINEX"'),
  ('platform_slogan', '"African Roots. Global Impact."'),
  ('maintenance_mode', 'false'),
  ('maintenance_message', '"AFRINEX is undergoing scheduled maintenance. Please check back shortly."'),
  ('registration_enabled', 'true'),
  ('feature_ai_assistant_enabled', 'true'),
  ('feature_builders_enabled', 'true'),
  ('feature_learning_enabled', 'true'),
  ('feature_tools_enabled', 'true'),
  ('feature_opportunities_enabled', 'true'),
  ('feature_telegram_services_enabled', 'true'),
  ('feature_subscriptions_enabled', 'true'),
  ('ai_free_daily_limit', '20'),
  ('ai_system_prompt', '"You are AFRINEX AI Assistant, a helpful AI focused on AI, technology, Web3, business, and general assistance. Be concise, accurate, and helpful."'),
  ('builder_daily_limit', '10'),
  ('enabled_builder_types', '["telegram_bot","ai_agent","website","mini_app","workflow"]'),
  ('pro_monthly_stars', '150'),
  ('pro_yearly_stars', '1500'),
  ('free_plan_label', '"Free Member"'),
  ('pro_plan_label', '"AFRINEX Pro"');
