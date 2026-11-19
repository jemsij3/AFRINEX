# AFRINEX Database Schema & Migration Strategy

## Authoritative Source of Truth

All Cloudflare D1 (SQLite) tables, `CHECK` constraints, indexes, and default seeds are authoritatively defined in the numbered forward-only migration files inside `migrations/`:

- `migrations/0001_initial_schema.sql` — Core tables (`users`, `ai_conversations`, `ai_messages`, `ai_daily_usage`, `courses`, `lessons`, `lesson_progress`, `ai_tools`, `opportunities`, `bookmarks`, `builder_projects`, `subscriptions`, `payments`, `rate_limits`, `audit_logs`)
- `migrations/0002_seed_initial_data.sql` — Initial catalog seeds
- `migrations/0003_seed_more_content.sql` — Extended catalog seeds
- `migrations/0004_seed_builders_and_curriculum.sql` — Curated builder & curriculum content
- `migrations/0005_telegram_bots_and_analytics.sql` — `telegram_bots` and `telegram_analytics` tables
- `migrations/0006_enrollments_and_certificates.sql` — `course_enrollments` and `certificates`
- `migrations/0007_seed_full_content.sql` — Full platform catalog seed data
- `migrations/0008_admin_platform_controls.sql` — Admin RBAC metadata, `app_settings`, `announcements`, `ai_request_logs`, course images/resources, opportunity flags, payment reconciliation columns
- `migrations/0009_seed_curated_courses.sql` — Additional curated courses and resources
- `migrations/0010_security_and_schema_fixes.sql` — `auth_nonces` replay protection table, `subscriptions.payment_id`, expanded `opportunities.opportunity_type` (`'startup'`, `'programs'`), and performance indexes

## Migration Rules

1. **Never edit or rewrite historical migrations (`0001`–`0010`).** Always add a new numbered forward-only migration (e.g., `0011_*.sql`) when changing schema.
2. **Default app settings are single-sourced** in `shared/defaultAppSettings.json` (used by `shared/settingsDefaults.ts` in the Worker and read directly by `scripts/migrate-remote-d1.mjs` in CI).
3. **Runtime guard (`worker/lib/schemaEnsure.ts`)** is intentionally minimal: it fast-paths as soon as `0010_security_and_schema_fixes.sql` is recorded in `d1_migrations`, and only performs non-destructive additive compatibility checks when serving a partially-migrated database.
4. **Deployment reconciliation (`scripts/migrate-remote-d1.mjs`)** normalizes legacy pre-migration remote databases before running `wrangler d1 migrations apply afrinex-db --remote`.
