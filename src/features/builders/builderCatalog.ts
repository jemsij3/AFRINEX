import type {
  AiAgentBuilderConfig,
  AutomationBuilderConfig,
  BuilderProjectConfig,
  BuilderType,
  MiniAppBuilderConfig,
  TelegramBotBuilderConfig,
  WebsiteBuilderConfig,
} from '../../../shared/types.ts';

export interface BuilderCatalogEntry {
  id: BuilderType;
  label: string;
  shortLabel: string;
  tagline: string;
  runtimeLabel: string;
  defaultNamePlaceholder: string;
  defaultPromptPlaceholder: string;
  samplePrompt: string;
}

export const BUILDER_CATALOG: BuilderCatalogEntry[] = [
  {
    id: 'telegram_bot',
    label: 'Telegram Bot Builder',
    shortLabel: 'Telegram Bot',
    tagline: 'Commands, inline/reply keyboards, user registration, admin panel & webhooks',
    runtimeLabel: 'Cloudflare Worker + Bot API',
    defaultNamePlaceholder: 'AFRINEX Community Concierge Bot',
    defaultPromptPlaceholder:
      'Describe bot commands, onboarding flow, admin actions, AI replies, and external API integrations...',
    samplePrompt:
      'Build a Telegram community bot with /start onboarding, /resources library menu, /profile registration in D1, and /admin broadcast stats.',
  },
  {
    id: 'ai_agent',
    label: 'AI Agent Builder',
    shortLabel: 'AI Agent',
    tagline: 'System instructions, model provider routing, knowledge context, tools & memory',
    runtimeLabel: 'Cloudflare Workers AI Agent',
    defaultNamePlaceholder: 'Pan-African Grant Advisor Agent',
    defaultPromptPlaceholder:
      'Describe the agent identity, reasoning goals, knowledge base domain, tools, and access control...',
    samplePrompt:
      'Create a domain specialist AI agent that evaluates startup grant eligibility, extracts requirements into structured JSON, and remembers conversation context in D1.',
  },
  {
    id: 'website',
    label: 'Website Builder',
    shortLabel: 'Website',
    tagline: 'Responsive pages, brand palette, forms, optional backend API, D1 auth & payments',
    runtimeLabel: 'Cloudflare Pages / Worker Assets',
    defaultNamePlaceholder: 'Kigali Tech Studio',
    defaultPromptPlaceholder:
      'Describe your website audience, sections, value proposition, lead forms, or checkout needs...',
    samplePrompt:
      'Build a modern SaaS website for an African fintech developer platform with Home, Features, Pricing, and Contact pages plus lead capture API.',
  },
  {
    id: 'mini_app',
    label: 'Mini App Builder',
    shortLabel: 'Mini App',
    tagline: 'Telegram WebApp SDK or mobile PWA with screens, auth, D1 backend & Stars payments',
    runtimeLabel: 'Telegram Mini App + Worker API',
    defaultNamePlaceholder: 'Campus Marketplace Mini App',
    defaultPromptPlaceholder:
      'Describe mobile screens, Telegram user verification, D1 storage, and in-app Stars or checkout flows...',
    samplePrompt:
      'Build a Telegram Mini App with Home, Catalog, Orders, and Profile screens using initData authentication, D1 persistence, and Telegram Stars payments.',
  },
  {
    id: 'workflow',
    label: 'Automation Builder',
    shortLabel: 'Automation',
    tagline: 'Webhook/cron/event triggers, rules, field mapping, step actions & run history',
    runtimeLabel: 'Cloudflare Worker + Cron/Webhook',
    defaultNamePlaceholder: 'Order Alert & CRM Sync Pipeline',
    defaultPromptPlaceholder:
      'Describe the trigger event, condition rule, data mapping fields, and automated steps...',
    samplePrompt:
      'Trigger a webhook workflow when new payments arrive, verify status == "paid", map customer fields, save an audit log in D1, and send a Telegram alert.',
  },
];

export type BuilderWorkspaceTab = 'plan' | 'files' | 'preview' | 'deploy';

export const BUILDER_STATUS_STYLES: Record<
  'draft' | 'generated' | 'previewed' | 'deployed',
  { label: string; className: string }
> = {
  draft: {
    label: 'Plan Draft',
    className: 'border-[var(--afrinex-border)] text-[var(--afrinex-muted)]',
  },
  generated: {
    label: 'Code Ready',
    className: 'border-sky-500/40 text-sky-400',
  },
  previewed: {
    label: 'Tested',
    className: 'border-amber-500/40 text-amber-400',
  },
  deployed: {
    label: 'Deployed',
    className: 'border-emerald-500/40 text-emerald-400',
  },
};

export function getDefaultBuilderConfig(
  builderType: BuilderType,
  defaultModel = '@cf/meta/llama-3.1-8b-instruct'
): BuilderProjectConfig {
  switch (builderType) {
    case 'telegram_bot':
      return {
        botPurpose: 'Automate community onboarding, resource discovery, and member support on Telegram.',
        commands: ['/start', '/help', '/profile', '/admin'],
        keyboardType: 'inline',
        userRegistrationEnabled: true,
        adminFeaturesEnabled: true,
        aiIntegrationEnabled: true,
        storageBackend: 'd1',
        webhookMode: 'cloudflare_webhook',
        externalIntegrations: ['Telegram Bot API'],
      } satisfies TelegramBotBuilderConfig;

    case 'ai_agent':
      return {
        agentIdentity: 'AFRINEX Domain Specialist',
        systemInstructions:
          'Deliver clear, accurate, step-by-step guidance tailored to the user request and cite enabled tools when helpful.',
        aiProviderModel: defaultModel,
        knowledgeBaseSummary: '',
        tools: ['knowledge_lookup', 'structured_json'],
        memoryMode: 'd1_conversation',
        accessControl: 'authenticated_users',
      } satisfies AiAgentBuilderConfig;

    case 'website':
      return {
        websiteType: 'saas',
        brandStyle: 'minimal_editorial',
        primaryColor: '#10b981',
        pages: ['Home', 'Features', 'Pricing', 'Contact'],
        includeBackendApi: true,
        includeDatabaseAuth: false,
        includeForms: true,
        includePayments: false,
      } satisfies WebsiteBuilderConfig;

    case 'mini_app':
      return {
        targetPlatform: 'telegram_mini_app',
        screens: ['Home', 'Explore', 'Orders', 'Profile'],
        authMode: 'telegram_initdata',
        backendDatabaseEnabled: true,
        telegramSdkEnabled: true,
        paymentsMode: 'telegram_stars',
        mobileTheme: 'telegram_adaptive',
      } satisfies MiniAppBuilderConfig;

    case 'workflow':
      return {
        triggerType: 'webhook',
        scheduleCron: '0 */6 * * *',
        webhookPath: '/hooks/trigger',
        integrations: ['Cloudflare D1', 'Telegram Bot API'],
        conditions: 'status == "active"',
        actions: [
          'Validate incoming payload',
          'Apply data mapping',
          'Persist execution log',
          'Dispatch notification',
        ],
        dataMapping: 'event.id -> runId, event.user -> actor, event.payload -> data',
        isActive: false,
      } satisfies AutomationBuilderConfig;
  }
}

export function getCatalogEntry(builderType: BuilderType): BuilderCatalogEntry {
  return BUILDER_CATALOG.find((item) => item.id === builderType) ?? BUILDER_CATALOG[0];
}
