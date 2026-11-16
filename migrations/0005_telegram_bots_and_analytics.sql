-- Telegram bot management and per-bot webhook event records.
-- Migration 0004 is already used by 0004_remove_placeholder_seed_data.sql;
-- this additive migration uses the next sequence number and preserves existing data.

CREATE TABLE IF NOT EXISTS telegram_bots (
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
);

CREATE INDEX IF NOT EXISTS idx_telegram_bots_user ON telegram_bots(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_analytics (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_telegram_analytics_bot_created ON telegram_analytics(bot_id, created_at DESC);
