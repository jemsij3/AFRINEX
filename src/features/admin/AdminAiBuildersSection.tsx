import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Search, TriangleAlert } from 'lucide-react';
import type {
  AdminAiControlResponse,
  AdminBuildersResponse,
  BuilderType,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { BUILDER_TYPE_LABELS, formatShortDateTime } from './AdminShared.tsx';

interface AdminSectionProps {
  token: string | null;
  onConfigChanged?: () => void;
}

const ALL_BUILDER_TYPES: BuilderType[] = [
  'telegram_bot',
  'ai_agent',
  'website',
  'mini_app',
  'workflow',
];

// F. AI Assistant Management
export function AdminAiSection({ token, onConfigChanged }: AdminSectionProps) {
  const [data, setData] = useState<AdminAiControlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiFreeDailyLimit, setAiFreeDailyLimit] = useState('20');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');

  const loadAi = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<AdminAiControlResponse>('/api/admin/ai', undefined, token);
    if (res.ok && res.data) {
      setData(res.data);
      setAiEnabled(res.data.config.aiEnabled);
      setAiFreeDailyLimit(String(res.data.config.aiFreeDailyLimit));
      setAiSystemPrompt(res.data.config.aiSystemPrompt);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadAi();
  }, [loadAi]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const parsedLimit = Number(aiFreeDailyLimit.trim());
    if (!aiFreeDailyLimit.trim() || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      setFeedback('Enter a whole number between 1 and 1000 for Free Tier Daily Request Limit.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    const res = await apiFetch(
      '/api/admin/ai/config',
      {
        method: 'PUT',
        body: JSON.stringify({ aiEnabled, aiFreeDailyLimit: parsedLimit, aiSystemPrompt }),
      },
      token
    );
    if (res.ok) {
      setFeedback('Workers AI configuration updated.');
      onConfigChanged?.();
      await loadAi();
    } else {
      setFeedback(res.error ?? 'Failed to update AI settings.');
    }
    setSaving(false);
  };

  if (loading && !data) {
    return <p className="text-sm text-[var(--afrinex-muted)]">Loading Workers AI metrics...</p>;
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      {data && (
        <>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 text-sm">
              <Cpu className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
              <div>
                <p className="font-semibold">Cloudflare Workers AI Model</p>
                <p className="font-mono text-xs text-[var(--afrinex-muted)]">{data.model}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {data.workersAiBound ? (
                <span className="inline-flex items-center gap-1 text-[var(--afrinex-accent)] font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Workers AI Binding Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <TriangleAlert className="h-4 w-4" />
                  Binding Not Detected
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5">
              <p className="text-[11px] text-[var(--afrinex-muted)]">Total Messages</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">
                {data.stats.totalMessages}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5">
              <p className="text-[11px] text-[var(--afrinex-muted)]">Conversations</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">
                {data.stats.totalConversations}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5">
              <p className="text-[11px] text-[var(--afrinex-muted)]">Active AI Users</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">
                {data.stats.activeUsers}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5">
              <p className="text-[11px] text-[var(--afrinex-muted)]">Daily Average</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">
                {data.stats.dailyAverage}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5">
              <p className="text-[11px] text-[var(--afrinex-muted)]">Requests (24h)</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">
                {data.stats.requests24h}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5">
              <p className="text-[11px] text-[var(--afrinex-muted)]">Errors (24h / Total)</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">
                {data.stats.errors24h} / {data.stats.errorsTotal}
              </p>
            </div>
          </div>
        </>
      )}

      <form
        onSubmit={(e) => void handleSave(e)}
        className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold">AI Assistant Policy & Quota</h3>
            <p className="text-xs text-[var(--afrinex-muted)]">
              Applies immediately to Cloudflare Workers AI chat requests. Private member chats are
              not exposed to administrators.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            AI Assistant Enabled
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--afrinex-muted)]">
              Free Tier Daily Request Limit
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="20"
              value={aiFreeDailyLimit}
              onChange={(e) => setAiFreeDailyLimit(e.target.value.replace(/\D/g, ''))}
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--afrinex-muted)]">
            Base System Prompt
          </label>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={aiSystemPrompt}
            onChange={(e) => setAiSystemPrompt(e.target.value)}
            className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[42px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
        >
          {saving ? 'Saving AI Settings...' : 'Save AI Settings'}
        </button>
      </form>

      {/* Aggregate Workers AI Error Log */}
      {data && (
        <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
          <h3 className="font-display text-sm font-semibold">Recent AI Runtime Errors</h3>
          {data.stats.recentErrors.length === 0 ? (
            <p className="text-xs text-[var(--afrinex-muted)]">
              No Workers AI errors recorded.
            </p>
          ) : (
            <div className="divide-y divide-[var(--afrinex-border)]">
              {data.stats.recentErrors.map((err) => (
                <div
                  key={err.id}
                  className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[var(--afrinex-muted)]">{err.model}</span>
                    <p className="text-red-600 dark:text-red-400 break-words">
                      {err.errorMessage || 'Workers AI execution error'}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums shrink-0">
                    {formatShortDateTime(err.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// G. AI Builders Management
export function AdminBuildersSection({ token, onConfigChanged }: AdminSectionProps) {
  const [data, setData] = useState<AdminBuildersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [buildersEnabled, setBuildersEnabled] = useState(true);
  const [enabledBuilderTypes, setEnabledBuilderTypes] = useState<BuilderType[]>(ALL_BUILDER_TYPES);
  const [builderDailyLimit, setBuilderDailyLimit] = useState('10');

  const loadBuilders = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (search.trim()) params.set('q', search.trim());

    const res = await apiFetch<AdminBuildersResponse>(
      `/api/admin/builders?${params.toString()}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setData(res.data);
      setBuildersEnabled(res.data.config.buildersEnabled);
      setEnabledBuilderTypes(res.data.config.enabledBuilderTypes);
      setBuilderDailyLimit(String(res.data.config.builderDailyLimit));
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token, page, typeFilter, search]);

  useEffect(() => {
    void loadBuilders();
  }, [loadBuilders]);

  const toggleBuilderType = (type: BuilderType) => {
    setEnabledBuilderTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const parsedLimit = Number(builderDailyLimit.trim());
    if (!builderDailyLimit.trim() || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      setFeedback('Enter a whole number between 1 and 500 for Free Tier Daily Project Limit.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    const res = await apiFetch(
      '/api/admin/builders/config',
      {
        method: 'PUT',
        body: JSON.stringify({ buildersEnabled, enabledBuilderTypes, builderDailyLimit: parsedLimit }),
      },
      token
    );
    if (res.ok) {
      setFeedback('Builder settings saved.');
      onConfigChanged?.();
      await loadBuilders();
    } else {
      setFeedback(res.error ?? 'Failed to save builder configuration.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      {/* Builder Configuration */}
      <form
        onSubmit={(e) => void handleSaveConfig(e)}
        className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-sm font-semibold">AI Builders Availability & Types</h3>
            <p className="text-xs text-[var(--afrinex-muted)]">
              Generates Cloudflare architecture blueprints and exportable starter source code.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={buildersEnabled}
              onChange={(e) => setBuildersEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            AI Builders Enabled
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--afrinex-muted)]">Enabled Builder Types</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ALL_BUILDER_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledBuilderTypes.includes(type)}
                    onChange={() => toggleBuilderType(type)}
                    className="h-4 w-4 accent-[var(--afrinex-accent)]"
                  />
                  {BUILDER_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--afrinex-muted)]">
              Free Tier Daily Project Limit
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="10"
              value={builderDailyLimit}
              onChange={(e) => setBuilderDailyLimit(e.target.value.replace(/\D/g, ''))}
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm tabular-nums"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[42px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Builder Settings'}
        </button>
      </form>

      {/* Builder Projects Table */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_190px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search projects, prompts, or owners..."
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => {
              setPage(1);
              setTypeFilter(e.target.value);
            }}
            className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All Builder Types</option>
            {ALL_BUILDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {BUILDER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {loading && !data ? (
          <p className="text-sm text-[var(--afrinex-muted)]">Loading builder projects...</p>
        ) : !data || data.projects.length === 0 ? (
          <p className="text-sm text-[var(--afrinex-muted)]">No builder projects found.</p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
              {data.projects.map((proj) => (
                <div
                  key={proj.id}
                  className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold">{proj.name}</p>
                    <p className="text-xs text-[var(--afrinex-muted)]">
                      {BUILDER_TYPE_LABELS[proj.builderType]} · Owner:{' '}
                      {proj.firstName}
                      {proj.username ? ` (@${proj.username})` : ''} · ID {proj.telegramId}
                    </p>
                    <p className="text-xs text-[var(--afrinex-muted)] line-clamp-2">{proj.prompt}</p>
                  </div>
                  <div className="text-left sm:text-right text-xs text-[var(--afrinex-muted)] shrink-0">
                    <p className="font-mono uppercase text-[var(--afrinex-text)]">{proj.status}</p>
                    <p className="font-mono text-[11px] tabular-nums">
                      {formatShortDateTime(proj.updatedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {data.total_pages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= data.total_pages}
                  onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
