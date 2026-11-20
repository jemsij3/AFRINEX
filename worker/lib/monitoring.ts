import type {
  NotificationPreferences,
  NotificationType,
  PlatformSectionId,
  SystemLogCategory,
  SystemLogLevel,
} from '../../shared/types.ts';
import { sendTelegramMessage } from './telegramBot.ts';

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|auth_?header|api_?key|init_?data|cookie|credential|charge_id)/i;

export function scrubSensitiveText(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/(bot)(\d{6,}:[A-Za-z0-9_-]{20,})/gi, '$1[REDACTED_BOT_TOKEN]')
    .replace(/(initData=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(hash=)[a-f0-9]{16,}/gi, '$1[REDACTED]')
    .replace(/(x-telegram-bot-api-secret-token["':\s=]+)[^\s,"'}]+/gi, '$1[REDACTED]')
    .slice(0, 600);
}

export function scrubSensitiveObject(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubSensitiveText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubSensitiveObject(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubSensitiveObject(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export interface SystemEventInput {
  level: SystemLogLevel;
  category: SystemLogCategory;
  eventName: string;
  message: string;
  userId?: string | null;
  requestPath?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
}

export async function logSystemEvent(
  db: D1Database | undefined,
  entry: SystemEventInput
): Promise<void> {
  if (!db) return;
  try {
    const id = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const scrubbedMsg = scrubSensitiveText(entry.message);
    const scrubbedPath = entry.requestPath ? scrubSensitiveText(entry.requestPath).slice(0, 180) : null;
    const scrubbedMeta = JSON.stringify(scrubSensitiveObject(entry.metadata ?? {}));

    await db
      .prepare(
        `INSERT INTO system_logs (id, level, category, event_name, message, user_id, request_path, status_code, duration_ms, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        entry.level,
        entry.category,
        entry.eventName.slice(0, 80),
        scrubbedMsg,
        entry.userId ?? null,
        scrubbedPath,
        entry.statusCode ?? null,
        entry.durationMs ?? null,
        scrubbedMeta
      )
      .run();
  } catch {
    // Monitoring writes must never crash user requests
  }
}

interface PrefRow {
  user_id: string;
  telegram_enabled: number;
  deadlines_enabled: number;
  ai_events_enabled: number;
  project_events_enabled: number;
  billing_events_enabled: number;
  announcements_enabled: number;
  updated_at: string;
}

export async function getUserNotificationPreferences(
  db: D1Database,
  userId: string
): Promise<NotificationPreferences> {
  const row = await db
    .prepare(
      `SELECT user_id, telegram_enabled, deadlines_enabled, ai_events_enabled,
              project_events_enabled, billing_events_enabled, announcements_enabled, updated_at
       FROM notification_preferences
       WHERE user_id = ?`
    )
    .bind(userId)
    .first<PrefRow>();

  if (!row) {
    return {
      userId,
      telegramEnabled: true,
      deadlinesEnabled: true,
      aiEventsEnabled: true,
      projectEventsEnabled: true,
      billingEventsEnabled: true,
      announcementsEnabled: true,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    userId: row.user_id,
    telegramEnabled: row.telegram_enabled === 1,
    deadlinesEnabled: row.deadlines_enabled === 1,
    aiEventsEnabled: row.ai_events_enabled === 1,
    projectEventsEnabled: row.project_events_enabled === 1,
    billingEventsEnabled: row.billing_events_enabled === 1,
    announcementsEnabled: row.announcements_enabled === 1,
    updatedAt: row.updated_at,
  };
}

function isTypeEnabledByPreferences(
  prefs: NotificationPreferences,
  type: NotificationType
): boolean {
  if (type === 'opportunity') return prefs.deadlinesEnabled;
  if (type === 'ai') return prefs.aiEventsEnabled;
  if (type === 'project') return prefs.projectEventsEnabled;
  if (type === 'payment') return prefs.billingEventsEnabled;
  if (type === 'announcement') return prefs.announcementsEnabled;
  return true;
}

export interface CreateNotificationOptions {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkSection?: PlatformSectionId | null;
  linkRefId?: string | null;
  dedupeKey?: string | null;
  telegramBotToken?: string;
  telegramChatId?: number | null;
}

export async function createNotificationSafe(
  db: D1Database | undefined,
  options: CreateNotificationOptions
): Promise<{ created: boolean; telegramSent: boolean; notificationId?: string }> {
  if (!db) return { created: false, telegramSent: false };

  try {
    const prefs = await getUserNotificationPreferences(db, options.userId);
    if (!isTypeEnabledByPreferences(prefs, options.type)) {
      return { created: false, telegramSent: false };
    }

    const id = `ntf_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const insertRes = await db
      .prepare(
        `INSERT OR IGNORE INTO notifications (id, user_id, type, title, body, link_section, link_ref_id, dedupe_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        options.userId,
        options.type,
        options.title.slice(0, 140),
        scrubSensitiveText(options.body).slice(0, 600),
        options.linkSection ?? null,
        options.linkRefId ?? null,
        options.dedupeKey ?? null
      )
      .run();

    const created = Number(insertRes.meta.changes ?? 0) > 0;
    if (!created) {
      return { created: false, telegramSent: false };
    }

    let telegramSent = false;
    if (options.telegramBotToken && prefs.telegramEnabled) {
      let chatId = options.telegramChatId ?? null;
      if (!chatId) {
        const u = await db
          .prepare('SELECT telegram_id FROM users WHERE id = ?')
          .bind(options.userId)
          .first<{ telegram_id: number }>();
        chatId = u?.telegram_id ?? null;
      }
      if (chatId && chatId > 0) {
        try {
          await sendTelegramMessage(
            options.telegramBotToken,
            chatId,
            `${options.title}\n\n${scrubSensitiveText(options.body)}`
          );
          telegramSent = true;
          await db
            .prepare(
              "UPDATE notifications SET telegram_sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
            )
            .bind(id)
            .run();
        } catch (err) {
          await logSystemEvent(db, {
            level: 'warn',
            category: 'telegram',
            eventName: 'notification.telegram_send_failed',
            message: err instanceof Error ? err.message : 'Telegram notification delivery failed',
            userId: options.userId,
          });
        }
      }
    }

    return { created: true, telegramSent, notificationId: id };
  } catch {
    return { created: false, telegramSent: false };
  }
}
