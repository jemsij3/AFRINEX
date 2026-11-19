-- AFRINEX Phase 1 Security, Data Integrity & Schema Fixes
-- Migration: 0010_security_and_schema_fixes.sql

-- 1. Rebuild opportunities table to allow 'startup' and 'programs' in opportunity_type CHECK constraint
--    while preserving all existing rows, columns, and indexes.
CREATE TABLE opportunities_new (
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
);

INSERT INTO opportunities_new (
  id,
  title,
  organization,
  summary,
  opportunity_type,
  region,
  url,
  deadline,
  published,
  featured,
  archived,
  created_at
)
SELECT
  id,
  title,
  organization,
  summary,
  opportunity_type,
  region,
  url,
  deadline,
  published,
  COALESCE(featured, 0),
  COALESCE(archived, 0),
  created_at
FROM opportunities;

DROP TABLE opportunities;

ALTER TABLE opportunities_new RENAME TO opportunities;

CREATE INDEX IF NOT EXISTS idx_opportunities_type_region
  ON opportunities(opportunity_type, region, published);
CREATE INDEX IF NOT EXISTS idx_opportunities_featured_created
  ON opportunities(published, archived, featured, created_at DESC);

-- 2. Replay protection table storing only SHA-256 hashes of verified Telegram initData
CREATE TABLE IF NOT EXISTS auth_nonces (
  hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires
  ON auth_nonces(expires_at);

-- 3. Associate subscriptions with their originating payment for scoped refund revocation
ALTER TABLE subscriptions ADD COLUMN payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_id
  ON subscriptions(payment_id);

-- 4. Missing query performance indexes identified in repository audit
CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON payments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions(user_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_request_logs_status_created
  ON ai_request_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_status_created
  ON users(account_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_analytics_bot_created
  ON telegram_analytics(bot_id, created_at DESC);
