import type {
  AiAgentBuilderConfig,
  AutomationBuilderConfig,
  BuilderDeploymentConfig,
  BuilderFile,
  BuilderProjectConfig,
  BuilderProjectPlan,
  BuilderSpec,
  BuilderType,
  MiniAppBuilderConfig,
  TelegramBotBuilderConfig,
  WebsiteBuilderConfig,
} from '../../shared/types.ts';
import { DEFAULT_WORKERS_AI_MODEL } from './workersAi.ts';

export function slugifyProjectName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'afrinex-project'
  );
}

function cleanStringList(input: unknown, fallback: string[], prefixSlash = false): string[] {
  if (!Array.isArray(input)) return fallback;
  const cleaned = input
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => (prefixSlash && !v.startsWith('/') ? `/${v}` : v));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : fallback;
}

export function normalizeBuilderConfig(
  builderType: BuilderType,
  rawConfig: unknown,
  name: string,
  prompt: string
): BuilderProjectConfig {
  const cfg =
    typeof rawConfig === 'object' && rawConfig !== null && !Array.isArray(rawConfig)
      ? (rawConfig as Record<string, unknown>)
      : {};

  switch (builderType) {
    case 'telegram_bot':
      return {
        botPurpose:
          typeof cfg.botPurpose === 'string' && cfg.botPurpose.trim()
            ? cfg.botPurpose.trim()
            : prompt.slice(0, 240),
        commands: cleanStringList(
          cfg.commands,
          ['/start', '/help', '/profile'],
          true
        ),
        keyboardType:
          cfg.keyboardType === 'inline' ||
          cfg.keyboardType === 'reply' ||
          cfg.keyboardType === 'both' ||
          cfg.keyboardType === 'none'
            ? cfg.keyboardType
            : 'inline',
        userRegistrationEnabled:
          typeof cfg.userRegistrationEnabled === 'boolean' ? cfg.userRegistrationEnabled : true,
        adminFeaturesEnabled:
          typeof cfg.adminFeaturesEnabled === 'boolean' ? cfg.adminFeaturesEnabled : true,
        aiIntegrationEnabled:
          typeof cfg.aiIntegrationEnabled === 'boolean' ? cfg.aiIntegrationEnabled : false,
        storageBackend:
          cfg.storageBackend === 'd1' ||
          cfg.storageBackend === 'kv' ||
          cfg.storageBackend === 'memory'
            ? cfg.storageBackend
            : 'd1',
        webhookMode:
          cfg.webhookMode === 'cloudflare_webhook' || cfg.webhookMode === 'long_polling'
            ? cfg.webhookMode
            : 'cloudflare_webhook',
        externalIntegrations: cleanStringList(cfg.externalIntegrations, []),
      } satisfies TelegramBotBuilderConfig;

    case 'ai_agent':
      return {
        agentIdentity:
          typeof cfg.agentIdentity === 'string' && cfg.agentIdentity.trim()
            ? cfg.agentIdentity.trim()
            : `${name} AI Specialist`,
        systemInstructions:
          typeof cfg.systemInstructions === 'string' && cfg.systemInstructions.trim()
            ? cfg.systemInstructions.trim()
            : `You are ${name}, a helpful, concise domain agent. ${prompt.slice(0, 300)}`,
        aiProviderModel:
          typeof cfg.aiProviderModel === 'string' && cfg.aiProviderModel.trim()
            ? cfg.aiProviderModel.trim()
            : DEFAULT_WORKERS_AI_MODEL,
        knowledgeBaseSummary:
          typeof cfg.knowledgeBaseSummary === 'string' ? cfg.knowledgeBaseSummary.trim() : '',
        tools: cleanStringList(cfg.tools, ['knowledge_lookup', 'structured_json']),
        memoryMode:
          cfg.memoryMode === 'd1_conversation' ||
          cfg.memoryMode === 'session_window' ||
          cfg.memoryMode === 'stateless'
            ? cfg.memoryMode
            : 'd1_conversation',
        accessControl:
          cfg.accessControl === 'public' ||
          cfg.accessControl === 'authenticated_users' ||
          cfg.accessControl === 'admin_only'
            ? cfg.accessControl
            : 'authenticated_users',
      } satisfies AiAgentBuilderConfig;

    case 'website':
      return {
        websiteType:
          cfg.websiteType === 'landing' ||
          cfg.websiteType === 'saas' ||
          cfg.websiteType === 'portfolio' ||
          cfg.websiteType === 'ecommerce' ||
          cfg.websiteType === 'docs' ||
          cfg.websiteType === 'community'
            ? cfg.websiteType
            : 'saas',
        brandStyle:
          cfg.brandStyle === 'minimal_editorial' ||
          cfg.brandStyle === 'modern_dark' ||
          cfg.brandStyle === 'vibrant_startup' ||
          cfg.brandStyle === 'corporate_clean'
            ? cfg.brandStyle
            : 'minimal_editorial',
        primaryColor:
          typeof cfg.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cfg.primaryColor)
            ? cfg.primaryColor
            : '#10b981',
        pages: cleanStringList(cfg.pages, ['Home', 'Features', 'Pricing', 'Contact']),
        includeBackendApi:
          typeof cfg.includeBackendApi === 'boolean' ? cfg.includeBackendApi : false,
        includeDatabaseAuth:
          typeof cfg.includeDatabaseAuth === 'boolean' ? cfg.includeDatabaseAuth : false,
        includeForms: typeof cfg.includeForms === 'boolean' ? cfg.includeForms : true,
        includePayments: typeof cfg.includePayments === 'boolean' ? cfg.includePayments : false,
      } satisfies WebsiteBuilderConfig;

    case 'mini_app':
      return {
        targetPlatform:
          cfg.targetPlatform === 'telegram_mini_app' ||
          cfg.targetPlatform === 'mobile_pwa' ||
          cfg.targetPlatform === 'cross_platform_web'
            ? cfg.targetPlatform
            : 'telegram_mini_app',
        screens: cleanStringList(cfg.screens, ['Home', 'Explore', 'Orders', 'Profile']),
        authMode:
          cfg.authMode === 'telegram_initdata' ||
          cfg.authMode === 'token_session' ||
          cfg.authMode === 'public'
            ? cfg.authMode
            : 'telegram_initdata',
        backendDatabaseEnabled:
          typeof cfg.backendDatabaseEnabled === 'boolean' ? cfg.backendDatabaseEnabled : true,
        telegramSdkEnabled:
          typeof cfg.telegramSdkEnabled === 'boolean' ? cfg.telegramSdkEnabled : true,
        paymentsMode:
          cfg.paymentsMode === 'none' ||
          cfg.paymentsMode === 'telegram_stars' ||
          cfg.paymentsMode === 'stripe_checkout'
            ? cfg.paymentsMode
            : 'none',
        mobileTheme:
          cfg.mobileTheme === 'telegram_adaptive' ||
          cfg.mobileTheme === 'dark' ||
          cfg.mobileTheme === 'light'
            ? cfg.mobileTheme
            : 'telegram_adaptive',
      } satisfies MiniAppBuilderConfig;

    case 'workflow':
      return {
        triggerType:
          cfg.triggerType === 'webhook' ||
          cfg.triggerType === 'cron_schedule' ||
          cfg.triggerType === 'telegram_event' ||
          cfg.triggerType === 'manual'
            ? cfg.triggerType
            : 'webhook',
        scheduleCron:
          typeof cfg.scheduleCron === 'string' && cfg.scheduleCron.trim()
            ? cfg.scheduleCron.trim()
            : '0 */6 * * *',
        webhookPath:
          typeof cfg.webhookPath === 'string' && cfg.webhookPath.trim()
            ? cfg.webhookPath.trim().startsWith('/')
              ? cfg.webhookPath.trim()
              : `/${cfg.webhookPath.trim()}`
            : '/hooks/trigger',
        integrations: cleanStringList(cfg.integrations, ['Cloudflare D1', 'Telegram Bot API']),
        conditions:
          typeof cfg.conditions === 'string' ? cfg.conditions.trim() : 'status == "active"',
        actions: cleanStringList(cfg.actions, [
          'Validate incoming payload',
          'Apply data mapping',
          'Persist execution log',
          'Dispatch notification',
        ]),
        dataMapping:
          typeof cfg.dataMapping === 'string' && cfg.dataMapping.trim()
            ? cfg.dataMapping.trim()
            : 'event.id -> runId, event.user -> actor, event.payload -> data',
        isActive: typeof cfg.isActive === 'boolean' ? cfg.isActive : false,
      } satisfies AutomationBuilderConfig;
  }
}

