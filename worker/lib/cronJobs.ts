import type { WorkerBindings } from '../types.ts';
import { createNotificationSafe, logSystemEvent } from './monitoring.ts';

export interface MaintenanceJobSummary {
  expiredNoncesRemoved: number;
  expiredRateLimitsRemoved: number;
  expiredSubscriptionsUpdated: number;
  deadlineRemindersSent: number;
}

export async function runScheduledMaintenance(
  env: WorkerBindings,
  jobName = 'hourly_maintenance'
): Promise<MaintenanceJobSummary> {
  const db = env.DB;
  const startedAt = new Date().toISOString();
  const runId = `cron_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const summary: MaintenanceJobSummary = {
    expiredNoncesRemoved: 0,
    expiredRateLimitsRemoved: 0,
    expiredSubscriptionsUpdated: 0,
    deadlineRemindersSent: 0,
  };

  if (!db) {
    return summary;
  }

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const nowIso = new Date().toISOString();

    const [nonceRes, rlRes, subRes] = await Promise.all([
      db.prepare('DELETE FROM auth_nonces WHERE expires_at <= ?').bind(nowSec).run(),
      db.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(nowSec).run(),
      db
        .prepare(
          "UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND expires_at <= ?"
        )
        .bind(nowIso)
        .run(),
    ]);

    summary.expiredNoncesRemoved = Number(nonceRes.meta.changes ?? 0);
    summary.expiredRateLimitsRemoved = Number(rlRes.meta.changes ?? 0);
    summary.expiredSubscriptionsUpdated = Number(subRes.meta.changes ?? 0);

    // Sync users whose active Pro subscription expired
    await db
      .prepare(
        `UPDATE users
         SET tier = 'free', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE tier = 'pro' AND pro_expires_at IS NOT NULL AND pro_expires_at <= ?`
      )
      .bind(nowIso)
      .run();

    // Opportunity deadline reminders (within next 48 hours, not yet reminded)
    const in48HoursIso = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const dueRows = await db
      .prepare(
        `SELECT
           oa.id AS app_id,
           oa.user_id,
           oa.opportunity_id,
           COALESCE(oa.deadline_at, o.deadline) AS effective_deadline,
           o.title AS opp_title,
           o.organization AS opp_org,
           u.telegram_id
         FROM opportunity_applications oa
         INNER JOIN opportunities o ON o.id = oa.opportunity_id
         INNER JOIN users u ON u.id = oa.user_id
         WHERE oa.status IN ('saved', 'applied', 'interviewing')
           AND oa.reminder_sent_at IS NULL
           AND COALESCE(oa.deadline_at, o.deadline) IS NOT NULL
           AND COALESCE(oa.deadline_at, o.deadline) != ''
           AND COALESCE(oa.deadline_at, o.deadline) >= ?
           AND COALESCE(oa.deadline_at, o.deadline) <= ?
         LIMIT 50`
      )
      .bind(nowIso.slice(0, 10), in48HoursIso)
      .all<{
        app_id: string;
        user_id: string;
        opportunity_id: string;
        effective_deadline: string;
        opp_title: string;
        opp_org: string;
        telegram_id: number;
      }>();

    for (const row of dueRows.results ?? []) {
      const outcome = await createNotificationSafe(db, {
        userId: row.user_id,
        type: 'opportunity',
        title: `Upcoming Deadline: ${row.opp_title}`,
        body: `${row.opp_org} deadline is ${row.effective_deadline}. Review your application checklist in Opportunities Tracker.`,
        linkSection: 'opportunities',
        linkRefId: row.opportunity_id,
        dedupeKey: `opp_deadline:${row.opportunity_id}:${row.effective_deadline.slice(0, 10)}`,
        telegramBotToken: env.TELEGRAM_BOT_TOKEN,
        telegramChatId: row.telegram_id,
      });

      await db
        .prepare(
          "UPDATE opportunity_applications SET reminder_sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
        )
        .bind(row.app_id)
        .run();

      if (outcome.created) {
        summary.deadlineRemindersSent += 1;
      }
    }

    const totalProcessed =
      summary.expiredNoncesRemoved +
      summary.expiredRateLimitsRemoved +
      summary.expiredSubscriptionsUpdated +
      summary.deadlineRemindersSent;

    await db
      .prepare(
        `INSERT INTO cron_job_runs (id, job_name, status, processed_count, details_json, started_at, finished_at)
         VALUES (?, ?, 'success', ?, ?, ?, ?)`
      )
      .bind(
        runId,
        jobName,
        totalProcessed,
        JSON.stringify(summary),
        startedAt,
        new Date().toISOString()
      )
      .run();

    return summary;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Scheduled maintenance failed.';
    await logSystemEvent(db, {
      level: 'error',
      category: 'cron',
      eventName: `cron.${jobName}.failed`,
      message: errMsg,
    });
    try {
      await db
        .prepare(
          `INSERT INTO cron_job_runs (id, job_name, status, processed_count, error_message, started_at, finished_at)
           VALUES (?, ?, 'error', 0, ?, ?, ?)`
        )
        .bind(runId, jobName, errMsg.slice(0, 300), startedAt, new Date().toISOString())
        .run();
    } catch {
      // Ignore secondary logging failure
    }
    throw err;
  }
}
