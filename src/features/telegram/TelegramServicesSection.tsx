import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import type {
  PlatformSectionId,
  TelegramService,
  TelegramServiceType,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

const SERVICE_TYPES: Array<{ id: TelegramServiceType; label: string }> = [
  { id: 'bot_dev', label: 'Bot Development' },
  { id: 'channel_tools', label: 'Channel Tools' },
  { id: 'mini_app', label: 'Mini App Service' },
  { id: 'integration', label: 'API Integration' },
  { id: 'support_automation', label: 'Support Automation' },
];

interface TelegramServicesSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function TelegramServicesSection({ onNavigate }: TelegramServicesSectionProps) {
  const { user, token } = useAuth();
  const [serviceType, setServiceType] = useState<TelegramServiceType>('bot_dev');
  const [title, setTitle] = useState('');
  const [requirements, setRequirements] = useState('');
  const [services, setServices] = useState<TelegramService[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ services: TelegramService[] }>(
      '/api/telegram-services',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setServices(res.data.services);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (user && token) {
      void loadServices();
    } else {
      setServices([]);
    }
  }, [user, token, loadServices]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || creating) return;
    setCreating(true);
    setError(null);
    const res = await apiFetch<{ service: TelegramService | null }>(
      '/api/telegram-services',
      {
        method: 'POST',
        body: JSON.stringify({ serviceType, title, requirements }),
      },
      token
    );

    if (res.ok && res.data?.service) {
      setServices((prev) => [res.data!.service!, ...prev]);
      setTitle('');
      setRequirements('');
    } else {
      setError(res.error ?? 'Could not save service specification.');
    }
    setCreating(false);
  };

  const handleToggleStatus = async (service: TelegramService) => {
    if (!token) return;
    const nextStatus =
      service.status === 'planned'
        ? 'active'
        : service.status === 'active'
          ? 'paused'
          : 'planned';

    const res = await apiFetch<{ service: TelegramService | null }>(
      `/api/telegram-services/${service.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      },
      token
    );

    if (res.ok && res.data?.service) {
      setServices((prev) =>
        prev.map((item) => (item.id === service.id ? res.data!.service! : item))
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    const res = await apiFetch(`/api/telegram-services/${id}`, { method: 'DELETE' }, token);
    if (res.ok) {
      setServices((prev) => prev.filter((item) => item.id !== id));
    }
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Telegram Services
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in through Telegram to configure bot development blueprints, channel
              management, Mini App integrations, and customer-support automation.
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
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--afrinex-accent)]">
            Telegram Automation & Integrations
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Telegram Services Workspace
          </h1>
          <p className="text-sm text-[var(--afrinex-muted)]">
            Plan bot commands, webhook routes, and secret checklists without exposing bot
            tokens in frontend code.
          </p>
        </div>

        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {SERVICE_TYPES.map((item) => {
              const active = serviceType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setServiceType(item.id)}
                  className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                      : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <input
            required
            minLength={3}
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Service title"
            className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
          />

          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="Describe commands, channel workflows, or support escalation rules..."
            className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
          />

          {error && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Creating Blueprint...' : 'Create Telegram Service'}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">
          Your Telegram Services ({services.length})
        </h2>

        {loading ? (
          <p className="text-sm text-[var(--afrinex-muted)]">Loading services...</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-[var(--afrinex-muted)]">
            No Telegram services configured yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {services.map((srv) => (
              <article
                key={srv.id}
                className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                      {srv.serviceType.replace('_', ' ')} · Blueprint status: {srv.status}
                    </p>
                    <h3 className="mt-1 font-display text-base font-semibold">{srv.title}</h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleStatus(srv)}
                      className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)] capitalize"
                    >
                      {srv.status}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${srv.title}`}
                      onClick={() => void handleDelete(srv.id)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-[var(--afrinex-muted)]">{srv.requirements}</p>

                <div className="rounded-xl border border-[var(--afrinex-border)] p-3.5 space-y-2 text-xs">
                  <p className="font-mono text-[var(--afrinex-muted)]">
                    Endpoint: {srv.config.webhookEndpoint}
                  </p>
                  <p className="font-mono text-[var(--afrinex-muted)]">
                    Commands: {srv.config.recommendedBotCommands.join(' ')}
                  </p>
                  <ul className="space-y-1 text-[var(--afrinex-muted)] pt-1">
                    {srv.config.setupChecklist.map((step) => (
                      <li key={step}>· {step}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