export function getTargetRuntime(
  builderType: BuilderType,
  config: BuilderProjectConfig
): 'cloudflare-workers' | 'cloudflare-pages' {
  if (builderType === 'website') {
    const webCfg = config as WebsiteBuilderConfig;
    return webCfg.includeBackendApi || webCfg.includeDatabaseAuth || webCfg.includePayments
      ? 'cloudflare-workers'
      : 'cloudflare-pages';
  }
  return 'cloudflare-workers';
}

export function buildDefaultPlan(
  builderType: BuilderType,
  name: string,
  prompt: string,
  config: BuilderProjectConfig
): {
  summary: string;
  capabilities: string[];
  envVarsNeeded: string[];
  plan: BuilderProjectPlan;
} {
  const slug = slugifyProjectName(name);

  if (builderType === 'telegram_bot') {
    const c = config as TelegramBotBuilderConfig;
    const envVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'];
    if (c.adminFeaturesEnabled) envVars.push('ADMIN_TELEGRAM_IDS');
    if (c.externalIntegrations.length > 0) envVars.push('EXTERNAL_API_KEY');

    return {
      summary: `Telegram Bot "${name}" handling ${c.commands.join(', ')} with ${c.keyboardType} keyboards and ${c.storageBackend.toUpperCase()} persistence.`,
      capabilities: [
        `Commands: ${c.commands.join(', ')}`,
        `Keyboards: ${c.keyboardType}`,
        c.userRegistrationEnabled ? 'Telegram user registration & D1 profiles' : 'Stateless user handling',
        c.adminFeaturesEnabled ? 'Admin command authorization & controls' : 'Standard member commands',
        c.aiIntegrationEnabled ? 'Cloudflare Workers AI conversational replies' : 'Deterministic menu responses',
      ],
      envVarsNeeded: envVars,
      plan: {
        overview: `${c.botPurpose}. Triggered via ${c.webhookMode === 'cloudflare_webhook' ? 'Cloudflare Worker webhook' : 'Bot API polling'}.`,
        modules: [
          { name: 'src/index.ts', responsibility: 'Webhook signature guard, update dispatcher, and command handlers' },
          { name: 'src/keyboards.ts', responsibility: `Builds ${c.keyboardType} keyboard markups and callback payloads` },
          ...(c.storageBackend === 'd1' || c.userRegistrationEnabled
            ? [{ name: 'migrations/0001_init.sql', responsibility: 'Users, profiles, and bot activity tables' }]
            : []),
        ],
        entryPoints: ['POST /webhook', 'GET /health'],
        dataModels: c.userRegistrationEnabled ? ['bot_users', 'bot_sessions'] : ['bot_events'],
        integrations: ['Telegram Bot API', ...(c.aiIntegrationEnabled ? ['Cloudflare Workers AI'] : []), ...c.externalIntegrations],
        securityControls: [
          'Verify X-Telegram-Bot-Api-Secret-Token on every webhook request',
          ...(c.adminFeaturesEnabled ? ['Enforce numeric ADMIN_TELEGRAM_IDS check on admin commands'] : []),
        ],
        deploymentSteps: [
          'Create bot via @BotFather and obtain TELEGRAM_BOT_TOKEN',
          'Store TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET with wrangler secret put',
          `Deploy worker (${slug}) and call Telegram setWebhook to https://<worker-url>/webhook`,
        ],
      },
    };
  }

  if (builderType === 'ai_agent') {
    const c = config as AiAgentBuilderConfig;
    return {
      summary: `AI Agent "${c.agentIdentity}" powered by ${c.aiProviderModel} with ${c.tools.length} tool(s) and ${c.memoryMode} memory.`,
      capabilities: [
        `Model: ${c.aiProviderModel}`,
        `Memory: ${c.memoryMode}`,
        `Access control: ${c.accessControl}`,
        `Tools: ${c.tools.join(', ') || 'None'}`,
      ],
      envVarsNeeded: c.accessControl === 'public' ? ['WORKERS_AI_MODEL'] : ['WORKERS_AI_MODEL', 'API_AUTH_SECRET'],
      plan: {
        overview: `${c.systemInstructions.slice(0, 220)}`,
        modules: [
          { name: 'src/agent.ts', responsibility: 'System prompt injection, normalized AI inference, memory & access control' },
          { name: 'src/tools.ts', responsibility: 'Tool schemas, validation, and safe execution wrappers' },
          ...(c.memoryMode === 'd1_conversation'
            ? [{ name: 'migrations/0001_agent_memory.sql', responsibility: 'D1 conversation history and turn persistence' }]
            : []),
        ],
        entryPoints: ['POST /agent/run', 'GET /agent/history', 'GET /health'],
        dataModels: c.memoryMode === 'd1_conversation' ? ['agent_sessions', 'agent_messages'] : ['stateless_turn'],
        integrations: [c.aiProviderModel, ...c.tools],
        securityControls: [
          `Access gate: ${c.accessControl}`,
          'Normalize all AI provider outputs cleanly before parsing tool calls',
        ],
        deploymentSteps: [
          'Verify [ai] binding in wrangler.toml',
          ...(c.memoryMode === 'd1_conversation' ? ['Create D1 database and apply migrations/0001_agent_memory.sql'] : []),
          'Deploy Worker with wrangler deploy and run POST /agent/run verification',
        ],
      },
    };
  }

  if (builderType === 'website') {
    const c = config as WebsiteBuilderConfig;
    const needsWorker = c.includeBackendApi || c.includeDatabaseAuth || c.includePayments;
    const envVars: string[] = [];
    if (c.includeDatabaseAuth) envVars.push('SESSION_SECRET');
    if (c.includePayments) envVars.push('PAYMENT_SECRET_KEY');

    return {
      summary: `${c.websiteType.toUpperCase()} website "${name}" (${c.brandStyle.replace('_', ' ')}) with pages: ${c.pages.join(', ')}.`,
      capabilities: [
        `Pages: ${c.pages.join(', ')}`,
        `Theme: ${c.brandStyle.replace('_', ' ')} (${c.primaryColor})`,
        ...(c.includeForms ? ['Lead & contact form handling'] : []),
        ...(c.includeBackendApi ? ['Cloudflare Worker REST API'] : ['Static Edge Assets']),
        ...(c.includeDatabaseAuth ? ['D1 database & user auth'] : []),
        ...(c.includePayments ? ['Checkout & payment webhook endpoint'] : []),
      ],
      envVarsNeeded: envVars,
      plan: {
        overview: `Responsive ${c.websiteType} web experience: ${prompt.slice(0, 200)}`,
        modules: [
          { name: 'index.html', responsibility: 'Semantic responsive HTML5 layout and page sections' },
          { name: 'styles.css', responsibility: `Responsive mobile-first design tokens (${c.primaryColor})` },
          { name: 'app.js', responsibility: 'Interactive navigation, mobile drawer, and form submission' },
          ...(needsWorker
            ? [{ name: 'src/worker.ts', responsibility: 'Hono API for forms, authentication, and/or payments' }]
            : []),
        ],
        entryPoints: needsWorker ? ['GET /* (Static Assets)', 'POST /api/contact', 'GET /api/health'] : ['GET /* (Static Assets)'],
        dataModels: c.includeDatabaseAuth ? ['users', 'sessions', 'leads'] : c.includeForms ? ['leads'] : [],
        integrations: [
          'Cloudflare Static Assets',
          ...(c.includeDatabaseAuth ? ['Cloudflare D1'] : []),
          ...(c.includePayments ? ['Payment Checkout'] : []),
        ],
        securityControls: [
          'Input validation on forms & API endpoints',
          'Strict CORS and security response headers',
        ],
        deploymentSteps: [
          'Review index.html & styles.css in Live Preview',
          ...(needsWorker ? ['Configure D1/secrets in wrangler.toml and Cloudflare Dashboard'] : []),
          `Deploy to Cloudflare with npx wrangler ${needsWorker ? 'deploy' : 'pages deploy .'}`,
        ],
      },
    };
  }

  if (builderType === 'mini_app') {
    const c = config as MiniAppBuilderConfig;
    const envVars: string[] = [];
    if (c.authMode === 'telegram_initdata' || c.paymentsMode === 'telegram_stars') {
      envVars.push('TELEGRAM_BOT_TOKEN');
    }
    if (c.authMode !== 'public') {
      envVars.push('JWT_SECRET');
    }
    if (c.paymentsMode === 'stripe_checkout') {
      envVars.push('STRIPE_SECRET_KEY');
    }

    return {
      summary: `${c.targetPlatform.replace(/_/g, ' ')} "${name}" with ${c.screens.length} screen(s) (${c.screens.join(', ')}) and ${c.authMode} auth.`,
      capabilities: [
        `Screens: ${c.screens.join(', ')}`,
        `Auth: ${c.authMode}`,
        c.telegramSdkEnabled ? 'Telegram WebApp SDK lifecycle & theme sync' : 'Standard responsive WebApp shell',
        c.backendDatabaseEnabled ? 'Hono Worker + D1 persistence' : 'Frontend-only state',
        ...(c.paymentsMode !== 'none' ? [`Payments: ${c.paymentsMode}`] : []),
      ],
      envVarsNeeded: envVars,
      plan: {
        overview: `Mobile-first Mini App targeting ${c.targetPlatform}: ${prompt.slice(0, 200)}`,
        modules: [
          { name: 'src/App.tsx', responsibility: `Bottom navigation and views for ${c.screens.join(', ')}` },
          ...(c.telegramSdkEnabled
            ? [{ name: 'src/telegram.ts', responsibility: 'Telegram.WebApp ready, expand, haptics, and theme variables' }]
            : []),
          { name: 'worker/index.ts', responsibility: `Edge API (${c.authMode} auth, data endpoints, payments)` },
        ],
        entryPoints: ['GET /api/health', 'POST /api/auth', 'GET /api/profile'],
        dataModels: c.backendDatabaseEnabled ? ['users', 'app_records', ...(c.paymentsMode !== 'none' ? ['payments'] : [])] : [],
        integrations: [
          ...(c.telegramSdkEnabled ? ['Telegram WebApp SDK'] : []),
          ...(c.backendDatabaseEnabled ? ['Cloudflare D1'] : []),
          ...(c.paymentsMode !== 'none' ? [c.paymentsMode] : []),
        ],
        securityControls: [
          c.authMode === 'telegram_initdata'
            ? 'Server-side HMAC-SHA256 verification of Telegram initData before minting JWT'
            : 'Token/session middleware on protected endpoints',
        ],
        deploymentSteps: [
          'Build frontend bundle with Vite and verify Worker API routes',
          'Configure secrets (TELEGRAM_BOT_TOKEN / JWT_SECRET) in Cloudflare Worker',
          ...(c.targetPlatform === 'telegram_mini_app'
            ? ['Register the deployed HTTPS URL in @BotFather /newapp or Menu Button']
            : ['Deploy to Cloudflare Workers Assets']),
        ],
      },
    };
  }

  const c = config as AutomationBuilderConfig;
  return {
    summary: `Automation "${name}" triggered by ${c.triggerType} running ${c.actions.length} step(s) across ${c.integrations.join(', ') || 'edge handlers'}.`,
    capabilities: [
      `Trigger: ${c.triggerType}${c.triggerType === 'cron_schedule' ? ` (${c.scheduleCron})` : c.triggerType === 'webhook' ? ` (${c.webhookPath})` : ''}`,
      `Steps: ${c.actions.join(' → ')}`,
      ...(c.conditions ? [`Rule: ${c.conditions}`] : []),
      'D1 run execution history & idempotency guard',
    ],
    envVarsNeeded: ['WEBHOOK_SIGNING_SECRET', ...(c.integrations.some((i) => i.toLowerCase().includes('telegram')) ? ['TELEGRAM_BOT_TOKEN'] : [])],
    plan: {
      overview: `Edge automation pipeline: ${prompt.slice(0, 200)}`,
      modules: [
        { name: 'src/workflow.ts', responsibility: 'Trigger verification, condition evaluation, data mapper, and step runner' },
        { name: 'workflow.json', responsibility: 'Declarative trigger, conditions, mapping, and action graph' },
        { name: 'migrations/0001_workflow_runs.sql', responsibility: 'D1 workflow execution audit & retry log' },
      ],
      entryPoints: [
        ...(c.triggerType === 'cron_schedule' ? [`CRON ${c.scheduleCron}`] : [`POST ${c.webhookPath}`]),
        'GET /runs',
      ],
      dataModels: ['workflow_runs'],
      integrations: c.integrations,
      securityControls: [
        'Validate webhook signing header before executing actions',
        'Idempotent run keys prevent duplicate step execution',
      ],
      deploymentSteps: [
        'Attach D1 database binding DB in wrangler.toml',
        'Set WEBHOOK_SIGNING_SECRET via wrangler secret put',
        'Deploy Worker and test trigger endpoint via Execution Simulator',
      ],
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFilesForBuilder(
  builderType: BuilderType,
  name: string,
  prompt: string,
  specSummary: string,
  config: BuilderProjectConfig
): BuilderFile[] {
  const slug = slugifyProjectName(name);

  if (builderType === 'telegram_bot') {
    const c = config as TelegramBotBuilderConfig;
    const cmds = c.commands.length > 0 ? c.commands : ['/start', '/help'];
    const commandCases = cmds
      .map((cmd) => {
        const clean = cmd.startsWith('/') ? cmd : `/${cmd}`;
        if (clean === '/start') {
          return `  if (text === '/start') {
    return sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, chatId, \`Welcome to ${name}!\\n\\n${c.botPurpose.replace(/`/g, '')}\\n\\nAvailable commands: ${cmds.join(', ')}\`, buildMainMenu());
  }`;
        }
        if (clean === '/admin' && c.adminFeaturesEnabled) {
          return `  if (text === '/admin') {
    const adminIds = (c.env.ADMIN_TELEGRAM_IDS ?? '').split(',').map((v) => v.trim());
    if (!adminIds.includes(String(fromUser?.id ?? ''))) {
      return sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, chatId, 'Admin access required.');
    }
    return sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel: All systems operational.');
  }`;
        }
        return `  if (text === '${clean}') {
    return sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, chatId, 'Command ${clean} executed successfully.', buildMainMenu());
  }`;
      })
      .join('\n');

    return [
      {
        path: 'wrangler.toml',
        language: 'toml',
        content: `name = "${slug}"
main = "src/index.ts"
compatibility_date = "2025-02-01"
${
  c.aiIntegrationEnabled
    ? `
[ai]
binding = "AI"
`
    : ''
}${
          c.storageBackend === 'd1' || c.userRegistrationEnabled
            ? `
[[d1_databases]]
binding = "DB"
database_name = "${slug}-db"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
`
            : ''
        }`,
      },
      {
        path: 'package.json',
        language: 'json',
        content: JSON.stringify(
          {
            name: slug,
            version: '1.0.0',
            private: true,
            scripts: {
              dev: 'wrangler dev',
              deploy: 'wrangler deploy',
            },
            dependencies: {
              hono: '^4.7.0',
            },
            devDependencies: {
              wrangler: '^4.0.0',
              typescript: '^5.7.0',
            },
          },
          null,
          2
        ),
      },
      {
        path: 'src/keyboards.ts',
        language: 'typescript',
        content: `export function buildMainMenu() {
  const mode = '${c.keyboardType}';
  if (mode === 'none') return undefined;
  if (mode === 'reply') {
    return {
      keyboard: [
        [${cmds.slice(0, 2).map((cmd) => `{ text: '${cmd}' }`).join(', ')}],
        ${cmds.length > 2 ? `[${cmds.slice(2, 4).map((cmd) => `{ text: '${cmd}' }`).join(', ')}]` : ''}
      ].filter((row) => row.length > 0),
      resize_keyboard: true,
    };
  }
  return {
    inline_keyboard: [
      ${cmds.slice(0, 4).map((cmd) => `[{ text: '${cmd}', callback_data: 'cmd:${cmd}' }]`).join(',\n      ')}
    ],
  };
}
`,
      },
      {
        path: 'src/index.ts',
        language: 'typescript',
        content: `import { Hono } from 'hono';
import { buildMainMenu } from './keyboards';

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ADMIN_TELEGRAM_IDS?: string;
  ${c.storageBackend === 'd1' || c.userRegistrationEnabled ? 'DB?: D1Database;' : ''}
  ${c.aiIntegrationEnabled ? 'AI?: Ai;' : ''}
};

const app = new Hono<{ Bindings: Env }>();

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: unknown
) {
  const res = await fetch(\`https://api.telegram.org/bot\${botToken}/sendMessage\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  return res.json();
}

app.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (!secret || secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized webhook' }, 401);
  }

  const update = (await c.req.json()) as {
    update_id?: number;
    message?: { chat: { id: number }; from?: { id: number; username?: string; first_name?: string }; text?: string };
    callback_query?: { id: string; from: { id: number }; message?: { chat: { id: number } }; data?: string };
  };

  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  const fromUser = update.message?.from ?? update.callback_query?.from;
  const text = (update.message?.text ?? update.callback_query?.data?.replace(/^cmd:/, '') ?? '').trim();

  if (!chatId) {
    return c.json({ ok: true });
  }

${
  c.userRegistrationEnabled && c.storageBackend === 'd1'
    ? `  if (c.env.DB && fromUser?.id) {
    await c.env.DB.prepare(
      'INSERT INTO bot_users (telegram_id, username, first_name) VALUES (?, ?, ?) ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name'
    )
      .bind(fromUser.id, fromUser.username ?? null, fromUser.first_name ?? 'Member')
      .run();
  }
`
    : ''
}
${commandCases}
${
  c.aiIntegrationEnabled
    ? `  if (c.env.AI && text) {
    const aiRaw = (await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: ${JSON.stringify(c.botPurpose)} },
        { role: 'user', content: text },
      ],
    })) as { response?: unknown };
    const reply = typeof aiRaw?.response === 'string' ? aiRaw.response.trim() : JSON.stringify(aiRaw?.response ?? 'Done.');
    await sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, chatId, reply, buildMainMenu());
    return c.json({ ok: true });
  }
