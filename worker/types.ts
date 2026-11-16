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
  ADMIN_TELEGRAM_IDS?: string;
}

export interface WorkerVariables {
  user?: PlatformUser;
}

export interface AppEnv {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
}
