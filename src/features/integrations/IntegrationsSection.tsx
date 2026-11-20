import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Link2,
  Play,
  Plus,
  PowerOff,
  Trash2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type {
  IntegrationProvider,
  IntegrationRecord,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { setTelegramClosingConfirmation } from '../../lib/telegram.ts';

interface IntegrationsSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

const PROVIDER_META: Record<
  IntegrationProvider,
  { label: string; endpointPlaceholder: string; secretLabel: string; hint: string }
> = {
  telegram_bot: {
    label: 'Telegram Bot Credential',
    endpointPlaceholder: 'Optional webhook URL (https://...)',
    secretLabel: 'Bot Token',
    hint: 'Encrypted AES-256-GCM at rest. Tested live against Telegram Bot getMe API.',
  },
  webhook: {
    label: 'Outgoing Webhook',
    endpointPlaceholder: 'https://your-service.example.com/webhook',
    secretLabel: 'Optional Signing / Bearer Secret',
    hint: 'Verifies public HTTPS reachability without allowing private/internal network targets.',
  },
  external_api: {
    label: 'External REST API',
    endpointPlaceholder: 'https://api.example.com/v1/health',
    secretLabel: 'API Key / Bearer Token',
    hint: 'Connects builder workflows and agents to external services using encrypted keys.',
  },
  openai_compatible: {
    label: 'Custom LLM Provider',
    endpointPlaceholder: 'https://api.openai.com/v1',
    secretLabel: 'Provider API Key',
    hint: 'Tests `/models` availability with encrypted key; plaintext keys are never returned.',
  },
  custom: {
    label: 'Custom Connection',
    endpointPlaceholder: 'https://service.example.com/ping',
    secretLabel: 'Secret / Token (optional)',
    hint: 'Reusable encrypted service connector for your builder projects.',
  },
};

export function IntegrationsSection({ onNavigate }: IntegrationsSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [providerFilter, setProviderFilter] = useState<'all' | IntegrationProvider>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [provider, setProvider] = useState<IntegrationProvider>('webhook');
  const [name, setName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<IntegrationRecord | null>(null);

  const isFormDirty = showForm && Boolean(name.trim() || endpointUrl.trim() || secretValue.trim());

  useEffect(() => {
    setTelegramClosingConfirmation(isFormDirty);
    return () => setTelegramClosingConfirmation(false);
  }, [isFormDirty]);

  const loadIntegrations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const query = providerFilter !== 'all' ? `?provider=${providerFilter}` : '';
    const res = await apiFetch<{ integrations: IntegrationRecord[] }>(
      `/api/integrations${query}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setIntegrations(res.data.integrations);
    } else {
      setError(res.error ?? 'Could not load integrations.');
    }
    setLoading(false);
  }, [token, providerFilter]);

  useEffect(() => {
    if (user && token) {
      void loadIntegrations();
    } else {
      setLoading(false);
    }
  }, [user, token, loadIntegrations]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setProvider('webhook');
    setName('');
    setEndpointUrl('');
    setSecretValue('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || saving) return;
    if (name.trim().length < 2) {
      showToast('Enter a connection name (at least 2 characters).', 'error');
      return;
    }

    setSaving(true);
    setError(null);

    const url = editingId ? `/api/integrations/${editingId}` : '/api/integrations';
    const method = editingId ? 'PATCH' : 'POST';
    const bodyPayload: Record<string, unknown> = {
      name: name.trim(),
      endpointUrl: endpointUrl.trim() || '',
    };
    if (!editingId) {
      bodyPayload.provider = provider;
    }
    if (secretValue.trim()) {
      bodyPayload.secretValue = secretValue.trim();
    }

    const res = await apiFetch<{ integration: IntegrationRecord }>(
      url,
      { method, body: JSON.stringify(bodyPayload) },
      token
    );

    setSaving(false);
    if (res.ok) {
      showToast(editingId ? 'Connection updated securely.' : 'Integration connected.', 'success');
      resetForm();
      await loadIntegrations();
    } else {
      setError(res.error ?? 'Could not save integration.');
    }
  };

  const handleTest = async (item: IntegrationRecord) => {
    if (!token || busyId) return;
    setBusyId(item.id);
    const res = await apiFetch<{
      ok: boolean;
      message: string;
      integration: IntegrationRecord | null;
    }>(`/api/integrations/${item.id}/test`, { method: 'POST' }, token);
    setBusyId(null);

    if (res.ok && res.data) {
      if (res.data.integration) {
        setIntegrations((prev) =>
          prev.map((row) => (row.id === item.id ? res.data!.integration! : row))
        );
      }
      showToast(res.data.message, res.data.ok ? 'success' : 'error');
    } else {
      showToast(res.error ?? 'Connection test failed.', 'error');
    }
  };

  const handleDisconnect = async (item: IntegrationRecord) => {
    if (!token || busyId) return;
    setBusyId(item.id);
    const res = await apiFetch<{ integration: IntegrationRecord | null }>(
      `/api/integrations/${item.id}/disconnect`,
      { method: 'POST' },
      token
    );
    setBusyId(null);
    if (res.ok) {
      showToast(`Disconnected "${item.name}".`, 'info');
      await loadIntegrations();
    } else {
      showToast(res.error ?? 'Could not disconnect integration.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await apiFetch(`/api/integrations/${deleteTarget.id}`, { method: 'DELETE' }, token);
    setBusyId(null);
    if (res.ok) {
      showToast(`Deleted "${deleteTarget.name}".`, 'info');
      setDeleteTarget(null);
      await loadIntegrations();
    } else {
      showToast(res.error ?? 'Could not delete integration.', 'error');
    }
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Shared Integrations & Connections
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in with Telegram to store encrypted service credentials and test connections for your bots, AI agents, and workflows.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)]"
        >
          Go to My Account
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              AES-256-GCM Encrypted Credentials
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Integrations & Connections
            </h1>
            <p className="mt-1 text-sm text-[var(--afrinex-muted)]">
              Manage external APIs, webhooks, LLM endpoints, and Telegram credentials reused across your builders. Stored secrets are never exposed after saving.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                setEditingId(null);
                setShowForm(true);
              }
            }}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-sm font-medium text-[var(--afrinex-accent-text)] hover:opacity-90 shrink-0 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            {showForm ? 'Close Form' : 'Add Connection'}
          </button>
        </div>

        {/* Provider filter chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all' as const, label: 'All Providers' },
            { id: 'telegram_bot' as const, label: 'Telegram Bot' },
            { id: 'webhook' as const, label: 'Webhook' },
            { id: 'external_api' as const, label: 'External API' },
            { id: 'openai_compatible' as const, label: 'LLM Provider' },
            { id: 'custom' as const, label: 'Custom' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setProviderFilter(tab.id)}
              className={`min-h-[38px] rounded-xl px-3.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                providerFilter === tab.id
                  ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                  : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <ErrorBanner message={error} onRetry={() => void loadIntegrations()} />}

        {showForm && (
          <form
            onSubmit={(e) => void handleSave(e)}
            className="rounded-xl border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-bg)] p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold">
                {editingId ? 'Update Connection' : 'Connect Service'}
              </h2>
              <span className="text-[11px] text-[var(--afrinex-muted)]">
                {PROVIDER_META[provider].hint}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!editingId && (
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                    Provider Type
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
                    className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
                  >
                    {(Object.keys(PROVIDER_META) as IntegrationProvider[]).map((key) => (
                      <option key={key} value={key}>
                        {PROVIDER_META[key].label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                  Connection Name
                </label>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production CRM Webhook"
                  className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder={PROVIDER_META[provider].endpointPlaceholder}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                  {PROVIDER_META[provider].secretLabel}
                  {editingId ? ' (leave blank to keep existing)' : ''}
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder={editingId ? '••••••••' : 'Paste secret token or key'}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                {saving ? 'Encrypting & Saving...' : editingId ? 'Update Connection' : 'Save Connection'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] px-4 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <SkeletonList rows={3} />
        ) : integrations.length === 0 ? (
          <EmptyState
            title="No external connections saved yet"
            description="Add a webhook, REST API, AI provider, or Telegram credential here so you can validate connectivity and use it cleanly across projects."
            actionLabel="Add First Connection"
            onAction={() => setShowForm(true)}
          />
        ) : (
          <div className="space-y-3">
            {integrations.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--afrinex-border)] p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link2 className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
                      <h2 className="font-display text-base font-semibold">{item.name}</h2>
                      <span className="rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 text-[11px]">
                        {PROVIDER_META[item.provider]?.label ?? item.provider}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
                          item.status === 'connected'
                            ? 'border-emerald-500/40 text-emerald-500'
                            : item.status === 'error'
                              ? 'border-red-500/40 text-red-400'
                              : 'border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                        }`}
                      >
                        {item.status === 'connected' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : item.status === 'error' ? (
                          <XCircle className="h-3 w-3" />
                        ) : null}
                        {item.status}
                      </span>
                    </div>

                    {item.endpointUrl && (
                      <p className="font-mono text-xs text-[var(--afrinex-muted)] break-all">
                        {item.endpointUrl}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--afrinex-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="h-3 w-3" />
                        {item.hasCredential ? item.credentialPreview || 'Encrypted secret stored' : 'No secret stored'}
                      </span>
                      {item.lastTestedAt && (
                        <span className="font-mono tabular-nums">
                          Tested {item.lastTestedAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      )}
                    </div>

                    {item.lastError && (
                      <p className="text-xs text-red-500 dark:text-red-400">{item.lastError}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleTest(item)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {busyId === item.id ? 'Testing...' : 'Test'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(item.id);
                        setProvider(item.provider);
                        setName(item.name);
                        setEndpointUrl(item.endpointUrl ?? '');
                        setSecretValue('');
                        setShowForm(true);
                      }}
                      className="min-h-[38px] rounded-xl border border-[var(--afrinex-border)] px-3 text-xs hover:border-[var(--afrinex-accent)]"
                    >
                      Edit
                    </button>

                    {item.status !== 'disconnected' && (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleDisconnect(item)}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs hover:border-amber-500"
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                        Disconnect
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      aria-label={`Delete ${item.name}`}
                      className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs text-red-500 hover:border-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Connection?"
        description={`Remove "${deleteTarget?.name ?? ''}" and permanently erase its encrypted credential from AFRINEX?`}
        confirmLabel="Delete Connection"
        destructive
        busy={busyId === deleteTarget?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