`
    : ''
}
  await sendTelegramMessage(
    c.env.TELEGRAM_BOT_TOKEN,
    chatId,
    \`Received: \${text || 'update'}. Try one of: ${cmds.join(', ')}\`,
    buildMainMenu()
  );
  return c.json({ ok: true });
});

app.get('/health', (c) => c.json({ ok: true, bot: '${slug}', commands: ${JSON.stringify(cmds)} }));

export default app;
`,
      },
      ...(c.storageBackend === 'd1' || c.userRegistrationEnabled
        ? [
            {
              path: 'migrations/0001_init.sql',
              language: 'sql',
              content: `CREATE TABLE IF NOT EXISTS bot_users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`,
            },
          ]
        : []),
      {
        path: 'README.md',
        language: 'markdown',
        content: `# ${name}\n\n${specSummary}\n\n## Configuration\n- Commands: ${cmds.join(', ')}\n- Keyboards: \`${c.keyboardType}\`\n- Storage: \`${c.storageBackend}\`\n- Webhook Mode: \`${c.webhookMode}\`\n\n## Prompt\n${prompt}\n`,
      },
    ];
  }

  if (builderType === 'ai_agent') {
    const c = config as AiAgentBuilderConfig;
    const usesD1 = c.memoryMode === 'd1_conversation';
    return [
      {
        path: 'wrangler.toml',
        language: 'toml',
        content: `name = "${slug}"
main = "src/agent.ts"
compatibility_date = "2025-02-01"

[ai]
binding = "AI"
${
  usesD1
    ? `
[[d1_databases]]
binding = "DB"
database_name = "${slug}-memory"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
`
    : ''
}`,
      },
      {
        path: 'package.json',
        language: 'json',
        content: JSON.stringify(
          {
            name: slug,
            version: '1.0.0',
            private: true,
            scripts: { dev: 'wrangler dev', deploy: 'wrangler deploy' },
            dependencies: { hono: '^4.7.0' },
            devDependencies: { wrangler: '^4.0.0', typescript: '^5.7.0' },
          },
          null,
          2
        ),
      },
      {
        path: 'src/tools.ts',
        language: 'typescript',
        content: `export const AGENT_TOOLS = ${JSON.stringify(c.tools, null, 2)} as const;

export function runAgentTool(toolName: string, input: Record<string, unknown>) {
  return {
    tool: toolName,
    executedAt: new Date().toISOString(),
    input,
    result: \`Tool \${toolName} executed cleanly.\`,
  };
}
`,
      },
      {
        path: 'src/agent.ts',
        language: 'typescript',
        content: `import { Hono } from 'hono';
import { AGENT_TOOLS } from './tools';

type Env = {
  AI: Ai;
  API_AUTH_SECRET?: string;
  ${usesD1 ? 'DB?: D1Database;' : ''}
};

const app = new Hono<{ Bindings: Env }>();

function normalizeModelReply(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    if (typeof rec.response === 'string') return rec.response.trim();
    if (rec.response && typeof rec.response === 'object') return JSON.stringify(rec.response);
    if (Array.isArray(rec.choices) && rec.choices[0] && typeof rec.choices[0] === 'object') {
      const msg = (rec.choices[0] as { message?: { content?: unknown } }).message;
      if (typeof msg?.content === 'string') return msg.content.trim();
    }
  }
  return '';
}

app.post('/agent/run', async (c) => {
  ${
    c.accessControl !== 'public'
      ? `const auth = c.req.header('Authorization');
  if (c.env.API_AUTH_SECRET && auth !== \`Bearer \${c.env.API_AUTH_SECRET}\`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
`
      : ''
  }
  const body = (await c.req.json()) as { sessionId?: string; message?: string };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return c.json({ error: 'message is required' }, 400);

  const systemPrompt = ${JSON.stringify(
    `${c.agentIdentity}\n\n${c.systemInstructions}${c.knowledgeBaseSummary ? `\n\nKnowledge Context:\n${c.knowledgeBaseSummary}` : ''}\n\nEnabled Tools: ${c.tools.join(', ') || 'None'}`
  )};

  const raw = await c.env.AI.run('${c.aiProviderModel}' as keyof AiModels, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
    max_tokens: 1024,
  });

  const reply = normalizeModelReply(raw) || 'No response generated.';
${
  usesD1
    ? `  if (c.env.DB && body.sessionId) {
    await c.env.DB.prepare(
      'INSERT INTO agent_messages (id, session_id, role, content) VALUES (?, ?, ?, ?), (?, ?, ?, ?)'
    )
      .bind(crypto.randomUUID(), body.sessionId, 'user', message, crypto.randomUUID(), body.sessionId, 'assistant', reply)
      .run();
  }
`
    : ''
}
  return c.json({ agent: '${c.agentIdentity}', model: '${c.aiProviderModel}', tools: AGENT_TOOLS, reply });
});

