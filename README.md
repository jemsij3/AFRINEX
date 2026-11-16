# AFRINEX

**African Roots. Global Impact.**  
**Learn. Build. Automate. Grow.**

AFRINEX is a Telegram Mini App and edge web platform for digital skills learning, AI assistance, AI product builders, Telegram automation blueprints, curated AI tools, global opportunities, and Telegram Stars (`XTR`) Pro memberships.

## Architecture

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4 (`/src`)
- **Backend API**: Hono on Cloudflare Workers (`/worker`)
- **Database**: Cloudflare D1 (`/migrations`)
- **AI Inference**: Cloudflare Workers AI (`env.AI`, default model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- **Auth & Billing**: Telegram Mini App `initData` HMAC-SHA256 authentication, JWT sessions, RBAC, and Telegram Stars (`XTR`) webhook billing

## Development Workflow

```text
Google AI Studio (Build & Local Verification)
   │
   ▼  Push source to GitHub
GitHub Repository (`.github/workflows/deploy.yml`)
   │
   ▼  CI verify + D1 remote migrations + `wrangler deploy`
Cloudflare Workers + Static Assets + D1 + Workers AI
   │
   ▼  Webhook (`setWebhook`) + Mini App Menu Button (`@BotFather`)
Telegram Bot & Mini App
```

## Local Development vs. Production Deployment

| Aspect | Local Development (AI Studio / Localhost) | Production (Cloudflare Workers) |
| --- | --- | --- |
| Dev Server | `npm run dev` serves Vite on port `3000` and routes `/api/*` through `vite.config.ts` Wrangler `PlatformProxy` (`remoteBindings: false`) | `worker/index.ts` handles `/api/*` directly (`run_worker_first = ["/api/*"]`) and `ASSETS` serves `./dist` with SPA fallback |
| Database | Local D1 SQLite state (`.wrangler/state`) via `npm run db:migrate:local` | Remote Cloudflare D1 (`afrinex-db`) via `npm run db:migrate:remote` |
| Secrets | `.dev.vars` (copied from `.dev.vars.example`, gitignored) | Cloudflare Worker Secrets (`npx wrangler secret put ...`) |
| Workers AI | Local proxy has no remote GPU auth unless logged into Cloudflare; live AI inference requires Cloudflare | Bound via `[ai] binding = "AI"` using `WORKERS_AI_MODEL` |
| Telegram Auth | Outside Telegram, `initData` is absent so Telegram login cannot run unless opened inside Telegram | Inside Telegram Mini App, `window.Telegram.WebApp.initData` is verified via HMAC-SHA256 |

### Local Commands

```bash
npm install
npm run db:migrate:local
npm run lint
npm run build
npx wrangler deploy --dry-run
npm run dev
```

To configure local Worker secrets for `wrangler dev`:

```bash
cp .dev.vars.example .dev.vars
```

## Required Cloudflare Resources, Bindings & Secrets

### 1. Bindings (`wrangler.toml`)

- `DB` (`[[d1_databases]]`): Cloudflare D1 database named `afrinex-db`
- `AI` (`[ai]`): Cloudflare Workers AI binding
- `ASSETS` (`[assets]`): `./dist` with `not_found_handling = "single-page-application"` and `run_worker_first = ["/api/*"]`
- `[vars]`:
  - `ENVIRONMENT = "production"`
  - `WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"`

### 2. Worker Secrets (Never Commit to GitHub)

Set these on your Cloudflare Worker after creating it:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_TELEGRAM_IDS
```

- `TELEGRAM_BOT_TOKEN`: Bot token from `@BotFather`.
- `TELEGRAM_WEBHOOK_SECRET`: Random 32+ character string validated against `X-Telegram-Bot-Api-Secret-Token`.
- `JWT_SECRET`: Random 64+ character HMAC secret (`>= 32` chars enforced in production).
- `ADMIN_TELEGRAM_IDS`: Comma-separated numeric Telegram user IDs (server-side only; never exposed to the frontend).

### 3. GitHub Actions Secrets (`.github/workflows/deploy.yml`)

In GitHub **Settings -> Secrets and variables -> Actions**, add:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The `deploy` job runs only on pushes to `main` after `verify` passes, and aborts safely if `wrangler.toml` still contains the placeholder `database_id` (`00000000-0000-0000-0000-000000000000`) or missing Cloudflare secrets.

## First-Time Cloudflare & Telegram Setup

1. **Create the D1 Database**:
   ```bash
   npx wrangler d1 create afrinex-db
   ```
   Copy the returned `database_id` into `wrangler.toml` and commit the change to GitHub.

2. **Apply Remote Migrations**:
   ```bash
   npm run db:migrate:remote
   ```
   (`0001_initial_schema.sql` through `0004_remove_placeholder_seed_data.sql` create all tables cleanly without stub catalog or dev-login rows.)

3. **Set Cloudflare Worker Secrets** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `JWT_SECRET`, `ADMIN_TELEGRAM_IDS`), including your own Telegram numeric user ID in `ADMIN_TELEGRAM_IDS`.

4. **Deploy Worker + Static Assets**:
   ```bash
   npm run deploy
   ```
   (Or push to `main` with GitHub Actions secrets configured.)

5. **Configure Telegram Bot & Mini App**:
   - In `@BotFather`, set the Mini App / Menu Button URL to your deployed HTTPS Cloudflare Worker URL (`https://<your-domain>`).
   - Register the bot webhook with the same secret stored in `TELEGRAM_WEBHOOK_SECRET`:
     ```bash
     curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
       -H "Content-Type: application/json" \
       -d '{
         "url": "https://<your-domain>/api/webhooks/telegram",
         "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
         "allowed_updates": ["message", "pre_checkout_query"]
       }'
     ```

6. **Bootstrap First Admin & Publish Content**:
   - Open the Mini App inside Telegram from the account whose ID is in `ADMIN_TELEGRAM_IDS`.
   - `POST /api/auth/telegram` verifies `initData`, registers the account in D1, and grants `role = 'admin'`.
   - Open the **Admin** console from your Dashboard to publish real courses, lessons, AI tools, and opportunities.
