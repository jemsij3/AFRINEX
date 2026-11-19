import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  AiAgentBuilderConfig,
  AutomationBuilderConfig,
  BuilderProjectConfig,
  BuilderProvidersResponse,
  BuilderType,
  MiniAppBuilderConfig,
  TelegramBotBuilderConfig,
  WebsiteBuilderConfig,
} from '../../../shared/types.ts';

interface BuilderConfigFieldsProps {
  builderType: BuilderType;
  config: BuilderProjectConfig;
  providers: BuilderProvidersResponse | null;
  onChange: (next: BuilderProjectConfig) => void;
}

function parseCommaList(raw: string, prefixSlash = false): string[] {
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (prefixSlash && !item.startsWith('/') ? `/${item}` : item));
  return Array.from(new Set(items));
}

function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 py-2.5 cursor-pointer">
      <div className="space-y-0.5">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] text-[var(--afrinex-muted)]">{hint}</span>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[var(--afrinex-accent)] shrink-0"
      />
    </label>
  );
}

function CommaListField({
  label,
  value,
  placeholder,
  prefixSlash = false,
  onCommit,
}: {
  label: string;
  value: string[];
  placeholder: string;
  prefixSlash?: boolean;
  onCommit: (next: string[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--afrinex-muted)]">{label}</label>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseCommaList(e.target.value, prefixSlash);
          if (parsed.length > 0) {
            onCommit(parsed);
          }
        }}
        onBlur={() => {
          const parsed = parseCommaList(text, prefixSlash);
          if (parsed.length > 0) {
            onCommit(parsed);
            setText(parsed.join(', '));
          } else {
            onCommit([]);
          }
        }}
        placeholder={placeholder}
        className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
      />
    </div>
  );
}

