import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Clock,
  HelpCircle,
  Play,
  RefreshCw,
  Send,
} from 'lucide-react';
import type {
  AdminMonitoringResponse,
  SupportTicket,
  SupportTicketStatus,
  SystemLogCategory,
  SystemLogLevel,
} from '../../../shared/types.ts';
import {
  EmptyState,
  ErrorBanner,
  PaginationBar,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { formatShortDateTime } from './AdminShared.tsx';

export function AdminMonitoringSection({ token }: { token: string | null }) {
  const { showToast } = useToast();
  const [data, setData] = useState<AdminMonitoringResponse | null>(null);
  const [level, setLevel] = useState<'all' | SystemLogLevel>('all');
  const [category, setCategory] = useState<'all' | SystemLogCategory>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [runningCron, setRunningCron] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadMonitoring = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (level !== 'all') params.set('level', level);
    if (category !== 'all') params.set('category', category);
    const q = params.toString() ? `?${params.toString()}` : '';
    const res = await apiFetch<AdminMonitoringResponse>(
      `/api/admin/monitoring${q}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? 'Could not load monitoring telemetry.');
    }
    setLoading(false);
  }, [token, level, category]);

  useEffect(() => {
    void loadMonitoring();
  }, [loadMonitoring]);

  const handleRunCron = async () => {
    if (!token || runningCron) return;
    setRunningCron(true);
    const res = await apiFetch<{
      ok: boolean;
      summary: {
        expiredNoncesRemoved: number;
        expiredRateLimitsRemoved: number;
        expiredSubscriptionsUpdated: number;
        deadlineRemindersSent: number;
      };
    }>('/api/admin/monitoring/run-cron', { method: 'POST' }, token);
    setRunningCron(false);

    if (res.ok && res.data?.summary) {
      const s = res.data.summary;
      showToast(
        `Maintenance complete: ${s.expiredSubscriptionsUpdated} expired subs synced, ${s.deadlineRemindersSent} reminders sent, ${s.expiredNoncesRemoved + s.expiredRateLimitsRemoved} stale rows pruned.`,
        'success'
      );
      await loadMonitoring();
    } else {
      showToast(res.error ?? 'Failed to execute maintenance job.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter logs by severity"
            value={level}
            onChange={(e) => setLevel(e.target.value as 'all' | SystemLogLevel)}
            className="min-h-[38px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>

          <select
            aria-label="Filter logs by category"
            value={category}
            onChange={(e) => setCategory(e.target.value as 'all' | SystemLogCategory)}
            className="min-h-[38px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All Categories</option>
            <option value="api">API</option>
            <option value="ai">Workers AI</option>
            <option value="telegram">Telegram</option>
            <option value="payment">Payments</option>
            <option value="database">Database</option>
            <option value="cron">Cron Jobs</option>
            <option value="integration">Integrations</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={runningCron}
            onClick={() => void handleRunCron()}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {runningCron ? 'Running Jobs...' : 'Run Maintenance Now'}
          </button>
          <button
            type="button"
            onClick={() => void loadMonitoring()}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {data?.summary && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3">
            <dt className="text-[11px] text-[var(--afrinex-muted)]">24h Errors</dt>
            <dd className="mt-0.5 font-display text-xl font-bold tabular-nums text-amber-500">
              {data.summary.errors24h}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3">
            <dt className="text-[11px] text-[var(--afrinex-muted)]">24h Warnings</dt>
            <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
              {data.summary.warnings24h}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3">
            <dt className="text-[11px] text-[var(--afrinex-muted)]">Slow API (&ge;1.5s)</dt>
            <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
              {data.summary.slowRequests24h}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3">
            <dt className="text-[11px] text-[var(--afrinex-muted)]">AI Errors (24h)</dt>
            <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
              {data.summary.aiErrors24h}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3">
            <dt className="text-[11px] text-[var(--afrinex-muted)]">Payment Errors</dt>
            <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
              {data.summary.paymentErrors24h}
            </dd>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3">
            <dt className="text-[11px] text-[var(--afrinex-muted)]">Telegram Errors</dt>
            <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
              {data.summary.telegramErrors24h}
            </dd>
          </div>
        </dl>
      )}

      {error && <ErrorBanner message={error} onRetry={() => void loadMonitoring()} />}

      {loading && !data ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Scrubbed System Logs */}
          <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
            <h2 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-[var(--afrinex-accent)]" />
              Platform Event Logs (Scrubbed)
            </h2>
            {!data || data.logs.length === 0 ? (
              <EmptyState
                title="No matching system logs"
                description="No errors, warnings, or slow-request alerts have been recorded for this filter."
              />
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] max-h-[420px] overflow-y-auto pr-1">
                {data.logs.map((log) => (
                  <div key={log.id} className="py-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">
                        <span
                          className={`uppercase mr-1.5 ${
                            log.level === 'error'
                              ? 'text-red-500'
                              : log.level === 'warn'
                                ? 'text-amber-500'
                                : 'text-[var(--afrinex-accent)]'
                          }`}
                        >
                          [{log.level}]
                        </span>
                        {log.category} · {log.eventName}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--afrinex-muted)] tabular-nums shrink-0">
                        {formatShortDateTime(log.createdAt)}
                      </span>
                    </div>
                    <p className="text-[var(--afrinex-muted)] break-words">{log.message}</p>
                    {(log.requestPath || log.durationMs !== null) && (
                      <p className="font-mono text-[10px] text-[var(--afrinex-muted)]">
                        {log.requestPath ?? ''}
                        {log.statusCode ? ` (${log.statusCode})` : ''}
                        {log.durationMs !== null ? ` · ${log.durationMs}ms` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cron Job Runs */}
          <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
            <h2 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-[var(--afrinex-accent)]" />
              Scheduled Cron Runs
            </h2>
            {!data || data.cronRuns.length === 0 ? (
              <EmptyState
                title="No cron runs recorded yet"
                description="Hourly Cloudflare scheduled jobs or manual maintenance runs appear here."
              />
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] max-h-[420px] overflow-y-auto pr-1">
                {data.cronRuns.map((run) => (
                  <div key={run.id} className="py-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">
                        {run.jobName} ·{' '}
                        <span
                          className={
                            run.status === 'success' ? 'text-emerald-500' : 'text-red-500'
                          }
                        >
                          {run.status}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-[var(--afrinex-muted)] tabular-nums">
                        {formatShortDateTime(run.finishedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--afrinex-muted)]">
                      Processed {run.processedCount} item(s) · {run.detailsJson}
                    </p>
                    {run.errorMessage && (
                      <p className="text-[11px] text-red-500">{run.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminSupportSection({ token }: { token: string | null }) {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<
    Record<string, { status: SupportTicketStatus; adminReply: string }>
  >({});

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    params.set('page', String(page));
    params.set('per_page', '15');

    const res = await apiFetch<{
      tickets: SupportTicket[];
      page: number;
      total: number;
      total_pages: number;
    }>(`/api/admin/support/tickets?${params.toString()}`, undefined, token);

    if (res.ok && res.data) {
      setTickets(res.data.tickets);
      setTotal(res.data.total);
      setTotalPages(res.data.total_pages);
      const nextDrafts: Record<string, { status: SupportTicketStatus; adminReply: string }> = {};
      for (const t of res.data.tickets) {
        nextDrafts[t.id] = {
          status: t.status,
          adminReply: t.adminReply ?? '',
        };
      }
      setReplyDrafts(nextDrafts);
    } else {
      setError(res.error ?? 'Failed to load support tickets.');
    }
    setLoading(false);
  }, [token, statusFilter, page]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const handleSaveReply = async (ticketId: string) => {
    if (!token || busyId) return;
    const draft = replyDrafts[ticketId];
    if (!draft) return;
    setBusyId(ticketId);
    const res = await apiFetch<{ ticket: SupportTicket }>(
      `/api/admin/support/tickets/${ticketId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: draft.status,
          adminReply: draft.adminReply.trim(),
        }),
      },
      token
    );
    setBusyId(null);

    if (res.ok && res.data) {
      showToast('Ticket response sent and member notified.', 'success');
      await loadTickets();
    } else {
      showToast(res.error ?? 'Failed to update support ticket.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-[var(--afrinex-accent)]" />
          <select
            aria-label="Filter support tickets by status"
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value as 'all' | SupportTicketStatus);
            }}
            className="min-h-[38px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => void loadTickets()}
          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadTickets()} />}

      {loading && tickets.length === 0 ? (
        <SkeletonList rows={3} />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No support tickets found"
          description="Member requests submitted from the Help & Support Center will appear here for triage."
        />
      ) : (
        <>
          <div className="space-y-3">
            {tickets.map((t) => {
              const draft = replyDrafts[t.id] ?? {
                status: t.status,
                adminReply: t.adminReply ?? '',
              };
              return (
                <article
                  key={t.id}
                  className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-[11px] text-[var(--afrinex-muted)]">
                        {t.firstName ?? 'Member'}
                        {t.username ? ` (@${t.username})` : ''} · Category:{' '}
                        <span className="capitalize">{t.category}</span>
                      </p>
                      <h3 className="font-display text-sm font-semibold">{t.subject}</h3>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                      {formatShortDateTime(t.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--afrinex-muted)] whitespace-pre-wrap">
                    {t.message}
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end pt-2 border-t border-[var(--afrinex-border)]">
                    <div className="sm:w-44 space-y-1">
                      <label className="block text-[11px] text-[var(--afrinex-muted)]">
                        Ticket Status
                      </label>
                      <select
                        value={draft.status}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [t.id]: {
                              ...draft,
                              status: e.target.value as SupportTicketStatus,
                            },
                          }))
                        }
                        className="min-h-[38px] w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-2.5 text-xs"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="block text-[11px] text-[var(--afrinex-muted)]">
                        Admin Reply (visible to member)
                      </label>
                      <input
                        value={draft.adminReply}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({
                            ...prev,
                            [t.id]: { ...draft, adminReply: e.target.value },
                          }))
                        }
                        placeholder="Write response to member..."
                        className="min-h-[38px] w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => void handleSaveReply(t.id)}
                      className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {busyId === t.id ? 'Sending...' : 'Update & Notify'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
