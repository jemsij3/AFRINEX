import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  FileText,
  Headphones,
  KeyRound,
  Link2,
  Lock,
  Mail,
  Play,
  Plus,
  Search,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type {
  IntegrationProvider,
  IntegrationRecord,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  ConfirmDialog,
  ErrorBanner,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import {
  getTelegramUserScopeId,
  setTelegramBackButton,
  setTelegramClosingConfirmation,
  triggerHapticImpact,
  triggerHapticNotification,
  triggerHapticSelection,
} from '../../lib/telegram.ts';
import {
  FEATURED_TOOL_IDS,
  INTEGRATION_CATEGORIES,
  INTEGRATION_TOOLS,
  findCatalogToolById,
  type IntegrationCategoryId,
  type IntegrationToolCatalogItem,
} from './integrationsCatalog.ts';

interface IntegrationsSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

const CATEGORY_ICONS: Record<IntegrationCategoryId, ComponentType<{ className?: string }>> = {
  'ai-ml': Sparkles,
  social: Smartphone,
  email: Mail,
  ecommerce: ShoppingBag,
  document: FileText,
  developer: Terminal,
  productivity: Calendar,
  'crm-support': Headphones,
  'databases-analytics': Database,
  'finance-payments': CreditCard,
};

function getToolIcon(categoryId?: IntegrationCategoryId) {
  if (!categoryId) return Link2;
  return CATEGORY_ICONS[categoryId] ?? Link2;
}

function getRecordToolId(record: IntegrationRecord): string | null {
  const raw = record.config?.toolId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function IntegrationsSection({ onNavigate }: IntegrationsSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const telegramScopeId = getTelegramUserScopeId(user?.telegramId ?? null);

  const [view, setView] = useState<'main' | 'explore'>('main');
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] =
    useState<IntegrationCategoryId>('ai-ml');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Bottom-sheet drawer state
  const [activeTool, setActiveTool] = useState<IntegrationToolCatalogItem | null>(null);
  const [activeSavedRecord, setActiveSavedRecord] = useState<IntegrationRecord | null>(null);
  const [drawerMode, setDrawerMode] = useState<'oauth_preview' | 'credentials'>('credentials');
  const [endpointUrl, setEndpointUrl] = useState<string>('');
  const [secretValue, setSecretValue] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<IntegrationRecord | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const isDrawerDirty = Boolean(
    activeTool && drawerMode === 'credentials' && (secretValue.trim() || endpointUrl.trim())
  );

  useEffect(() => {
    setTelegramClosingConfirmation(isDrawerDirty);
    return () => setTelegramClosingConfirmation(false);
  }, [isDrawerDirty]);

  // Enable native Telegram BackButton inside Explore sub-view
  useEffect(() => {
    if (view !== 'explore') return;
    return setTelegramBackButton(true, () => {
      setView('main');
      setSearchQuery('');
    });
  }, [view]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!activeTool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteTarget) {
        setActiveTool(null);
        setActiveSavedRecord(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, deleteTarget]);

  const loadIntegrations = useCallback(async () => {
    if (!user || !token) {
      setIntegrations([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const res = await apiFetch<{ integrations: IntegrationRecord[] }>(
      '/api/integrations',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setIntegrations(res.data.integrations);
    } else {
      setError(res.error ?? 'Could not load your saved connections.');
    }
    setLoading(false);
  }, [user, token]);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  // Map saved integrations by catalog toolId (strictly scoped to current authenticated user)
  const savedByToolId = useMemo(() => {
    const map = new Map<string, IntegrationRecord>();
    for (const item of integrations) {
      if (item.status === 'disconnected') continue;
      const toolId = getRecordToolId(item);
      if (toolId && !map.has(toolId)) {
        map.set(toolId, item);
      }
    }
    return map;
  }, [integrations]);

  const activeUserConnectedRows = useMemo(() => {
    return integrations.filter((item) => item.status !== 'disconnected');
  }, [integrations]);

  const featuredTools = useMemo(() => {
    return FEATURED_TOOL_IDS.map((id) => findCatalogToolById(id)).filter(
      (item): item is IntegrationToolCatalogItem => Boolean(item)
    );
  }, []);

  const filteredExploreTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return INTEGRATION_TOOLS.filter((tool) => {
        const categoryLabel =
          INTEGRATION_CATEGORIES.find((c) => c.id === tool.categoryId)?.label.toLowerCase() ?? '';
        return (
          tool.name.toLowerCase().includes(q) ||
          tool.description.toLowerCase().includes(q) ||
          categoryLabel.includes(q)
        );
      });
    }
    return INTEGRATION_TOOLS.filter((tool) => tool.categoryId === selectedCategory);
  }, [searchQuery, selectedCategory]);

  const openToolDrawer = (
    tool: IntegrationToolCatalogItem,
    existingRecord?: IntegrationRecord | null
  ) => {
    triggerHapticSelection();
    const matchedRecord = existingRecord ?? savedByToolId.get(tool.id) ?? null;

    setActiveTool(tool);
    setActiveSavedRecord(matchedRecord);
    // Keep all API key / token fields empty by default
    setSecretValue('');
    setShowSecret(false);
    setEndpointUrl(matchedRecord?.endpointUrl ?? '');
    setTestFeedback(null);

    if (tool.authMode === 'oauth' && !matchedRecord) {
      setDrawerMode('oauth_preview');
    } else {
      setDrawerMode('credentials');
    }
  };

  const openCustomRecordDrawer = (record: IntegrationRecord) => {
    const matchedTool = findCatalogToolById(getRecordToolId(record));
    if (matchedTool) {
      openToolDrawer(matchedTool, record);
      return;
    }

    const fallbackTool: IntegrationToolCatalogItem = {
      id: getRecordToolId(record) ?? record.id,
      name: record.name,
      categoryId: 'developer',
      description: 'Saved external integration scoped to your AFRINEX account.',
      authMode: 'apiKey',
      defaultProvider: record.provider,
      secretLabel: 'API Key / Secret Token',
      keyPlaceholder: 'Enter new API key or token to rotate',
      endpointPlaceholder: 'https://api.example.com/health',
      capabilities: ['Authenticated workflow access', 'AES-256-GCM encrypted credentials'],
    };
    openToolDrawer(fallbackTool, record);
  };

  const closeDrawer = () => {
    setActiveTool(null);
    setActiveSavedRecord(null);
    setSecretValue('');
    setEndpointUrl('');
    setTestFeedback(null);
  };

  const resolveEffectiveProvider = (tool: IntegrationToolCatalogItem): IntegrationProvider => {
    if (activeSavedRecord) return activeSavedRecord.provider;
    if (tool.authMode === 'oauth' && endpointUrl.trim()) {
      return 'webhook';
    }
    return tool.defaultProvider;
  };

  const handleTestConnection = async () => {
    if (!activeTool || testing) return;

    if (!user || !token) {
      showToast('Sign in inside Telegram Mini App to run encrypted connection tests.', 'info');
      return;
    }

    setTesting(true);
    setTestFeedback(null);

    const hasDraftEdits =
      Boolean(secretValue.trim()) ||
      endpointUrl.trim() !== (activeSavedRecord?.endpointUrl ?? '');

    if (activeSavedRecord && !hasDraftEdits) {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
        integration: IntegrationRecord | null;
      }>(`/api/integrations/${activeSavedRecord.id}/test`, { method: 'POST' }, token);

      setTesting(false);
      if (res.data) {
        setTestFeedback({ ok: res.data.ok, message: res.data.message });
        if (res.data.integration) {
          setActiveSavedRecord(res.data.integration);
          setIntegrations((prev) =>
            prev.map((row) => (row.id === res.data!.integration!.id ? res.data!.integration! : row))
          );
        }
        triggerHapticNotification(res.data.ok ? 'success' : 'error');
      } else {
        setTestFeedback({ ok: false, message: res.error ?? 'Connection test failed.' });
        triggerHapticNotification('error');
      }
      return;
    }

    if (!secretValue.trim() && !endpointUrl.trim()) {
      setTesting(false);
      setTestFeedback({
        ok: false,
        message: 'Enter an API Key/Token or Endpoint URL to test.',
      });
      return;
    }

    const res = await apiFetch<{ ok: boolean; message: string }>(
      '/api/integrations/test-draft',
      {
        method: 'POST',
        body: JSON.stringify({
          provider: resolveEffectiveProvider(activeTool),
          endpointUrl: endpointUrl.trim() || '',
          secretValue: secretValue.trim() || undefined,
        }),
      },
      token
    );

    setTesting(false);
    const msg = res.data?.message ?? res.error ?? 'Connection test failed.';
    const ok = Boolean(res.ok && res.data?.ok);
    setTestFeedback({ ok, message: msg });
    triggerHapticNotification(ok ? 'success' : 'error');
  };

  const handleSaveAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTool || saving) return;

    if (!user || !token) {
      showToast('Open AFRINEX inside Telegram to save encrypted user connections.', 'info');
      return;
    }

    const trimmedSecret = secretValue.trim();
    const trimmedUrl = endpointUrl.trim();

    if (!activeSavedRecord && !trimmedSecret && !trimmedUrl) {
      showToast(`Enter your ${activeTool.secretLabel} or Webhook URL to connect.`, 'error');
      return;
    }

    setSaving(true);
    setTestFeedback(null);

    const provider = resolveEffectiveProvider(activeTool);
    const url = activeSavedRecord
      ? `/api/integrations/${activeSavedRecord.id}`
      : '/api/integrations';
    const method = activeSavedRecord ? 'PATCH' : 'POST';

    const payload: Record<string, unknown> = {
      name: activeSavedRecord?.name ?? activeTool.name,
      endpointUrl: trimmedUrl || '',
      config: {
        ...(activeSavedRecord?.config ?? {}),
        toolId: activeTool.id,
        categoryId: activeTool.categoryId,
        authMode: activeTool.authMode,
        tgUserScopeId: telegramScopeId,
      },
      status: 'connected',
    };

    if (!activeSavedRecord) {
      payload.provider = provider;
    }
    if (trimmedSecret) {
      payload.secretValue = trimmedSecret;
    }

    const res = await apiFetch<{ integration: IntegrationRecord }>(
      url,
      { method, body: JSON.stringify(payload) },
      token
    );

    setSaving(false);

    if (res.ok && res.data?.integration) {
      triggerHapticImpact('medium');
      showToast(`${activeTool.name} connected with AES-256-GCM encryption.`, 'success');
      await loadIntegrations();
      closeDrawer();
    } else {
      const msg = res.error ?? 'Could not save connection.';
      setTestFeedback({ ok: false, message: msg });
      showToast(msg, 'error');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!token || !deleteTarget || deleting) return;
    setDeleting(true);
    const res = await apiFetch(`/api/integrations/${deleteTarget.id}`, { method: 'DELETE' }, token);
    setDeleting(false);

    if (res.ok) {
      showToast(`Removed "${deleteTarget.name}" connection.`, 'info');
      setDeleteTarget(null);
      closeDrawer();
      await loadIntegrations();
    } else {
      showToast(res.error ?? 'Failed to remove connection.', 'error');
    }
  };

  const activeCategoryLabel =
    INTEGRATION_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? 'Tools';

  return (
    <div className="space-y-5">
      {view === 'main' ? (
        /* VIEW 1 — Main "Integrations & Connections" Screen */
        <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-[var(--afrinex-border)]">
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl text-[var(--afrinex-text)]">
              Connections
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--afrinex-muted)]">
              Link apps to let AFRINEX AI Assistant and Builders work with your data and automate workflows.
            </p>
          </div>

          {error && (
            <div className="p-4">
              <ErrorBanner message={error} onRetry={() => void loadIntegrations()} />
            </div>
          )}

          {loading ? (
            <div className="p-5">
              <SkeletonList rows={4} />
            </div>
          ) : (
            <div className="divide-y divide-[var(--afrinex-border)]">
              {activeUserConnectedRows.length > 0
                ? activeUserConnectedRows.map((record) => {
                    const matchedTool = findCatalogToolById(getRecordToolId(record));
                    const Icon = getToolIcon(matchedTool?.categoryId);
                    const description =
                      matchedTool?.description ??
                      (record.endpointUrl ||
                        (record.hasCredential
                          ? 'AES-256-GCM encrypted secret stored for your account.'
                          : 'Connected external service.'));

                    return (
                      <div
                        key={record.id}
                        className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] text-[var(--afrinex-accent)]">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h2 className="font-display text-sm font-semibold text-[var(--afrinex-text)] truncate">
                            {matchedTool?.featuredTitle ?? matchedTool?.name ?? record.name}
                          </h2>
                          <p className="mt-0.5 text-xs leading-relaxed text-[var(--afrinex-muted)] line-clamp-2">
                            {description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => openCustomRecordDrawer(record)}
                          aria-label={`Manage ${record.name}`}
                          className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center rounded-xl border border-[var(--afrinex-accent)] bg-[var(--afrinex-accent)]/15 text-[var(--afrinex-accent)] transition-opacity hover:opacity-90"
                        >
                          <Check className="h-5 w-5 stroke-[2.5]" />
                        </button>
                      </div>
                    );
                  })
                : featuredTools.map((tool) => {
                    const Icon = getToolIcon(tool.categoryId);
                    const connected = savedByToolId.get(tool.id);

                    return (
                      <div
                        key={tool.id}
                        className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] text-[var(--afrinex-accent)]">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h2 className="font-display text-sm font-semibold text-[var(--afrinex-text)] truncate">
                            {tool.featuredTitle ?? tool.name}
                          </h2>
                          <p className="mt-0.5 text-xs leading-relaxed text-[var(--afrinex-muted)] line-clamp-2">
                            {tool.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => openToolDrawer(tool, connected)}
                          aria-label={
                            connected ? `${tool.name} connected` : `Connect ${tool.name}`
                          }
                          className={`h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center rounded-xl border transition-colors ${
                            connected
                              ? 'border-[var(--afrinex-accent)] bg-[var(--afrinex-accent)]/15 text-[var(--afrinex-accent)]'
                              : 'border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] text-[var(--afrinex-text)] hover:border-[var(--afrinex-accent)] hover:text-[var(--afrinex-accent)]'
                          }`}
                        >
                          {connected ? (
                            <Check className="h-5 w-5 stroke-[2.5]" />
                          ) : (
                            <Plus className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
            </div>
          )}

          {/* Bottom Full-Width Clickable Row */}
          <button
            type="button"
            onClick={() => {
              triggerHapticSelection();
              setView('explore');
            }}
            className="min-h-[52px] w-full border-t border-[var(--afrinex-border)] px-5 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--afrinex-accent)] transition-colors hover:bg-[var(--afrinex-accent)]/5"
          >
            <Search className="h-4 w-4" />
            <span>Explore connections</span>
          </button>
        </section>
      ) : (
        /* VIEW 2 — "Explore Connections" Sub-View */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHapticSelection();
                setView('main');
                setSearchQuery('');
              }}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3.5 text-sm font-medium text-[var(--afrinex-text)] hover:border-[var(--afrinex-accent)]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Connections</span>
            </button>

            <h1 className="font-display text-base font-bold sm:text-lg text-[var(--afrinex-text)]">
              Explore connections
            </h1>
          </div>

          {/* Top Search Bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
            <input
              type="search"
              aria-label="Search connections"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="min-h-[46px] w-full rounded-full border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] pl-11 pr-11 text-sm text-[var(--afrinex-text)] placeholder:text-[var(--afrinex-muted)] focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Left-to-Right Scrollable Category Pills */}
          <div
            role="tablist"
            aria-label="Integration categories"
            className="flex items-center gap-2 overflow-x-auto pb-1"
          >
            {INTEGRATION_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.id];
              const active = !searchQuery.trim() && selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    triggerHapticSelection();
                    setSearchQuery('');
                    setSelectedCategory(category.id);
                  }}
                  className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-full px-4 text-xs whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] font-bold'
                      : 'border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] text-[var(--afrinex-text)] font-medium hover:border-[var(--afrinex-accent)]/60'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </div>

          {/* Selected Category Heading + Downward Tool List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-sm font-semibold text-[var(--afrinex-text)]">
                {searchQuery.trim()
                  ? `Search results (${filteredExploreTools.length})`
                  : activeCategoryLabel}
              </h2>
              <span className="font-mono text-xs tabular-nums text-[var(--afrinex-muted)]">
                {filteredExploreTools.length} tools
              </span>
            </div>

            <div className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] overflow-hidden divide-y divide-[var(--afrinex-border)]">
              {filteredExploreTools.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="font-display text-sm font-semibold text-[var(--afrinex-text)]">
                    No matching integrations
                  </p>
                  <p className="text-xs text-[var(--afrinex-muted)]">
                    Try searching another app name or browse categories above.
                  </p>
                </div>
              ) : (
                filteredExploreTools.map((tool) => {
                  const Icon = getToolIcon(tool.categoryId);
                  const connected = savedByToolId.get(tool.id);

                  return (
                    <div
                      key={tool.id}
                      className="flex items-center gap-3.5 px-4 sm:px-5 py-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] text-[var(--afrinex-accent)]">
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-sm font-semibold text-[var(--afrinex-text)] truncate">
                          {tool.name}
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--afrinex-muted)] line-clamp-2">
                          {tool.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => openToolDrawer(tool, connected)}
                        aria-label={
                          connected ? `${tool.name} connected` : `Connect ${tool.name}`
                        }
                        className={`h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center rounded-xl border transition-colors ${
                          connected
                            ? 'border-[var(--afrinex-accent)] bg-[var(--afrinex-accent)]/15 text-[var(--afrinex-accent)]'
                            : 'border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] text-[var(--afrinex-text)] hover:border-[var(--afrinex-accent)] hover:text-[var(--afrinex-accent)]'
                        }`}
                      >
                        {connected ? (
                          <Check className="h-5 w-5 stroke-[2.5]" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom-Sheet Drawer for API Key Encryption & OAuth Preview */}
      {activeTool && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-drawer-title"
            className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] shadow-2xl pb-safe"
          >
            {/* Mobile Drag Handle */}
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="h-1.5 w-10 rounded-full bg-[var(--afrinex-border)]" />
            </div>

            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-4 border-b border-[var(--afrinex-border)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] text-[var(--afrinex-accent)]">
                  {(() => {
                    const ToolIcon = getToolIcon(activeTool.categoryId);
                    return <ToolIcon className="h-5 w-5" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <h2
                    id="integration-drawer-title"
                    className="font-display text-base font-bold text-[var(--afrinex-text)] truncate"
                  >
                    {activeTool.name}
                  </h2>
                  <p className="text-xs text-[var(--afrinex-muted)]">
                    {INTEGRATION_CATEGORIES.find((c) => c.id === activeTool.categoryId)?.label}
                    {activeSavedRecord ? ' · Connected' : ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Close drawer"
                onClick={closeDrawer}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {drawerMode === 'oauth_preview' ? (
              /* OAUTH PREVIEW DRAWER */
              <div className="p-5 space-y-5">
                <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
                  {activeTool.description}
                </p>

                <div className="rounded-xl border border-[var(--afrinex-accent)]/35 bg-[var(--afrinex-accent)]/10 px-4 py-3 flex items-center gap-2.5 text-xs font-semibold text-[var(--afrinex-accent)]">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>1-Click OAuth Setup — Coming Soon</span>
                </div>

                <div className="space-y-2.5">
                  <h3 className="font-display text-xs font-semibold text-[var(--afrinex-text)]">
                    Planned Capabilities for AFRINEX
                  </h3>
                  <ul className="space-y-2">
                    {activeTool.capabilities.map((cap) => (
                      <li
                        key={cap}
                        className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--afrinex-muted)]"
                      >
                        <CheckCircle2 className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0 mt-0.5" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHapticSelection();
                      setDrawerMode('credentials');
                    }}
                    className="min-h-[46px] w-full rounded-xl bg-[var(--afrinex-accent)] px-4 text-sm font-semibold text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90"
                  >
                    Connect via Custom Webhook / API Key Instead
                  </button>

                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] px-4 text-xs font-medium text-[var(--afrinex-text)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* API KEY / TOKEN & CUSTOM WEBHOOK AES-GCM DRAWER */
              <form onSubmit={(e) => void handleSaveAndConnect(e)} className="p-5 space-y-4">
                <p className="text-xs leading-relaxed text-[var(--afrinex-muted)]">
                  {activeTool.description}
                </p>

                <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--afrinex-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-[var(--afrinex-accent)]" />
                    AES-256-GCM Encrypted
                  </span>
                  <span className="font-mono tabular-nums">
                    User: {telegramScopeId}
                  </span>
                </div>

                {!user && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2 text-xs">
                    <p className="text-[var(--afrinex-text)] font-medium">
                      Telegram sign-in required for encrypted persistence
                    </p>
                    <p className="text-[var(--afrinex-muted)]">
                      Guest previews do not store API credentials locally. Open AFRINEX in Telegram to connect and test securely.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        closeDrawer();
                        onNavigate('dashboard');
                      }}
                      className="min-h-[38px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs font-medium text-[var(--afrinex-text)]"
                    >
                      Check Account Status
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="integration-secret-input"
                    className="block text-xs font-medium text-[var(--afrinex-text)]"
                  >
                    {activeTool.secretLabel}
                  </label>
                  <div className="relative">
                    <input
                      id="integration-secret-input"
                      type={showSecret ? 'text' : 'password'}
                      autoComplete="off"
                      value={secretValue}
                      onChange={(e) => setSecretValue(e.target.value)}
                      placeholder={
                        activeSavedRecord?.hasCredential
                          ? 'Leave blank to keep stored key, or paste a new key'
                          : activeTool.keyPlaceholder
                      }
                      className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-3.5 pr-12 text-sm text-[var(--afrinex-text)] placeholder:text-[var(--afrinex-muted)] focus:border-[var(--afrinex-accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                      onClick={() => setShowSecret((prev) => !prev)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {activeSavedRecord?.hasCredential && (
                    <p className="flex items-center gap-1.5 text-[11px] text-[var(--afrinex-muted)]">
                      <KeyRound className="h-3 w-3 text-[var(--afrinex-accent)]" />
                      <span>{activeSavedRecord.credentialPreview || 'Encrypted secret stored'}</span>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="integration-endpoint-input"
                    className="block text-xs font-medium text-[var(--afrinex-text)]"
                  >
                    Endpoint / Webhook URL (optional)
                  </label>
                  <input
                    id="integration-endpoint-input"
                    type="url"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    placeholder={activeTool.endpointPlaceholder}
                    className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 text-sm text-[var(--afrinex-text)] placeholder:text-[var(--afrinex-muted)] focus:border-[var(--afrinex-accent)] focus:outline-none"
                  />
                </div>

                {testFeedback && (
                  <div
                    className={`rounded-xl border px-3.5 py-2.5 flex items-start gap-2 text-xs ${
                      testFeedback.ok
                        ? 'border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-accent)]/10 text-[var(--afrinex-accent)]'
                        : 'border-red-500/40 bg-red-500/10 text-red-400'
                    }`}
                  >
                    {testFeedback.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <span>{testFeedback.message}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={testing || saving}
                    onClick={() => void handleTestConnection()}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-4 text-xs font-semibold text-[var(--afrinex-text)] hover:border-[var(--afrinex-accent)] disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>{testing ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={saving || testing}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>{saving ? 'Encrypting...' : 'Save & Connect'}</span>
                  </button>
                </div>

                {activeSavedRecord && (
                  <div className="pt-3 border-t border-[var(--afrinex-border)] flex items-center justify-between">
                    <span className="text-[11px] text-[var(--afrinex-muted)]">
                      {activeSavedRecord.lastTestedAt
                        ? `Last tested ${activeSavedRecord.lastTestedAt.slice(0, 16).replace('T', ' ')}`
                        : 'Stored in D1 Integrations'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(activeSavedRecord)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium text-red-400 hover:border-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove Connection?"
        description={`Remove "${deleteTarget?.name ?? ''}" and permanently delete its AES-256-GCM encrypted credentials from AFRINEX?`}
        confirmLabel="Remove Connection"
        destructive
        busy={deleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