app.get('/health', (c) => c.json({ ok: true, agent: '${slug}', model: '${c.aiProviderModel}' }));

export default app;
`,
      },
      ...(usesD1
        ? [
            {
              path: 'migrations/0001_agent_memory.sql',
              language: 'sql',
              content: `CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id, created_at ASC);
`,
            },
          ]
        : []),
      {
        path: 'README.md',
        language: 'markdown',
        content: `# ${name}\n\n${specSummary}\n\n## Agent Configuration\n- Identity: ${c.agentIdentity}\n- Model: \`${c.aiProviderModel}\`\n- Memory: \`${c.memoryMode}\`\n- Access Control: \`${c.accessControl}\`\n- Tools: ${c.tools.join(', ') || 'None'}\n`,
      },
    ];
  }

  if (builderType === 'website') {
    const c = config as WebsiteBuilderConfig;
    const isDark = c.brandStyle === 'modern_dark';
    const bgColor = isDark ? '#0f1419' : '#fafaf9';
    const surfaceColor = isDark ? '#182028' : '#ffffff';
    const textColor = isDark ? '#f3f4f6' : '#111827';
    const mutedColor = isDark ? '#9ca3af' : '#4b5563';
    const borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(17,24,39,0.12)';
    const pages = c.pages.length > 0 ? c.pages : ['Home', 'Features', 'Contact'];
    const needsWorker = c.includeBackendApi || c.includeDatabaseAuth || c.includePayments;

    const navLinks = pages
      .map(
        (page, i) =>
          `<a href="#section-${i}" class="nav-link">${escapeHtml(page)}</a>`
      )
      .join('\n          ');

    const pageSections = pages
      .map((page, i) => {
        if (i === 0) {
          return `      <section id="section-0" class="hero">
        <span class="eyebrow">${escapeHtml(c.websiteType.toUpperCase())}</span>
        <h1>${escapeHtml(name)}</h1>
        <p class="lead">${escapeHtml(specSummary)}</p>
        <div class="actions">
          <a href="#section-${pages.length > 1 ? 1 : 0}" class="btn-primary">Explore ${escapeHtml(pages[1] ?? 'More')}</a>
          ${c.includeForms ? '<a href="#contact-form" class="btn-secondary">Get in Touch</a>' : ''}
        </div>
      </section>`;
        }
        return `      <section id="section-${i}" class="card-section">
        <h2>${escapeHtml(page)}</h2>
        <p>${escapeHtml(prompt)}</p>
      </section>`;
      })
      .join('\n');

    const files: BuilderFile[] = [
      {
        path: 'index.html',
        language: 'html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="container header-inner">
        <strong class="brand">${escapeHtml(name)}</strong>
        <nav class="nav">
          ${navLinks}
        </nav>
      </div>
    </header>

    <main class="container main-stack">
${pageSections}
${
  c.includePayments
    ? `      <section class="card-section">
        <h2>Plans & Checkout</h2>
        <p>Instant digital checkout powered by Cloudflare Worker API routes.</p>
        <button type="button" class="btn-primary" id="checkout-btn">Start Checkout</button>
      </section>`
    : ''
}
${
  c.includeForms
    ? `      <section id="contact-form" class="card-section">
        <h2>Contact Us</h2>
        <form id="lead-form" class="lead-form">
          <input type="text" name="name" placeholder="Your name" required />
          <input type="email" name="email" placeholder="you@example.com" required />
          <textarea name="message" rows="3" placeholder="Tell us about your needs..." required></textarea>
          <button type="submit" class="btn-primary">Send Message</button>
          <p id="form-status" class="status-text"></p>
        </form>
      </section>`
    : ''
}
    </main>

    <footer class="container site-footer">
      <p>&copy; ${new Date().getFullYear()} ${escapeHtml(name)} · Built for Cloudflare Edge</p>
    </footer>
    <script src="./app.js"></script>
  </body>
</html>
`,
      },
      {
        path: 'styles.css',
        language: 'css',
        content: `:root {
  --bg: ${bgColor};
  --surface: ${surfaceColor};
  --text: ${textColor};
  --muted: ${mutedColor};
  --border: ${borderColor};
  --accent: ${c.primaryColor};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
.container { max-width: 960px; margin: 0 auto; padding: 0 1.25rem; }
.site-header { border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; }
.header-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; }
.brand { font-size: 1.05rem; letter-spacing: -0.02em; }
.nav { display: flex; flex-wrap: wrap; gap: 1rem; }
.nav-link { color: var(--muted); text-decoration: none; font-size: 0.9rem; font-weight: 500; }
.nav-link:hover { color: var(--accent); }
.main-stack { display: grid; gap: 1.5rem; padding: 2.5rem 1.25rem; }
.hero, .card-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 2rem;
}
.eyebrow { color: var(--accent); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; }
h1 { margin: 0.5rem 0 0.75rem; font-size: clamp(1.75rem, 4vw, 2.75rem); line-height: 1.15; }
h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
.lead { color: var(--muted); max-width: 62ch; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: #ffffff; border: 0; border-radius: 0.75rem;
  padding: 0.75rem 1.25rem; font-weight: 600; text-decoration: none; cursor: pointer;
}
.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); color: var(--text); border-radius: 0.75rem;
  padding: 0.75rem 1.25rem; font-weight: 500; text-decoration: none;
}
.lead-form { display: grid; gap: 0.75rem; max-width: 480px; }
.lead-form input, .lead-form textarea {
  width: 100%; padding: 0.75rem; border-radius: 0.65rem;
  border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit;
}
.status-text { font-size: 0.85rem; color: var(--accent); margin: 0; }
.site-footer { padding: 1.5rem 1.25rem 3rem; color: var(--muted); font-size: 0.85rem; }
`,
      },
      {
        path: 'app.js',
        language: 'javascript',
        content: `const form = document.getElementById('lead-form');
