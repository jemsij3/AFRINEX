import { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Send, Trash2 } from 'lucide-react';
import type {
  AdminPaginatedAuditLogsResponse,
  AnnouncementAudience,
  AnnouncementRecord,
  AppSettingsConfig,
  BuilderType,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import {
  ConfirmDialog,
  PERMISSION_METADATA,
  formatShortDateTime,
} from './AdminShared.tsx';

interface TokenProps {
  token: string | null;
}

// I. Announcements & Notifications
export function AdminAnnouncementsSection({ token }: TokenProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [published, setPublished] = useState(true);

  const [sendTarget, setSendTarget] = useState<AnnouncementRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRecord | null>(null);

  const loadAnnouncements = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ announcements: AnnouncementRecord[] }>(
      '/api/admin/announcements',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setAnnouncements(res.data.announcements);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setAudience('all');
    setPublished(true);
  };

  const startEdit = (ann: AnnouncementRecord) => {
    setEditingId(ann.id);
    setTitle(ann.title);
    setBody(ann.body);
    setAudience(ann.audience);
    setPublished(ann.published);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setFeedback(null);

    const payload = { title, body, audience, published };
    const res = editingId
      ? await apiFetch(
          `/api/admin/announcements/${editingId}`,
          { method: 'PUT', body: JSON.stringify(payload) },
          token
        )
      : await apiFetch(
          '/api/admin/announcements',
          { method: 'POST', body: JSON.stringify(payload) },
          token
        );

    if (res.ok) {
      setFeedback(editingId ? 'Announcement updated.' : 'Announcement saved.');
      resetForm();
      await loadAnnouncements();
    } else {
      setFeedback(res.error ?? 'Failed to save announcement.');
    }
    setBusy(false);
  };

  const togglePublish = async (ann: AnnouncementRecord) => {
    if (!token) return;
    const res = await apiFetch(
      `/api/admin/announcements/${ann.id}/publish`,
      { method: 'PATCH', body: JSON.stringify({ published: !ann.published }) },
      token
    );
    if (res.ok) {
      await loadAnnouncements();
    }
  };

  const confirmTelegramSend = async () => {
    if (!token || !sendTarget) return;
    setBusy(true);
    const res = await apiFetch<{
      attempted: number;
      sentCount: number;
      failedCount: number;
      deliveryStatus: string;
    }>(`/api/admin/announcements/${sendTarget.id}/send-telegram`, { method: 'POST' }, token);

    if (res.ok && res.data) {
      setFeedback(
        `Telegram delivery (${res.data.deliveryStatus}): sent ${res.data.sentCount} of ${res.data.attempted} (${res.data.failedCount} failed).`
      );
      setSendTarget(null);
      await loadAnnouncements();
    } else {
      setFeedback(res.error ?? 'Failed to broadcast announcement via Telegram.');
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusy(true);
    const res = await apiFetch(
      `/api/admin/announcements/${deleteTarget.id}`,
      { method: 'DELETE' },
      token
    );
    if (res.ok) {
      setDeleteTarget(null);
      await loadAnnouncements();
    } else {
      setFeedback(res.error ?? 'Failed to delete announcement.');
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      <form
        onSubmit={(e) => void handleSave(e)}
        className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">
            {editingId ? 'Edit Announcement' : 'Create Announcement'}
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-[var(--afrinex-muted)]"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <input
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement headline"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          >
            <option value="all">All Users</option>
            <option value="free">Free Members Only</option>
            <option value="pro">Pro Members Only</option>
          </select>
        </div>

        <textarea
          required
          minLength={5}
          maxLength={2000}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message visible on user dashboards and optionally sent via Telegram Bot..."
          className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 text-sm"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            Publish in Member Dashboard
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {editingId ? 'Save Changes' : 'Save Announcement'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-[var(--afrinex-muted)]">Loading announcements...</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-[var(--afrinex-muted)]">No announcements created yet.</p>
      ) : (
        <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">{ann.title}</p>
                <p className="text-xs text-[var(--afrinex-muted)]">{ann.body}</p>
                <p className="font-mono text-[11px] text-[var(--afrinex-muted)] uppercase">
                  Audience: {ann.audience} · {ann.published ? 'Published' : 'Draft'} · Status:{' '}
                  {ann.deliveryStatus}
                  {ann.sentAt
                    ? ` (${ann.deliveryCount} delivered · ${formatShortDateTime(ann.sentAt)})`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSendTarget(ann)}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-accent)]/50 px-3 text-xs font-medium text-[var(--afrinex-accent)]"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send via Bot
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(ann)}
                  className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void togglePublish(ann)}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  {ann.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(ann)}
                  aria-label={`Delete ${ann.title}`}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(sendTarget)}
        title="Send Announcement via Telegram Bot?"
        description={`This will immediately broadcast "${sendTarget?.title ?? ''}" to active ${sendTarget?.audience ?? 'all'} users via the configured Telegram Bot.`}
        confirmLabel="Confirm & Send Broadcast"
        busy={busy}
        onConfirm={() => void confirmTelegramSend()}
        onCancel={() => setSendTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Announcement?"
        description={`Permanently delete "${deleteTarget?.title ?? ''}"?`}
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// J. App Configuration Settings
export function AdminSettingsSection({
  token,
  onSettingsUpdated,
}: {
  token: string | null;
  onSettingsUpdated: () => void;
}) {
  const [settings, setSettings] = useState<AppSettingsConfig | null>(null);
  const [numericDrafts, setNumericDrafts] = useState({
    aiFreeDailyLimit: '20',
    builderDailyLimit: '10',
    proMonthlyStars: '150',
    proYearlyStars: '1500',
  });
  const [envStatus, setEnvStatus] = useState<{
    adminIdsConfigured: boolean;
    telegramBotConfigured: boolean;
    workersAiBound: boolean;
    workersAiModel: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const syncNumericDrafts = (cfg: AppSettingsConfig) => {
    setNumericDrafts({
      aiFreeDailyLimit: String(cfg.aiFreeDailyLimit),
      builderDailyLimit: String(cfg.builderDailyLimit),
      proMonthlyStars: String(cfg.proMonthlyStars),
      proYearlyStars: String(cfg.proYearlyStars),
    });
  };

  const loadSettings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{
      settings: AppSettingsConfig;
      environmentStatus: {
        adminIdsConfigured: boolean;
        telegramBotConfigured: boolean;
        workersAiBound: boolean;
        workersAiModel: string;
      };
    }>('/api/admin/settings', undefined, token);
    if (res.ok && res.data) {
      setSettings(res.data.settings);
      syncNumericDrafts(res.data.settings);
      setEnvStatus(res.data.environmentStatus);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !settings) return;

    const specs: Array<{
      key: keyof typeof numericDrafts;
      label: string;
      min: number;
      max: number;
    }> = [
      { key: 'aiFreeDailyLimit', label: 'AI Free Daily Limit', min: 1, max: 1000 },
      { key: 'builderDailyLimit', label: 'Builder Daily Limit', min: 1, max: 500 },
      { key: 'proMonthlyStars', label: 'Pro Monthly (XTR)', min: 1, max: 50000 },
      { key: 'proYearlyStars', label: 'Pro Yearly (XTR)', min: 1, max: 250000 },
    ];

    const parsedNumbers: Partial<AppSettingsConfig> = {};
    for (const spec of specs) {
      const raw = numericDrafts[spec.key].trim();
      const num = Number(raw);
      if (!raw || !Number.isInteger(num) || num < spec.min || num > spec.max) {
        setFeedback(`Enter a whole number between ${spec.min} and ${spec.max} for ${spec.label}.`);
        return;
      }
      parsedNumbers[spec.key] = num;
    }

    const payload: AppSettingsConfig = {
      ...settings,
      ...parsedNumbers,
    };

    setSaving(true);
    setFeedback(null);
    const res = await apiFetch<{ settings: AppSettingsConfig }>(
      '/api/admin/settings',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      token
    );
    if (res.ok && res.data) {
      setSettings(res.data.settings);
      syncNumericDrafts(res.data.settings);
      setFeedback('Platform configuration saved and active across AFRINEX.');
      onSettingsUpdated();
    } else {
      setFeedback(res.error ?? 'Failed to save configuration.');
    }
    setSaving(false);
  };

  if (loading || !settings) {
    return <p className="text-sm text-[var(--afrinex-muted)]">Loading platform settings...</p>;
  }

  const toggleBuilderType = (type: BuilderType) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const exists = prev.enabledBuilderTypes.includes(type);
      return {
        ...prev,
        enabledBuilderTypes: exists
          ? prev.enabledBuilderTypes.filter((t) => t !== type)
          : [...prev.enabledBuilderTypes, type],
      };
    });
  };

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      {/* Environment Binding Status (No secrets shown) */}
      {envStatus && (
        <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 text-xs space-y-1">
          <p className="font-semibold">Worker Environment Status (Secrets Managed in Cloudflare)</p>
          <p className="text-[var(--afrinex-muted)]">
            ADMIN_TELEGRAM_IDS: {envStatus.adminIdsConfigured ? 'Configured' : 'Missing'} · Bot
            Token: {envStatus.telegramBotConfigured ? 'Configured' : 'Missing'} · Workers AI:{' '}
            {envStatus.workersAiBound ? envStatus.workersAiModel : 'Unavailable'}
          </p>
        </div>
      )}

      {/* Branding */}
      <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
        <h3 className="font-display text-sm font-semibold">Platform Identity</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--afrinex-muted)]">Platform Name</label>
            <input
              required
              value={settings.platformName}
              onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--afrinex-muted)]">Platform Slogan</label>
            <input
              required
              value={settings.platformSlogan}
              onChange={(e) => setSettings({ ...settings, platformSlogan: e.target.value })}
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Maintenance & Registration */}
      <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
        <h3 className="font-display text-sm font-semibold">Access & Maintenance</h3>
        <div className="flex flex-wrap gap-5 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            Maintenance Mode (admins retain full access)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.registrationEnabled}
              onChange={(e) =>
                setSettings({ ...settings, registrationEnabled: e.target.checked })
              }
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            Allow New User Registrations
          </label>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--afrinex-muted)]">Maintenance Banner Message</label>
          <input
            required
            value={settings.maintenanceMessage}
            onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
            className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
          />
        </div>
      </div>

      {/* Module Toggles */}
      <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
        <h3 className="font-display text-sm font-semibold">Platform Feature Toggles</h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          {(
            [
              ['featureAiAssistantEnabled', 'AI Assistant'],
              ['featureBuildersEnabled', 'AI Builders'],
              ['featureLearningEnabled', 'Learning Center'],
              ['featureToolsEnabled', 'AI Tools Directory'],
              ['featureOpportunitiesEnabled', 'Opportunities Hub'],
              ['featureTelegramServicesEnabled', 'Telegram Bots'],
              ['featureSubscriptionsEnabled', 'Telegram Stars Subscriptions'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                className="h-4 w-4 accent-[var(--afrinex-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Quotas & Pro Pricing */}
      <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-4">
        <h3 className="font-display text-sm font-semibold">Quotas & Telegram Stars Pricing</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs text-[var(--afrinex-muted)]">AI Free Daily Limit</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="20"
              value={numericDrafts.aiFreeDailyLimit}
              onChange={(e) =>
                setNumericDrafts((prev) => ({
                  ...prev,
                  aiFreeDailyLimit: e.target.value.replace(/\D/g, ''),
                }))
              }
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--afrinex-muted)]">Builder Daily Limit</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="10"
              value={numericDrafts.builderDailyLimit}
              onChange={(e) =>
                setNumericDrafts((prev) => ({
                  ...prev,
                  builderDailyLimit: e.target.value.replace(/\D/g, ''),
                }))
              }
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--afrinex-muted)]">Pro Monthly (XTR)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="150"
              value={numericDrafts.proMonthlyStars}
              onChange={(e) =>
                setNumericDrafts((prev) => ({
                  ...prev,
                  proMonthlyStars: e.target.value.replace(/\D/g, ''),
                }))
              }
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--afrinex-muted)]">Pro Yearly (XTR)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="1500"
              value={numericDrafts.proYearlyStars}
              onChange={(e) =>
                setNumericDrafts((prev) => ({
                  ...prev,
                  proYearlyStars: e.target.value.replace(/\D/g, ''),
                }))
              }
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs pt-1">
          {(
            ['telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow'] as BuilderType[]
          ).map((bType) => (
            <label key={bType} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabledBuilderTypes.includes(bType)}
                onChange={() => toggleBuilderType(bType)}
                className="h-4 w-4 accent-[var(--afrinex-accent)]"
              />
              {bType.replace('_', ' ')}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
      >
        {saving ? 'Saving Configuration...' : 'Save Platform Configuration'}
      </button>
    </form>
  );
}

