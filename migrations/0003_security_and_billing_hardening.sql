-- AFRINEX Security, Session Revocation & AI Quota Hardening
-- Migration: 0003_security_and_billing_hardening.sql

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS ai_daily_usage (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