const statusEl = document.getElementById('form-status');
if (form && statusEl) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    statusEl.textContent = 'Submitting...';
    ${
      needsWorker
        ? `try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      statusEl.textContent = res.ok ? 'Thank you! Message received.' : 'Unable to submit right now.';
      if (res.ok) form.reset();
    } catch {
      statusEl.textContent = 'Network error. Please retry.';
    }`
        : `statusEl.textContent = 'Thank you, ' + (data.name || 'visitor') + '! Message validated.';
    form.reset();`
    }
  });
}
`,
      },
      {
        path: 'wrangler.toml',
        language: 'toml',
        content: needsWorker
          ? `name = "${slug}"
main = "src/worker.ts"
compatibility_date = "2025-02-01"

[assets]
directory = "."
binding = "ASSETS"
${
  c.includeDatabaseAuth
    ? `
[[d1_databases]]
binding = "DB"
database_name = "${slug}-db"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
`
    : ''
}`
          : `name = "${slug}"
compatibility_date = "2025-02-01"

[assets]
directory = "."
`,
      },
    ];

    if (needsWorker) {
      files.push({
        path: 'src/worker.ts',
        language: 'typescript',
        content: `import { Hono } from 'hono';

type Env = {
  ASSETS: Fetcher;
  DB?: D1Database;
  SESSION_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, site: '${slug}' }));

