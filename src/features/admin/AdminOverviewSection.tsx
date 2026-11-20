import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AdminOverviewResponse } from '../../../shared/types.ts';
import { BUILDER_TYPE_LABELS, formatShortDateTime } from './AdminShared.tsx';

interface AdminOverviewSectionProps {
  overview: AdminOverviewResponse | null;
  loading: boolean;
  onSelectTab: (tab: string) => void;
}

export function AdminOverviewSection({
  overview,
  loading,
  onSelectTab,
}: AdminOverviewSectionProps) {
  if (loading && !overview) {
    return <p className="text-sm text-[var(--afrinex-muted)]">Loading platform overview...</p>;
  }

  if (!overview) {
    return (
      <p className="text-sm text-[var(--afrinex-muted)]">
        Overview metrics are currently unavailable.
      </p>
    );
  }

  const m = overview.metrics;
  const cfg = overview.adminConfigStatus;

  const primaryKpis = [
    { label: 'Total Users', value: overview.counts.users, hint: `+${m?.newUsers7d ?? 0} (7d) · +${m?.newUsers30d ?? 0} (30d)` },
    { label: 'Active Users (24h / 7d)', value: `${m?.activeUsers24h ?? 0} / ${m?.activeUsers7d ?? 0}`, hint: `${m?.activeUsers30d ?? 0} active in 30d` },
    { label: 'Published Courses', value: `${m?.publishedCourses ?? 0} / ${overview.counts.courses}`, hint: `${m?.publishedLessons ?? 0} of ${overview.counts.lessons} lessons published` },
    { label: 'AI Requests', value: m?.aiRequestsTotal ?? 0, hint: `${m?.aiRequestsToday ?? 0} today · ${m?.aiErrorsTotal ?? 0} errors logged` },
    { label: 'Builder Projects', value: overview.counts.builderProjects, hint: `${overview.counts.aiTools} tools · ${overview.counts.opportunities} opportunities` },
    { label: 'Active Pro / Stars Revenue', value: `${m?.activeProSubscriptions ?? 0} Pro · ${m?.completedRevenue ?? 0} XTR`, hint: `${m?.pendingPayments ?? 0} pending · ${m?.failedPayments ?? 0} failed · ${m?.refundedPayments ?? 0} refunded` },
  ];

  const expansionKpis = [
    {
      label: 'Tracked Opportunities',
      value: m?.trackedOpportunitiesTotal ?? 0,
      hint: `${m?.upcomingDeadlines7d ?? 0} deadlines in next 7 days`,
    },
    {
      label: 'Enrollments & Certificates',
      value: `${m?.courseEnrollmentsTotal ?? 0} / ${m?.certificatesIssuedTotal ?? 0}`,
      hint: `${m?.bookmarksTotal ?? 0} bookmarks saved`,
    },
    {
      label: 'Integrations & Notifications',
      value: `${m?.integrationsTotal ?? 0} / ${m?.notificationsSentTotal ?? 0}`,
      hint: 'Encrypted credentials / delivered alerts',
    },
    {
      label: 'Open Support & 24h Errors',
      value: `${m?.openSupportTickets ?? 0} / ${m?.systemErrors24h ?? 0}`,
      hint: `${m?.slowRequests24h ?? 0} slow requests (>=1500ms) in 24h`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Platform Environment Health & Admin ID Diagnostic */}
      {cfg && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div
            className={`rounded-xl border p-3.5 flex items-start gap-2.5 text-xs ${
              cfg.adminIdsConfigured
                ? 'border-[var(--afrinex-border)] bg-[var(--afrinex-bg)]'
                : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            {cfg.adminIdsConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">ADMIN_TELEGRAM_IDS</p>
              <p className="text-[var(--afrinex-muted)] mt-0.5">
                {cfg.adminIdsConfigured
                  ? 'Configured with numeric Owner Telegram ID(s).'
                  : 'Missing or invalid numeric IDs in Worker environment.'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 flex items-start gap-2.5 text-xs">
            {cfg.telegramBotConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">Telegram Bot Token</p>
              <p className="text-[var(--afrinex-muted)] mt-0.5">
                {cfg.telegramBotConfigured
                  ? 'Verified for auth, Stars invoices, and announcements.'
                  : 'Not configured; Bot broadcasts and Stars invoices disabled.'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 flex items-start gap-2.5 text-xs">
            {cfg.workersAiBound ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">Cloudflare Workers AI</p>
              <p className="text-[var(--afrinex-muted)] mt-0.5">
                {cfg.workersAiBound
                  ? 'AI binding active on Worker runtime.'
                  : 'AI binding unavailable in current runtime.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {primaryKpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-1.5"
          >
            <p className="text-xs text-[var(--afrinex-muted)]">{kpi.label}</p>
            <p className="font-display text-xl font-bold tabular-nums">{kpi.value}</p>
            <p className="text-[11px] text-[var(--afrinex-muted)] tabular-nums">{kpi.hint}</p>
          </div>
        ))}
      </div>

      {/* Phase 5 Platform Engagement & Operational Telemetry */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">
            Engagement, Support & Telemetry
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => onSelectTab('monitoring')}
              className="font-medium text-[var(--afrinex-accent)] hover:underline"
            >
              Open Monitoring
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('support')}
              className="font-medium text-[var(--afrinex-accent)] hover:underline"
            >
              Manage Support
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {expansionKpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-1.5"
            >
              <p className="text-xs text-[var(--afrinex-muted)]">{kpi.label}</p>
              <p className="font-display text-xl font-bold tabular-nums">{kpi.value}</p>
              <p className="text-[11px] text-[var(--afrinex-muted)] tabular-nums">{kpi.hint}</p>
            </div>
          ))}
        </div>

        {m?.metricClassification && (
          <p className="text-[11px] text-[var(--afrinex-muted)]">
            Metrics Source: {m.metricClassification.notes}
          </p>
        )}
      </div>

      {/* Role Summary + Builder Type Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Account & Access Distribution</h3>
            <button
              type="button"
              onClick={() => onSelectTab('users')}
              className="text-xs font-medium text-[var(--afrinex-accent)] hover:underline"
            >
              Manage Users
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
              <p className="font-display text-lg font-bold tabular-nums">{m?.ownerCount ?? 0}</p>
              <p className="text-[11px] text-[var(--afrinex-muted)]">Owners</p>
            </div>
            <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
              <p className="font-display text-lg font-bold tabular-nums">{m?.adminCount ?? 0}</p>
              <p className="text-[11px] text-[var(--afrinex-muted)]">Delegated Admins</p>
            </div>
            <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
              <p className="font-display text-lg font-bold tabular-nums">{m?.suspendedCount ?? 0}</p>
              <p className="text-[11px] text-[var(--afrinex-muted)]">Suspended</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Builder Projects by Type</h3>
            <button
              type="button"
              onClick={() => onSelectTab('builders')}
              className="text-xs font-medium text-[var(--afrinex-accent)] hover:underline"
            >
              Inspect Builders
            </button>
          </div>
          {!m?.builderBreakdown || m.builderBreakdown.length === 0 ? (
            <p className="text-xs text-[var(--afrinex-muted)]">No builder projects created yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {m.builderBreakdown.map((item) => (
                <div
                  key={item.builderType}
                  className="rounded-lg border border-[var(--afrinex-border)] px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">{BUILDER_TYPE_LABELS[item.builderType]}</span>
                  <span className="font-mono font-semibold tabular-nums">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Administrative Activity */}
      <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Recent Administrative Activity</h3>
          <button
            type="button"
            onClick={() => onSelectTab('roles-audit')}
            className="text-xs font-medium text-[var(--afrinex-accent)] hover:underline"
          >
            View All Audit Logs
          </button>
        </div>

        {overview.recentAuditLogs.length === 0 ? (
          <p className="text-xs text-[var(--afrinex-muted)]">No administrative actions recorded yet.</p>
        ) : (
          <div className="divide-y divide-[var(--afrinex-border)]">
            {overview.recentAuditLogs.slice(0, 12).map((entry) => (
              <div
                key={entry.id}
                className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono font-medium">{entry.action}</span>
                  <span className="text-[var(--afrinex-muted)]">
                    {' · '}
                    {entry.actorName || 'System'}
                    {entry.actorUsername ? ` (@${entry.actorUsername})` : ''}
                    {entry.targetType ? ` → ${entry.targetType}` : ''}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums shrink-0">
                  {formatShortDateTime(entry.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
