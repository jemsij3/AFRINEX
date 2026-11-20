# AFRINEX Backups, Disaster Recovery & Storage Evaluation

> **Environment Note**: No remote production deployment, remote D1 export, or Cloudflare R2 provisioning commands were run during development. All procedures below reflect Cloudflare's standard tooling for AFRINEX's configured D1 database (`afrinex-db`).

## 1. D1 Database Backup & Time Travel Strategy

AFRINEX stores all relational application state in **Cloudflare D1** (`migrations/0001_*.sql` through `migrations/0011_phases_3_4_5_platform_expansion.sql`).

### Built-In Point-in-Time Recovery (D1 Time Travel)
Cloudflare D1 maintains automatic continuous bookmarks for up to 30 days on paid Workers plans (7 days on Free):

```bash
# Inspect current bookmark before any maintenance or schema migration
npx wrangler d1 time-travel info afrinex-db

# Restore to a known-good timestamp or bookmark (run only during an approved incident response)
npx wrangler d1 time-travel restore afrinex-db --timestamp="2026-04-01T12:00:00Z"
```

### Scheduled SQL Snapshots (`wrangler d1 export`)
Before every release migration or weekly backup window:

```bash
# Export full schema + data to an encrypted off-site archive
npx wrangler d1 export afrinex-db --remote --output="backups/afrinex-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

Store exported `.sql` archives only in encrypted private storage because tables contain hashed/encrypted user credentials (`integrations.credential_enc`, `telegram_bots.bot_token`) and payment records (`payments`). **Never commit SQL dumps to Git.**

### Restore & Verification Drill
1. Create a staging/verification database or use a local SQLite replica:
   ```bash
   npx wrangler d1 execute afrinex-db-staging --local --file=backups/<latest>.sql
   ```
2. Verify row counts on critical tables: `users`, `builder_projects`, `builder_project_versions`, `payments`, `subscriptions`, `opportunity_applications`, `integrations`, `support_tickets`.
3. Verify schema version matches `migrations/0011_phases_3_4_5_platform_expansion.sql`.

---

## 2. Automated Maintenance & Data Hygiene (`wrangler.toml` Cron)

AFRINEX defines an hourly Cloudflare Workers cron trigger in `wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]
```

Handled by `worker/lib/cronJobs.ts` (`runScheduledMaintenance(env)`), it executes:
1. Pruning expired `auth_nonces` replay-protection records (`expires_at < now`).
2. Pruning expired `rate_limits` fixed-window counters (`window_end < now - 3600s`).
3. Syncing expired `subscriptions` (`status = 'active'` with `expires_at <= now` -> `'expired'`) and downgrading `users.tier` to `'free'` when no active subscription remains.
4. Delivering deduplicated in-app (+ optional Telegram DM) reminders for tracked opportunity deadlines within the next 48 hours.
5. Recording execution outcomes into `cron_job_runs` (`GET /api/admin/monitoring` & `POST /api/admin/monitoring/run-cron`).

---

## 3. Cloudflare R2 Object Storage Evaluation

### Current Assessment
- **Currently stored assets**: Builder source bundles (`builder_projects.files_json`) are lightweight text/code bundles (<150 KB per project) queried and versioned relationally in `builder_projects` and `builder_project_versions`. User avatars are URL references (`users.photo_url`).
- **Recommendation**: **Defer mandatory R2 binding** until user-uploaded binary media (custom course videos/PDFs, user-uploaded profile images, or archived build ZIPs exceeding D1 row limits) is introduced. Keeping D1-only avoids unnecessary Cloudflare bucket provisioning failures during preview/CI runs.
- **Upgrade Path**: When binary uploads are needed, uncomment an `[[r2_buckets]]` binding (`binding = "ASSETS_BUCKET"`, `bucket_name = "afrinex-assets"`) in `wrangler.toml`, generate pre-signed upload tokens or Worker-proxied `/api/media/*` routes gated by `requireAuth` + MIME/size allowlists, and store only the `r2_object_key` in D1.