// K. Roles, Permissions & Audit Logs
export function AdminRolesAuditSection({ token }: TokenProps) {
  const [logs, setLogs] = useState<AdminPaginatedAuditLogsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAudit = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    if (actionFilter.trim()) params.set('action', actionFilter.trim());
    if (targetTypeFilter.trim()) params.set('target_type', targetTypeFilter.trim());

    const res = await apiFetch<AdminPaginatedAuditLogsResponse>(
      `/api/admin/audit-logs?${params.toString()}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setLogs(res.data);
    }
    setLoading(false);
  }, [token, page, actionFilter, targetTypeFilter]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  return (
    <div className="space-y-6">
      {/* Role Hierarchy Reference */}
      <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3">
        <h3 className="font-display text-sm font-semibold">AFRINEX Access Hierarchy</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 space-y-1">
            <p className="font-semibold text-[var(--afrinex-accent)]">Owner</p>
            <p className="text-[var(--afrinex-muted)]">
              Verified via server-side ADMIN_TELEGRAM_IDS. Full unrestricted access, cannot be
              demoted/suspended, and exclusively delegates Admin roles & permissions.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 space-y-1">
            <p className="font-semibold">Delegated Admin</p>
            <p className="text-[var(--afrinex-muted)]">
              Assigned by the Owner with granular module permissions. Cannot modify roles,
              permissions, or Owner accounts.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 space-y-1">
            <p className="font-semibold">Member</p>
            <p className="text-[var(--afrinex-muted)]">
              Ordinary user with Member Dashboard access only. Zero administrative routes or
              controls exposed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 pt-1">
          {PERMISSION_METADATA.map((perm) => (
            <div
              key={perm.id}
              className="rounded-lg border border-[var(--afrinex-border)] px-2.5 py-2 text-[11px]"
            >
              <p className="font-mono font-semibold">{perm.id}</p>
              <p className="text-[var(--afrinex-muted)] mt-0.5">{perm.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log Filters */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="search"
            value={actionFilter}
            onChange={(e) => {
              setPage(1);
              setActionFilter(e.target.value);
            }}
            placeholder="Filter by action (e.g. admin.update_user)..."
            className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
          />
          <select
            value={targetTypeFilter}
            onChange={(e) => {
              setPage(1);
              setTargetTypeFilter(e.target.value);
            }}
            className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="">All Target Types</option>
            <option value="user">User</option>
            <option value="course">Course</option>
            <option value="lesson">Lesson</option>
            <option value="ai_tool">AI Tool</option>
            <option value="opportunity">Opportunity</option>
            <option value="payment">Payment</option>
            <option value="announcement">Announcement</option>
            <option value="app_settings">App Settings</option>
          </select>
        </div>

        {loading && !logs ? (
          <p className="text-sm text-[var(--afrinex-muted)]">Loading audit logs...</p>
        ) : !logs || logs.audit_logs.length === 0 ? (
          <p className="text-sm text-[var(--afrinex-muted)]">No audit events match your filter.</p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
              {logs.audit_logs.map((entry) => (
                <div key={entry.id} className="p-3.5 space-y-1 text-xs">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{entry.action}</span>
                      <span className="text-[var(--afrinex-muted)]">
                        by {entry.actorName || 'System'}
                        {entry.actorUsername ? ` (@${entry.actorUsername})` : ''}
                        {entry.targetType ? ` → ${entry.targetType}:${entry.targetId ?? ''}` : ''}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums shrink-0">
                      {formatShortDateTime(entry.createdAt)}
                    </span>
                  </div>
                  {entry.metadataJson && entry.metadataJson !== '{}' && (
                    <p className="font-mono text-[11px] text-[var(--afrinex-muted)] break-all">
                      {entry.metadataJson}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {logs.total_pages > 1 && (
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
                  disabled={page >= logs.total_pages}
                  onClick={() => setPage((p) => Math.min(logs.total_pages, p + 1))}
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