export function BuilderConfigFields({
  builderType,
  config,
  providers,
  onChange,
}: BuilderConfigFieldsProps) {
  const [newActionText, setNewActionText] = useState('');

  if (builderType === 'telegram_bot') {
    const c = config as TelegramBotBuilderConfig;
    const update = (patch: Partial<TelegramBotBuilderConfig>) => onChange({ ...c, ...patch });

    return (
      <div className="space-y-4 rounded-xl border border-[var(--afrinex-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">Telegram Bot Configuration</h3>
          <span className="text-[11px] font-mono text-[var(--afrinex-muted)]">
            Bot API · Keyboards · Webhook
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
            Bot Purpose & Persona
          </label>
          <input
            type="text"
            value={c.botPurpose}
            onChange={(e) => update({ botPurpose: e.target.value })}
            placeholder="e.g., Community onboarding, Q&A support, and automated notifications"
            className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CommaListField
            key={`tg-cmds-${c.commands.join(',')}`}
            label="Slash Commands (comma-separated)"
            value={c.commands}
            prefixSlash
            placeholder="/start, /help, /profile, /admin"
            onCommit={(commands) =>
              update({ commands: commands.length > 0 ? commands : ['/start', '/help'] })
            }
          />

          <CommaListField
            key={`tg-int-${c.externalIntegrations.join(',')}`}
            label="External Integrations (comma-separated)"
            value={c.externalIntegrations}
            placeholder="Telegram Bot API, Stripe, Google Sheets"
            onCommit={(externalIntegrations) => update({ externalIntegrations })}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Keyboard Buttons
            </label>
            <select
              value={c.keyboardType}
              onChange={(e) =>
                update({ keyboardType: e.target.value as TelegramBotBuilderConfig['keyboardType'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="inline">Inline Keyboard</option>
              <option value="reply">Reply Keyboard</option>
              <option value="both">Both Inline & Reply</option>
              <option value="none">Commands Only</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Storage Backend
            </label>
            <select
              value={c.storageBackend}
              onChange={(e) =>
                update({
                  storageBackend: e.target.value as TelegramBotBuilderConfig['storageBackend'],
                })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="d1">Cloudflare D1 (SQLite)</option>
              <option value="kv">Cloudflare KV</option>
              <option value="memory">In-Memory / Stateless</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Update Mode
            </label>
            <select
              value={c.webhookMode}
              onChange={(e) =>
                update({ webhookMode: e.target.value as TelegramBotBuilderConfig['webhookMode'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="cloudflare_webhook">Cloudflare Webhook (Recommended)</option>
              <option value="long_polling">Long Polling Runner</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <ToggleRow
            label="User Registration"
            hint="Auto-save member profiles on /start"
            checked={c.userRegistrationEnabled}
            onToggle={(userRegistrationEnabled) => update({ userRegistrationEnabled })}
          />
          <ToggleRow
            label="Admin Commands"
            hint="Enforce ADMIN_TELEGRAM_IDS guard"
            checked={c.adminFeaturesEnabled}
            onToggle={(adminFeaturesEnabled) => update({ adminFeaturesEnabled })}
          />
          <ToggleRow
            label="Workers AI Replies"
            hint="Smart AI fallback for free-text chats"
            checked={c.aiIntegrationEnabled}
            onToggle={(aiIntegrationEnabled) => update({ aiIntegrationEnabled })}
          />
        </div>
      </div>
    );
  }

  if (builderType === 'ai_agent') {
    const c = config as AiAgentBuilderConfig;
    const update = (patch: Partial<AiAgentBuilderConfig>) => onChange({ ...c, ...patch });
    const models = providers?.models ?? [
      {
        id: c.aiProviderModel,
        label: c.aiProviderModel,
        provider: 'Cloudflare Workers AI',
        strength: 'Configured model',
      },
    ];

    return (
      <div className="space-y-4 rounded-xl border border-[var(--afrinex-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">AI Agent Configuration</h3>
          <span className="text-[11px] font-mono text-[var(--afrinex-muted)]">
            {providers?.workersAiBound ? 'Workers AI Bound' : 'Edge Provider Config'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Agent Identity & Role
            </label>
            <input
              type="text"
              value={c.agentIdentity}
              onChange={(e) => update({ agentIdentity: e.target.value })}
              placeholder="e.g., Grant Eligibility Analyst"
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              AI Model Provider
            </label>
            <select
              value={c.aiProviderModel}
              onChange={(e) => update({ aiProviderModel: e.target.value })}
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.strength}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
            System Instructions
          </label>
          <textarea
            rows={3}
            value={c.systemInstructions}
            onChange={(e) => update({ systemInstructions: e.target.value })}
            placeholder="Define tone, reasoning guidelines, output structure, and constraints..."
            className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
            Knowledge Base & Document Context (optional)
          </label>
          <textarea
            rows={2}
            value={c.knowledgeBaseSummary}
            onChange={(e) => update({ knowledgeBaseSummary: e.target.value })}
            placeholder="Paste key domain facts, policies, FAQ notes, or document outlines..."
            className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CommaListField
            key={`agent-tools-${c.tools.join(',')}`}
            label="Agent Tools (comma-separated)"
            value={c.tools}
            placeholder="knowledge_lookup, web_fetch, d1_query"
            onCommit={(tools) => update({ tools })}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Memory Mode
            </label>
            <select
              value={c.memoryMode}
              onChange={(e) =>
                update({ memoryMode: e.target.value as AiAgentBuilderConfig['memoryMode'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="d1_conversation">D1 Conversation History</option>
              <option value="session_window">Sliding Session Window</option>
              <option value="stateless">Stateless Single-Turn</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Access Control
            </label>
            <select
              value={c.accessControl}
              onChange={(e) =>
                update({ accessControl: e.target.value as AiAgentBuilderConfig['accessControl'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="authenticated_users">Authenticated Users (Bearer)</option>
              <option value="admin_only">Admin Only</option>
              <option value="public">Public Endpoint</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (builderType === 'website') {
    const c = config as WebsiteBuilderConfig;
    const update = (patch: Partial<WebsiteBuilderConfig>) => onChange({ ...c, ...patch });

    return (
      <div className="space-y-4 rounded-xl border border-[var(--afrinex-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">Website Configuration</h3>
          <span className="text-[11px] font-mono text-[var(--afrinex-muted)]">
            HTML5 · CSS · Interactive Preview
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Website Type
            </label>
            <select
              value={c.websiteType}
              onChange={(e) =>
                update({ websiteType: e.target.value as WebsiteBuilderConfig['websiteType'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="saas">SaaS Product</option>
              <option value="landing">Launch Landing Page</option>
              <option value="portfolio">Agency / Portfolio</option>
              <option value="ecommerce">Digital Storefront</option>
              <option value="docs">Documentation Hub</option>
              <option value="community">Community Portal</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Visual Brand Style
            </label>
            <select
              value={c.brandStyle}
              onChange={(e) =>
                update({ brandStyle: e.target.value as WebsiteBuilderConfig['brandStyle'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="minimal_editorial">Minimal Editorial</option>
              <option value="modern_dark">Modern Dark</option>
              <option value="vibrant_startup">Vibrant Startup</option>
              <option value="corporate_clean">Corporate Clean</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Brand Accent Color
            </label>
            <div className="flex items-center gap-2 min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-2.5">
              <input
                type="color"
                value={c.primaryColor}
                onChange={(e) => update({ primaryColor: e.target.value })}
                className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                type="text"
                value={c.primaryColor}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                    update({ primaryColor: val });
                  }
                }}
                onBlur={() => {
                  if (!/^#[0-9a-fA-F]{6}$/.test(c.primaryColor)) {
                    update({ primaryColor: '#10b981' });
                  }
                }}
                className="w-full bg-transparent font-mono text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>

        <CommaListField
          key={`web-pages-${c.pages.join(',')}`}
          label="Navigation Pages & Sections (comma-separated)"
          value={c.pages}
          placeholder="Home, Features, Pricing, Contact"
          onCommit={(pages) => update({ pages: pages.length > 0 ? pages : ['Home', 'Contact'] })}
        />

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <ToggleRow
            label="Backend Worker API"
            hint="Generate Hono endpoints alongside assets"
            checked={c.includeBackendApi}
            onToggle={(includeBackendApi) => update({ includeBackendApi })}
          />
          <ToggleRow
            label="Database & Auth"
            hint="Include D1 leads/users SQL migration"
            checked={c.includeDatabaseAuth}
            onToggle={(includeDatabaseAuth) => update({ includeDatabaseAuth })}
          />
          <ToggleRow
            label="Lead & Contact Forms"
            hint="Responsive contact form + client validation"
            checked={c.includeForms}
            onToggle={(includeForms) => update({ includeForms })}
          />
          <ToggleRow
            label="Checkout & Payments"
            hint="Add plans & payment route scaffolding"
            checked={c.includePayments}
            onToggle={(includePayments) => update({ includePayments })}
          />
        </div>
      </div>
    );
  }

  if (builderType === 'mini_app') {
    const c = config as MiniAppBuilderConfig;
    const update = (patch: Partial<MiniAppBuilderConfig>) => onChange({ ...c, ...patch });

    return (
      <div className="space-y-4 rounded-xl border border-[var(--afrinex-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">Mini App Configuration</h3>
          <span className="text-[11px] font-mono text-[var(--afrinex-muted)]">
            Mobile-First · Screens · Auth
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Target Platform
            </label>
            <select
              value={c.targetPlatform}
              onChange={(e) => {
                const nextPlatform = e.target.value as MiniAppBuilderConfig['targetPlatform'];
                update({
                  targetPlatform: nextPlatform,
                  telegramSdkEnabled:
                    nextPlatform === 'telegram_mini_app' ? true : c.telegramSdkEnabled,
                });
              }}
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="telegram_mini_app">Telegram Mini App (WebApp)</option>
              <option value="mobile_pwa">Mobile Progressive Web App</option>
              <option value="cross_platform_web">Cross-Platform Web App</option>
            </select>
          </div>

          <CommaListField
            key={`mini-screens-${c.screens.join(',')}`}
            label="Bottom-Nav Screens (comma-separated)"
            value={c.screens}
            placeholder="Home, Explore, Orders, Profile"
            onCommit={(screens) =>
              update({ screens: screens.length > 0 ? screens : ['Home', 'Profile'] })
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Authentication Mode
            </label>
            <select
              value={c.authMode}
              onChange={(e) =>
                update({ authMode: e.target.value as MiniAppBuilderConfig['authMode'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="telegram_initdata">Telegram initData HMAC + JWT</option>
              <option value="token_session">Bearer Token Session</option>
              <option value="public">Public (No Login)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Mobile Theme
            </label>
            <select
              value={c.mobileTheme}
              onChange={(e) =>
                update({ mobileTheme: e.target.value as MiniAppBuilderConfig['mobileTheme'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="telegram_adaptive">Telegram Theme Adaptive</option>
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Payments Integration
            </label>
            <select
              value={c.paymentsMode}
              onChange={(e) =>
                update({ paymentsMode: e.target.value as MiniAppBuilderConfig['paymentsMode'] })
              }
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            >
              <option value="telegram_stars">Telegram Stars (XTR)</option>
              <option value="stripe_checkout">Stripe Checkout</option>
              <option value="none">No Payments</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <ToggleRow
            label="Telegram WebApp SDK"
            hint="Include ready(), expand(), haptics & theme sync"
            checked={c.telegramSdkEnabled}
            onToggle={(telegramSdkEnabled) => update({ telegramSdkEnabled })}
          />
          <ToggleRow
            label="Worker + D1 Backend"
            hint="Generate API routes and SQL persistence tables"
            checked={c.backendDatabaseEnabled}
            onToggle={(backendDatabaseEnabled) => update({ backendDatabaseEnabled })}
          />
        </div>
      </div>
    );
  }

  // Automation Builder
  const c = config as AutomationBuilderConfig;
  const update = (patch: Partial<AutomationBuilderConfig>) => onChange({ ...c, ...patch });

  const addAction = () => {
    const trimmed = newActionText.trim();
    if (!trimmed) return;
    update({ actions: [...c.actions, trimmed] });
    setNewActionText('');
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--afrinex-border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Automation Pipeline Configuration</h3>
        <span className="text-[11px] font-mono text-[var(--afrinex-muted)]">
          Triggers · Conditions · Actions
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
            Trigger Source
          </label>
          <select
            value={c.triggerType}
            onChange={(e) =>
              update({ triggerType: e.target.value as AutomationBuilderConfig['triggerType'] })
            }
            className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
          >
            <option value="webhook">HTTP Webhook Trigger</option>
            <option value="cron_schedule">Cron Schedule</option>
            <option value="telegram_event">Telegram Bot / Payment Event</option>
            <option value="manual">Manual / API Dispatch</option>
          </select>
        </div>

        {c.triggerType === 'cron_schedule' ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Cron Expression (UTC)
            </label>
            <input
              type="text"
              value={c.scheduleCron}
              onChange={(e) => update({ scheduleCron: e.target.value })}
              placeholder="0 */6 * * *"
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 font-mono text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Webhook Endpoint Path
            </label>
            <input
              type="text"
              value={c.webhookPath}
              onChange={(e) => update({ webhookPath: e.target.value })}
              placeholder="/hooks/trigger"
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 font-mono text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CommaListField
          key={`wf-int-${c.integrations.join(',')}`}
          label="Connected Integrations (comma-separated)"
          value={c.integrations}
          placeholder="Cloudflare D1, Telegram Bot API, Stripe"
          onCommit={(integrations) => update({ integrations })}
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
            Condition / Filter Rule
          </label>
          <input
            type="text"
            value={c.conditions}
            onChange={(e) => update({ conditions: e.target.value })}
            placeholder='status == "active" && amount > 0'
            className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 font-mono text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
          Data Field Mapping
        </label>
        <input
          type="text"
          value={c.dataMapping}
          onChange={(e) => update({ dataMapping: e.target.value })}
          placeholder="event.id -> runId, event.user -> actor, event.payload -> data"
          className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 font-mono text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
          Ordered Action Steps ({c.actions.length})
        </label>
        <div className="space-y-1.5">
          {c.actions.map((action, idx) => (
            <div key={`${action}-${idx}`} className="flex items-center gap-2">
              <span className="w-6 text-center font-mono text-[11px] text-[var(--afrinex-muted)]">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={action}
                onChange={(e) => {
                  const next = [...c.actions];
                  next[idx] = e.target.value;
                  update({ actions: next });
                }}
                className="min-h-[38px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
              />
              {c.actions.length > 1 && (
                <button
                  type="button"
                  aria-label="Remove step"
                  onClick={() => update({ actions: c.actions.filter((_, i) => i !== idx) })}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newActionText}
            onChange={(e) => setNewActionText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAction();
              }
            }}
            placeholder="Add another step (e.g., Send Telegram admin alert)"
            className="min-h-[38px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={addAction}
            className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Step
          </button>
        </div>
      </div>

      <ToggleRow
        label="Activate Automation After Generation"
        hint="Enable active status flag for webhook / cron dispatch readiness"
        checked={c.isActive}
        onToggle={(isActive) => update({ isActive })}
      />
    </div>
  );
}
