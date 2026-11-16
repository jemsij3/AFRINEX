import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  Link2,
  Link2Off,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  PlatformSectionId,
  TelegramBotAnalyticsResponse,
  TelegramBotPublic,
} from '../../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../lib/auth-context.tsx';

interface TelegramBotsPageProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function TelegramBotsPage({ onNavigate }: TelegramBotsPageProps) {
  const { user, token } = useAuth();
  const [bots, setBots] = useState<TelegramBotPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [busyBotId, setBusyBotId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<TelegramBotAnalyticsResponse | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const loadBots = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ bots: TelegramBotPublic[] }>(
      '/api/telegram-bots/bots',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setBots(res.data.bots);
    } else {
      setError(res.error ?? 'Failed to load registered bots.');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (user && token) {
      void loadBots();
    } else {
      setBots([]);
      setSelectedBotId(null);
      setAnalytics(null);
    }
  }, [user, token, loadBots]);

  const loadAnalytics = async (botId: string) => {
    if (!token) return;
    setSelectedBotId(botId);
    setLoadingAnalytics(true);
    setError(null);
    const res = await apiFetch<TelegramBotAnalyticsResponse>(
      `/api/telegram-bots/bots/${encodeURIComponent(botId)}/analytics`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setAnalytics(res.data);
    } else {
      setError(res.error ?? 'Could not load bot analytics.');
      setAnalytics(null);
    }
    setLoadingAnalytics(false);
  };

  const handleRegisterBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || registering) return;
    setRegistering(true);
    setError(null);
    setNotice(null);

    const res = await apiFetch<{ bot: TelegramBotPublic | null }>(
      '/api/telegram-bots/register-bot',
      {
        method: 'POST',
        body: JSON.stringify({ bot_token: botToken.trim() }),
      },
      token
    );

    if (res.ok && res.data?.bot) {
      setBots((prev) => [res.data!.bot!, ...prev]);
      setBotToken('');
      setNotice(
        `Registered ${res.data.bot.bot_username ? `@${res.data.bot.bot_username}` : res.data.bot.bot_name ?? 'bot'}.`
      );
    } else {
      setError(res.error ?? 'Could not register bot token.');
    }
    setRegistering(false);
  };

  const handleToggleWebhook = async (bot: TelegramBotPublic) => {
    if (!token) return;
    setBusyBotId(bot.id);
    setError(null);
    setNotice(null);

    if (bot.webhook_active) {
      const res = await apiFetch<{ ok: boolean; webhook_active: boolean }>(
        `/api/telegram-bots/bots/${encodeURIComponent(bot.id)}/webhook`,
        { method: 'DELETE' },
        token
      );
      if (res.ok) {
        setBots((prev) =>
          prev.map((item) =>
            item.id === bot.id
              ? { ...item, webhook_active: false, webhook_url: null }
              : item
          )
        );
        setNotice('Webhook disabled.');
      } else {
        setError(res.error ?? 'Failed to disable webhook.');
      }
    } else {
      const res = await apiFetch<{ webhook_url: string; webhook_active: boolean }>(
        `/api/telegram-bots/bots/${encodeURIComponent(bot.id)}/webhook`,
        { method: 'POST' },
        token
      );
      if (res.ok && res.data) {
        setBots((prev) =>
          prev.map((item) =>
            item.id === bot.id
              ? {
                  ...item,
                  webhook_active: res.data!.webhook_active,
                  webhook_url: res.data!.webhook_url,
                }
              : item
          )
        );
        setNotice('Webhook activated. Send /start or /help to your bot to test it.');
      } else {
        setError(res.error ?? 'Failed to enable webhook.');
      }
    }
    setBusyBotId(null);
  };

  const handleDeleteBot = async (botId: string) => {
    if (!token) return;
    setBusyBotId(botId);
    setError(null);
    setNotice(null);

    const res = await apiFetch(
      `/api/telegram-bots/bots/${encodeURIComponent(botId)}`,
      { method: 'DELETE' },
      token
    );
    if (res.ok) {
      setBots((prev) => prev.filter((item) => item.id !== botId));
      setConfirmDeleteId(null);
      if (selectedBotId === botId) {
        setSelectedBotId(null);
        setAnalytics(null);
      }
      setNotice('Bot removed.');
    } else {
      setError(res.error ?? 'Failed to remove bot.');
    }
    setBusyBotId(null);
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Telegram Bots
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in through Telegram to register bots, manage live webhooks, and inspect
              real-time webhook analytics.
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

  const selectedBot = bots.find((b) => b.id === selectedBotId) ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              Live Webhook Hosting & Analytics
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Telegram Bot Management
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Connect bots created with @BotFather, activate secure AFRINEX webhook receivers,
              and monitor incoming command and message traffic.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadBots()}
            disabled={loading}
            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Bots
          </button>
        </div>

        <form onSubmit={(e) => void handleRegisterBot(e)} className="space-y-3">
          <label
            htmlFor="bot-token-input"
            className="block text-xs font-medium text-[var(--afrinex-muted)]"
          >
            Bot Token from @BotFather (validated via Telegram getMe; never shown after saving)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <input
                id="bot-token-input"
                required
                minLength={20}
                maxLength={256}
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="1234567890:AA..."
                autoComplete="off"
                className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-3.5 pr-11 font-mono text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                aria-label={showToken ? 'Hide bot token' : 'Show bot token'}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={registering || botToken.trim().length < 20}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              {registering ? 'Validating...' : 'Register Bot'}
            </button>
          </div>
        </form>

        {error && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
        )}
        {notice && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--afrinex-accent)]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {notice}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">
          Registered Bots ({bots.length})
        </h2>

        {loading && bots.length === 0 ? (
          <p className="text-sm text-[var(--afrinex-muted)]">Loading bots...</p>
        ) : bots.length === 0 ? (
          <div className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6">
            <p className="text-sm text-[var(--afrinex-muted)]">
              No Telegram bots registered yet. Paste a bot token above to connect your first bot.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {bots.map((bot) => {
              const busy = busyBotId === bot.id;
              const isConfirming = confirmDeleteId === bot.id;
              const isSelected = selectedBotId === bot.id;
              return (
                <article
                  key={bot.id}
                  className={`rounded-2xl border bg-[var(--afrinex-surface)] p-5 space-y-4 ${
                    isSelected
                      ? 'border-[var(--afrinex-accent)]'
                      : 'border-[var(--afrinex-border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
                        <h3 className="font-display text-base font-semibold truncate">
                          {bot.bot_name || 'Telegram Bot'}
                        </h3>
                      </div>
                      <p className="font-mono text-xs text-[var(--afrinex-muted)] truncate">
                        {bot.bot_username ? `@${bot.bot_username}` : bot.id}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium shrink-0 ${
                        bot.webhook_active
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-black/5 text-[var(--afrinex-muted)] dark:bg-white/10'
                      }`}
                    >
                      {bot.webhook_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {bot.webhook_url && (
                    <div className="rounded-xl border border-[var(--afrinex-border)] p-3 text-xs">
                      <p className="text-[var(--afrinex-muted)]">Webhook Receiver</p>
                      <p className="mt-1 font-mono break-all text-[var(--afrinex-text)]">
                        {bot.webhook_url}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleWebhook(bot)}
                      className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        bot.webhook_active
                          ? 'border border-[var(--afrinex-border)] hover:border-[var(--afrinex-accent)]'
                          : 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] hover:opacity-90'
                      }`}
                    >
                      {bot.webhook_active ? (
                        <>
                          <Link2Off className="h-3.5 w-3.5" />
                          Disable Webhook
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3.5 w-3.5" />
                          Enable Webhook
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void loadAnalytics(bot.id)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)] transition-colors"
                    >
                      <Activity className="h-3.5 w-3.5" />
                      Analytics
                    </button>

                    {isConfirming ? (
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteBot(bot.id)}
                          className="min-h-[36px] rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${bot.bot_username || bot.id}`}
                        onClick={() => setConfirmDeleteId(bot.id)}
                        className="ml-auto min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedBot && (
        <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--afrinex-accent)]">Bot Analytics</p>
              <h2 className="font-display text-lg font-semibold">
                {selectedBot.bot_name || 'Bot'}{' '}
                {selectedBot.bot_username ? `(@${selectedBot.bot_username})` : ''}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void loadAnalytics(selectedBot.id)}
              disabled={loadingAnalytics}
              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingAnalytics ? 'animate-spin' : ''}`} />
              Refresh Events
            </button>
          </div>

          {loadingAnalytics && !analytics ? (
            <p className="text-sm text-[var(--afrinex-muted)]">Loading analytics...</p>
          ) : analytics ? (
            <div className="space-y-5">
              {analytics.stats.length === 0 ? (
                <p className="text-sm text-[var(--afrinex-muted)]">
                  No webhook events recorded for this bot yet.
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {analytics.stats.map((stat) => (
                    <div
                      key={stat.event_type}
                      className="rounded-xl border border-[var(--afrinex-border)] p-3.5"
                    >
                      <dt className="text-xs text-[var(--afrinex-muted)] capitalize">
                        {stat.event_type.replace('_', ' ')}
                      </dt>
                      <dd className="mt-1 font-display text-xl font-bold tabular-nums">
                        {stat.count}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {analytics.recent.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-display text-sm font-semibold">
                    Recent Events ({analytics.recent.length})
                  </h3>
                  <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)] max-h-80 overflow-y-auto">
                    {analytics.recent.map((evt, idx) => (
                      <div
                        key={`${evt.created_at}-${idx}`}
                        className="flex flex-col gap-1 p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-semibold text-[var(--afrinex-accent)]">
                            {evt.event_type}
                          </span>
                          {evt.event_data && (
                            <span className="ml-2 font-mono text-[var(--afrinex-muted)] break-all">
                              {evt.event_data}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums shrink-0">
                          {evt.created_at}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
