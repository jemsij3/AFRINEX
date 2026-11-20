-- AFRINEX Phases 3, 4 & 5 Platform Expansion
-- Migration: 0011_phases_3_4_5_platform_expansion.sql
-- Forward-only migration preserving all existing data from 0001..0010.

PRAGMA foreign_keys = ON;

-- 1. Upgrade builder_projects for Workspace organization & extended lifecycle statuses
--    Preserves all existing builder_projects rows safely.
CREATE TABLE builder_projects_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  builder_type TEXT NOT NULL CHECK (builder_type IN ('telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow')),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  spec_json TEXT NOT NULL DEFAULT '{}',
  files_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'failed', 'generated', 'previewed', 'deployed')),
  folder TEXT NOT NULL DEFAULT 'General',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO builder_projects_new (
  id, user_id, builder_type, name, prompt, spec_json, files_json, status, folder, is_favorite, last_error, created_at, updated_at
)
SELECT
  id, user_id, builder_type, name, prompt, spec_json, files_json, status, 'General', 0, NULL, created_at, updated_at
FROM builder_projects;

DROP TABLE builder_projects;
ALTER TABLE builder_projects_new RENAME TO builder_projects;

CREATE INDEX IF NOT EXISTS idx_builder_projects_user
  ON builder_projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_projects_user_fav
  ON builder_projects(user_id, is_favorite DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_projects_type_status
  ON builder_projects(builder_type, status);

-- 2. Builder Project Version History (Snapshots & Restore)
CREATE TABLE IF NOT EXISTS builder_project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT 'Snapshot',
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  spec_json TEXT NOT NULL DEFAULT '{}',
  files_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (project_id) REFERENCES builder_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_builder_versions_project
  ON builder_project_versions(project_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_builder_versions_user
  ON builder_project_versions(user_id, created_at DESC);

-- 3. Opportunity Tracker (Saved, Applied, Interviewing, Accepted, Rejected, Deadlines & Notes)
CREATE TABLE IF NOT EXISTS opportunity_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'applied', 'interviewing', 'accepted', 'rejected', 'withdrawn')),
  applied_at TEXT,
  deadline_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, opportunity_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opp_apps_user_status
  ON opportunity_applications(user_id, status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_opp_apps_deadline_reminder
  ON opportunity_applications(deadline_at, reminder_sent_at);

-- 4. Shared Integrations & Connections (Encrypted Credential Architecture)
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('telegram_bot', 'webhook', 'external_api', 'openai_compatible', 'custom')),
  name TEXT NOT NULL,
  endpoint_url TEXT,
  credentials_encrypted TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'disconnected')),
  last_tested_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_integrations_user_provider
  ON integrations(user_id, provider, updated_at DESC);

-- 5. Unified Notifications & Preferences
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ai', 'project', 'integration', 'payment', 'learning', 'opportunity', 'announcement', 'support', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link_section TEXT,
  link_ref_id TEXT,
  dedupe_key TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  telegram_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  telegram_enabled INTEGER NOT NULL DEFAULT 1,
  deadlines_enabled INTEGER NOT NULL DEFAULT 1,
  ai_events_enabled INTEGER NOT NULL DEFAULT 1,
  project_events_enabled INTEGER NOT NULL DEFAULT 1,
  billing_events_enabled INTEGER NOT NULL DEFAULT 1,
  announcements_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Help & Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'account', 'billing', 'builders', 'integrations', 'bug', 'feature')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply TEXT,
  replied_by TEXT,
  replied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status, created_at DESC);

-- 7. Platform Monitoring & Background Cron Job Telemetry (Strictly Scrubbed)
CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  category TEXT NOT NULL CHECK (category IN ('api', 'ai', 'telegram', 'payment', 'database', 'cron', 'integration')),
  event_name TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id TEXT,
  request_path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_system_logs_cat_created
  ON system_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created
  ON system_logs(level, created_at DESC);

CREATE TABLE IF NOT EXISTS cron_job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  processed_count INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_name_started
  ON cron_job_runs(job_name, started_at DESC);

-- 8. Additional Query Performance Indexes
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline
  ON opportunities(published, archived, deadline);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset
  ON rate_limits(reset_at);