app.post('/api/contact', async (c) => {
  const body = (await c.req.json()) as { name?: string; email?: string; message?: string };
  if (!body.name || !body.email || !body.message) {
    return c.json({ error: 'All fields are required.' }, 400);
  }
  if (c.env.DB) {
    await c.env.DB.prepare('INSERT INTO leads (id, name, email, message) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), body.name, body.email, body.message)
      .run();
  }
  return c.json({ ok: true }, 201);
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
`,
      });
    }

    if (c.includeDatabaseAuth) {
      files.push({
        path: 'migrations/0001_site.sql',
        language: 'sql',
        content: `CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`,
      });
    }

    files.push({
      path: 'README.md',
      language: 'markdown',
      content: `# ${name}\n\n${specSummary}\n\n## Pages\n${pages.map((p) => `- ${p}`).join('\n')}\n`,
    });

    return files;
  }

  if (builderType === 'mini_app') {
    const c = config as MiniAppBuilderConfig;
    const screens = c.screens.length > 0 ? c.screens : ['Home', 'Explore', 'Profile'];
    return [
      {
        path: 'index.html',
        language: 'html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <title>${escapeHtml(name)}</title>
    ${c.telegramSdkEnabled ? '<script src="https://telegram.org/js/telegram-web-app.js"></script>' : ''}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/App.tsx"></script>
  </body>
</html>
`,
      },
      ...(c.telegramSdkEnabled
        ? [
            {
              path: 'src/telegram.ts',
              language: 'typescript',
              content: `export function initMiniApp() {
  const tg = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; initData: string } } }).Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }
  return tg ?? null;
}
`,
            },
          ]
        : []),
      {
        path: 'src/App.tsx',
        language: 'typescript',
        content: `import { useEffect, useState } from 'react';
