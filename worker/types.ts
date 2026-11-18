import type { PlatformUser } from '../shared/types.ts';

export interface WorkerBindings {
  DB?: D1Database;
  AI?: Ai;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  WORKERS_AI_MODEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  JWT_SECRET?: string;
  ADMIN_TELEGRAM_IDS?: unknown;
  ADMIN_TELEGRAM_ID?: unknown;
  TELEGRAM_ADMIN_IDS?: unknown;
  TELEGRAM_ADMIN_ID?: unknown;
  OWNER_TELEGRAM_IDS?: unknown;
  OWNER_TELEGRAM_ID?: unknown;
}

export interface WorkerVariables {
  user?: PlatformUser;
}

export interface AppEnv {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
}