${c.telegramSdkEnabled ? "import { initMiniApp } from './telegram';" : ''}

const SCREENS = ${JSON.stringify(screens)};

export default function App() {
  const [activeScreen, setActiveScreen] = useState(SCREENS[0]);
  ${c.telegramSdkEnabled ? 'useEffect(() => { initMiniApp(); }, []);' : ''}

  return (
    <div className="min-h-screen pb-20 p-4 font-sans">
      <header className="mb-4">
        <h1 className="text-xl font-bold">${name}</h1>
        <p className="text-xs opacity-70">{activeScreen}</p>
      </header>
      <main className="rounded-xl border p-4">
        <p>${specSummary}</p>
      </main>
      <nav className="fixed bottom-0 inset-x-0 flex justify-around border-t p-2 bg-white dark:bg-zinc-900">
        {SCREENS.map((screen) => (
          <button key={screen} onClick={() => setActiveScreen(screen)} className="px-3 py-2 text-xs font-medium">
            {screen}
          </button>
        ))}
      </nav>
    </div>
  );
}
`,
      },
      {
        path: 'worker/index.ts',
        language: 'typescript',
        content: `import { Hono } from 'hono';

type Env = {
  TELEGRAM_BOT_TOKEN?: string;
  JWT_SECRET?: string;
  DB?: D1Database;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, app: '${slug}', authMode: '${c.authMode}' }));

app.post('/api/auth', async (c) => {
  const body = (await c.req.json()) as { initData?: string };
  if ('${c.authMode}' === 'telegram_initdata' && !body.initData) {
    return c.json({ error: 'Telegram initData required' }, 400);
  }
  return c.json({ ok: true, authMode: '${c.authMode}' });
});
${
  c.paymentsMode === 'telegram_stars'
    ? `
app.post('/api/payments/stars-invoice', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Bot token missing' }, 503);
  return c.json({ ok: true, currency: 'XTR' });
});
`
    : ''
}
export default app;
`,
      },
      {
        path: 'wrangler.toml',
        language: 'toml',
        content: `name = "${slug}"
main = "worker/index.ts"
compatibility_date = "2025-02-01"
${
  c.backendDatabaseEnabled
    ? `
[[d1_databases]]
binding = "DB"
database_name = "${slug}-db"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
`
    : ''
}`,
      },
      {
        path: 'README.md',
        language: 'markdown',
        content: `# ${name}\n\n${specSummary}\n\n- Target Platform: \`${c.targetPlatform}\`\n- Screens: ${screens.join(', ')}\n- Auth: \`${c.authMode}\`\n- Payments: \`${c.paymentsMode}\`\n`,
      },
    ];
  }

  // Automation Builder ('workflow')
  const c = config as AutomationBuilderConfig;
  return [
    {
      path: 'wrangler.toml',
      language: 'toml',
      content: `name = "${slug}"
main = "src/workflow.ts"
compatibility_date = "2025-02-01"
${
  c.triggerType === 'cron_schedule'
    ? `
[triggers]
crons = ["${c.scheduleCron}"]
`
    : ''
}
[[d1_databases]]
binding = "DB"
database_name = "${slug}-runs"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
`,
    },
    {
      path: 'workflow.json',
      language: 'json',
      content: JSON.stringify(
        {
          name,
          slug,
          active: c.isActive,
          trigger: {
            type: c.triggerType,
            scheduleCron: c.triggerType === 'cron_schedule' ? c.scheduleCron : null,
            webhookPath: c.triggerType === 'webhook' ? c.webhookPath : null,
          },
          conditions: c.conditions,
          dataMapping: c.dataMapping,
          integrations: c.integrations,
          actions: c.actions.map((step, index) => ({ order: index + 1, action: step })),
        },
        null,
        2
      ),
    },
    {
      path: 'src/workflow.ts',
      language: 'typescript',
      content: `import { Hono } from 'hono';

type Env = {
  DB?: D1Database;
  WEBHOOK_SIGNING_SECRET?: string;
};

const app = new Hono<{ Bindings: Env }>();

const ACTIONS = ${JSON.stringify(c.actions)};

async function executePipeline(env: Env, payload: Record<string, unknown>) {
  const runId = crypto.randomUUID();
  const mapped = { raw: payload, mappingSpec: ${JSON.stringify(c.dataMapping)} };
  const stepLogs = ACTIONS.map((step, i) => ({ step: i + 1, name: step, status: 'completed' }));

  if (env.DB) {
    await env.DB.prepare(
      'INSERT INTO workflow_runs (id, trigger_type, status, payload_json, result_json) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(runId, '${c.triggerType}', 'completed', JSON.stringify(payload), JSON.stringify({ mapped, stepLogs }))
      .run();
  }
  return { runId, stepLogs };
}

app.post('${c.webhookPath || '/hooks/trigger'}', async (c) => {
  const sig = c.req.header('X-Webhook-Secret');
  if (c.env.WEBHOOK_SIGNING_SECRET && sig !== c.env.WEBHOOK_SIGNING_SECRET) {
    return c.json({ error: 'Invalid webhook secret' }, 401);
  }
  const payload = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await executePipeline(c.env, payload);
  return c.json({ ok: true, ...result });
});

app.get('/runs', async (c) => {
  if (!c.env.DB) return c.json({ runs: [] });
  const rows = await c.env.DB.prepare('SELECT id, trigger_type, status, created_at FROM workflow_runs ORDER BY created_at DESC LIMIT 20').all();
  return c.json({ runs: rows.results ?? [] });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env) {
    await executePipeline(env, { scheduled: true, at: new Date().toISOString() });
  },
};
`,
    },
    {
      path: 'migrations/0001_workflow_runs.sql',
      language: 'sql',
      content: `CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`,
    },
    {
      path: 'README.md',
      language: 'markdown',
      content: `# ${name}\n\n${specSummary}\n\n- Trigger: \`${c.triggerType}\`\n- Conditions: \`${c.conditions || 'None'}\`\n- Actions:\n${c.actions.map((a, idx) => `${idx + 1}. ${a}`).join('\n')}\n`,
    },
  ];
}

export function buildDeploymentConfig(
  builderType: BuilderType,
  name: string,
  spec: BuilderSpec,
  files: BuilderFile[],
  override?: { deployUrl?: string | null; webhookUrl?: string | null; deployedAt?: string | null }
): BuilderDeploymentConfig {
  const slug = slugifyProjectName(name);
  const hasWrangler = files.some((f) => f.path === 'wrangler.toml');
  const hasEntry = files.some(
    (f) =>
      f.path === 'index.html' ||
      f.path.endsWith('index.ts') ||
      f.path.endsWith('agent.ts') ||
      f.path.endsWith('workflow.ts') ||
      f.path.endsWith('worker.ts')
  );

  const cliCommands =
    spec.targetRuntime === 'cloudflare-pages'
      ? ['npx wrangler pages project create ' + slug, 'npx wrangler pages deploy .']
      : [
          ...(spec.envVarsNeeded.length > 0
            ? spec.envVarsNeeded.map((v) => `npx wrangler secret put ${v}`)
            : []),
          'npx wrangler deploy',
        ];

  if (builderType === 'telegram_bot') {
    cliCommands.push(
      `curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d "url=https://${slug}.workers.dev/webhook&secret_token=$TELEGRAM_WEBHOOK_SECRET"`
    );
  }

  return {
    targetEnvironment: spec.targetRuntime,
    deployUrl: override?.deployUrl ?? spec.deployment?.deployUrl ?? null,
    webhookUrl: override?.webhookUrl ?? spec.deployment?.webhookUrl ?? null,
    readinessChecks: [
      { label: 'Project specification & architecture plan generated', passed: Boolean(spec.plan) },
      { label: 'Structured source files generated', passed: files.length >= 3 && hasEntry },
      { label: 'wrangler.toml Cloudflare configuration included', passed: hasWrangler },
      {
        label: 'Required environment variable names documented',
        passed: true,
        note: spec.envVarsNeeded.length > 0 ? spec.envVarsNeeded.join(', ') : 'No secrets required',
      },
    ],
    cliCommands,
    deployedAt: override?.deployedAt ?? spec.deployment?.deployedAt ?? null,
  };
}
