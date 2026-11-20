import {
  findIntegrationToolMeta,
  getIntegrationCategoryLabel,
  INTEGRATION_CATEGORIES,
  INTEGRATION_TOOLS_META,
  type IntegrationCategoryId,
  type IntegrationToolMeta,
} from '../../shared/integrationsRegistry.ts';
import type {
  AiToolExecutionSummary,
  IntegrationProvider,
  IntegrationStatus,
  PlatformUser,
} from '../../shared/types.ts';
import type { WorkerBindings } from '../types.ts';
import { decryptSecretValue, isPublicSafeHttpUrl } from './botTokenCrypto.ts';
import { logSystemEvent, scrubSensitiveText } from './monitoring.ts';

export interface AssistantDbIntegrationRow {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  name: string;
  endpoint_url: string | null;
  credentials_encrypted: string | null;
  config_json: string;
  status: IntegrationStatus;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantUserIntegration {
  row: AssistantDbIntegrationRow;
  toolId: string;
  name: string;
  categoryId: IntegrationCategoryId | 'custom';
  categoryLabel: string;
  websiteUrl: string;
  hasCredential: boolean;
  hasEndpointUrl: boolean;
  externalSetupCompleted: boolean;
  status: IntegrationStatus;
  lastError: string | null;
  lastTestedAt: string | null;
}

export interface WorkersAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AssistantToolArgs {
  action?: string;
  query?: string;
  path?: string;
  method?: 'GET' | 'POST';
  payload?: Record<string, unknown>;
  tool?: string;
  toolId?: string;
  categoryId?: string;
}

function safeParseConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function toToolFunctionName(toolId: string): string {
  const cleaned = toolId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `use_${cleaned}`;
}

function resolveCatalogMetaForRow(row: AssistantDbIntegrationRow): IntegrationToolMeta | undefined {
  const cfg = safeParseConfig(row.config_json);
  const cfgToolId = typeof cfg.toolId === 'string' ? cfg.toolId.trim() : '';
  if (cfgToolId) {
    const exact = findIntegrationToolMeta(cfgToolId);
    if (exact) return exact;
  }
  const byName = findIntegrationToolMeta(row.name);
  if (byName) return byName;

  if (row.provider === 'telegram_bot') {
    return findIntegrationToolMeta('telegram');
  }
  if (row.provider === 'openai_compatible') {
    return findIntegrationToolMeta('openai');
  }
  return undefined;
}

export async function loadUserIntegrationsForAssistant(
  db: D1Database,
  userId: string
): Promise<AssistantUserIntegration[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
              status, last_tested_at, last_error, created_at, updated_at
       FROM integrations
       WHERE user_id = ?
       ORDER BY updated_at DESC`
    )
    .bind(userId)
    .all<AssistantDbIntegrationRow>();

  return (result.results ?? []).map((row) => {
    const cfg = safeParseConfig(row.config_json);
    const meta = resolveCatalogMetaForRow(row);
    const toolId =
      (typeof cfg.toolId === 'string' && cfg.toolId.trim()) ||
      meta?.id ||
      row.id;
    const categoryId =
      meta?.categoryId ??
      (typeof cfg.categoryId === 'string'
        ? (cfg.categoryId as IntegrationCategoryId)
        : 'custom');
    const categoryLabel =
      categoryId === 'custom'
        ? 'Custom Integration'
        : getIntegrationCategoryLabel(categoryId);

    return {
      row,
      toolId,
      name: row.name || meta?.name || toolId,
      categoryId,
      categoryLabel,
      websiteUrl:
        (typeof cfg.websiteUrl === 'string' && cfg.websiteUrl) ||
        meta?.websiteUrl ||
        row.endpoint_url ||
        '',
      hasCredential: Boolean(row.credentials_encrypted && row.credentials_encrypted.length > 0),
      hasEndpointUrl: Boolean(row.endpoint_url && row.endpoint_url.trim().length > 0),
      externalSetupCompleted: Boolean(cfg.externalSetupCompleted),
      status: row.status,
      lastError: row.last_error,
      lastTestedAt: row.last_tested_at,
    };
  });
}

export function buildConnectedToolsSystemContext(
  integrations: AssistantUserIntegration[],
  user: PlatformUser
): string {
  const active = integrations.filter((item) => item.status !== 'disconnected');
  const tgScope = user.telegramId ? String(user.telegramId) : 'guest';
  const categoryList = INTEGRATION_CATEGORIES.map((c) => `${c.label} (${c.id})`).join(', ');

  const connectedSummary =
    active.length === 0
      ? 'None currently connected for this user.'
      : active
          .map((item) => {
            const authState = item.hasCredential
              ? 'encrypted credential stored'
              : item.hasEndpointUrl
                ? 'endpoint URL stored'
                : 'website setup marked connected (no API key/endpoint saved yet)';
            const errNote = item.lastError ? `, lastError="${scrubSensitiveText(item.lastError)}"` : '';
            return `- ${item.name} [toolId=${item.toolId}, fn=${toToolFunctionName(item.toolId)}, category=${item.categoryLabel}, status=${item.status}, ${authState}${errNote}]`;
          })
          .join('\n');

  return [
    'AFRINEX External Integrations & Tool Execution Policy:',
    `Current user scope: ${user.id} (Telegram user scope: ${tgScope}). Only this user's own Integrations & Connections rows are accessible.`,
    `Supported 10 Integration Categories: ${categoryList}.`,
    'User Connected Tools:',
    connectedSummary,
    'Strict Assistant Rules for External Tools:',
    '1. NEVER say "I am not capable of directly accessing external tools" or give generic manual copy-paste steps when a user asks about connected integrations.',
    '2. Whenever the user asks what tools are connected, or asks to inspect, query, verify, send, or fetch data from an external tool, CALL list_connected_tools, check_tool_connection, or the corresponding use_<tool> / execute_connected_tool function.',
    '3. If the user asks about a tool that is NOT connected for their account yet, clearly name which tool is not connected and direct them to Integrations & Connections -> Explore connections to connect it. Do NOT guess or fabricate external data.',
    '4. If a connected tool has no API key/endpoint saved yet (website setup only) or returns an HTTP/API error (401/403/404/network error), report the exact status or error message transparently without making up results.',
  ].join('\n');
}

export function buildAssistantToolDefinitions(
  integrations: AssistantUserIntegration[]
): WorkersAiToolDefinition[] {
  const active = integrations.filter((item) => item.status !== 'disconnected');
  const tools: WorkersAiToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'list_connected_tools',
        description:
          'List this user’s connected external integrations across all 10 AFRINEX categories, including connection status and whether API credentials or endpoints are configured.',
        parameters: {
          type: 'object',
          properties: {
            categoryId: {
              type: 'string',
              description:
                'Optional category filter: ai-ml, social, email, ecommerce, document, developer, productivity, crm-support, databases-analytics, or finance-payments.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_tool_connection',
        description:
          'Check whether a specific external tool across the 10 AFRINEX categories is connected for this user, inspect its status/error, or get its Integrations & Connections path.',
        parameters: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'Tool ID or display name (e.g. github, chapa, notion, perplexity, stripe, telegram).',
            },
          },
          required: ['tool'],
        },
      },
    },
  ];

  const seenFnNames = new Set<string>(['list_connected_tools', 'check_tool_connection', 'execute_connected_tool']);

  for (const item of active) {
    const fnName = toToolFunctionName(item.toolId);
    if (seenFnNames.has(fnName)) continue;
    seenFnNames.add(fnName);

    tools.push({
      type: 'function',
      function: {
        name: fnName,
        description: `Query or execute an action on this user's connected ${item.name} (${item.categoryLabel}) integration using their AES-256-GCM encrypted credentials.`,
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              description:
                'Action to perform: e.g. status, profile, list, search, query, verify, balance, scrape, or custom.',
            },
            query: {
              type: 'string',
              description:
                'Optional search query, repo (owner/name), URL, account ID, prompt, or filter string.',
            },
            path: {
              type: 'string',
              description: 'Optional relative API path or endpoint path override.',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST'],
              description: 'HTTP method (default GET).',
            },
            payload: {
              type: 'object',
              description: 'Optional JSON body for POST operations.',
            },
          },
        },
      },
    });
  }

  tools.push({
    type: 'function',
    function: {
      name: 'execute_connected_tool',
      description:
        'Execute a live backend query or action for any connected tool by toolId across all 10 AFRINEX categories.',
      parameters: {
        type: 'object',
        properties: {
          toolId: {
            type: 'string',
            description: 'Catalog tool ID or integration name (e.g. github, chapa, notion, stripe).',
          },
          action: { type: 'string', description: 'Operation name (status, profile, list, search, verify, custom).' },
          query: { type: 'string', description: 'Optional search term, repository, URL, or identifier.' },
          path: { type: 'string', description: 'Optional API relative path.' },
          method: { type: 'string', enum: ['GET', 'POST'] },
          payload: { type: 'object', description: 'Optional JSON payload for POST calls.' },
        },
        required: ['toolId'],
      },
    },
  });

  return tools;
}

function scrubOutputWithSecret(text: string, secret: string | null): string {
  let cleaned = scrubSensitiveText(text);
  if (secret && secret.trim().length >= 4) {
    cleaned = cleaned.split(secret.trim()).join('[REDACTED]');
  }
  return cleaned;
}

function truncateToolBody(raw: string, secret: string | null, limit = 3200): unknown {
  const scrubbed = scrubOutputWithSecret(raw, secret);
  try {
    const parsed = JSON.parse(scrubbed) as unknown;
    const serialized = JSON.stringify(parsed);
    if (serialized.length <= limit) {
      return parsed;
    }
    return {
      truncated: true,
      preview: serialized.slice(0, limit),
    };
  } catch {
    return scrubbed.length <= limit ? scrubbed : `${scrubbed.slice(0, limit)}... [truncated]`;
  }
}

async function safeExternalFetch(
  url: string,
  init: RequestInit,
  secretToScrub: string | null
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  if (!isPublicSafeHttpUrl(url)) {
    return {
      ok: false,
      status: 400,
      data: null,
      error: 'Blocked URL: only public http:// or https:// endpoints are permitted.',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller?.signal,
    });
    const rawText = await res.text();
    const safeData = rawText ? truncateToolBody(rawText, secretToScrub) : null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: safeData,
        error: `External API returned HTTP ${res.status}${typeof safeData === 'string' && safeData ? `: ${safeData.slice(0, 240)}` : ''}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      data: safeData,
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'Network error calling external integration.';
    return {
      ok: false,
      status: 0,
      data: null,
      error: scrubOutputWithSecret(rawMsg, secretToScrub),
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function joinBaseAndPath(baseUrl: string, relativePath?: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!relativePath || !relativePath.trim()) return base;
  const cleanRel = relativePath.trim();
  if (/^https?:\/\//i.test(cleanRel)) {
    return cleanRel;
  }
  return `${base}/${cleanRel.replace(/^\/+/, '')}`;
}

function encodeBasicBase64(userPass: string): string {
  return btoa(userPass);
}

async function runToolApiRequest(params: {
  toolId: string;
  integration: AssistantUserIntegration;
  secret: string | null;
  args: AssistantToolArgs;
}): Promise<{ ok: boolean; httpStatus?: number; endpoint?: string; result?: unknown; error?: string; notImplementedHandler?: boolean }> {
  const { toolId, integration, secret, args } = params;
  const endpointUrl = integration.row.endpoint_url?.trim() || null;
  const action = (args.action ?? '').trim().toLowerCase();
  const query = (args.query ?? '').trim();
  const path = (args.path ?? '').trim();
  const method = args.method === 'POST' ? 'POST' : 'GET';

  const defaultHeaders: Record<string, string> = {
    'User-Agent': 'AFRINEX-Assistant/1.0',
    Accept: 'application/json',
  };

  // Helper for tools requiring saved credentials
  const requireSecret = (): string | null => (secret && secret.trim() ? secret.trim() : null);

  switch (toolId) {
    // 1. AI & Machine Learning
    case 'perplexity': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Perplexity API key is missing in Integrations & Connections.' };
      const target = endpointUrl || 'https://api.perplexity.ai/chat/completions';
      const prompt = query || 'Give a brief status overview and summarize current capabilities.';
      const res = await safeExternalFetch(
        target.endsWith('/chat/completions') ? target : joinBaseAndPath(target, path || '/chat/completions'),
        {
          method: 'POST',
          headers: { ...defaultHeaders, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(
            args.payload ?? {
              model: 'sonar',
              messages: [{ role: 'user', content: prompt }],
            }
          ),
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'openai': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'OpenAI API key is missing in Integrations & Connections.' };
      const base = endpointUrl || 'https://api.openai.com/v1/models';
      const target =
        query && action !== 'list' && action !== 'status'
          ? base.replace(/\/models\/?$/, '/chat/completions')
          : path
            ? joinBaseAndPath(base, path)
            : base;
      const isChat = target.includes('/chat/completions');
      const res = await safeExternalFetch(
        target,
        isChat
          ? {
              method: 'POST',
              headers: { ...defaultHeaders, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(
                args.payload ?? {
                  model: 'gpt-4o-mini',
                  messages: [{ role: 'user', content: query || 'Health check' }],
                }
              ),
            }
          : { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'elevenlabs': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'ElevenLabs API key is missing in Integrations & Connections.' };
      const target = path
        ? joinBaseAndPath(endpointUrl || 'https://api.elevenlabs.io/v1', path)
        : action === 'user' || action === 'profile'
          ? 'https://api.elevenlabs.io/v1/user'
          : endpointUrl || 'https://api.elevenlabs.io/v1/voices';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, 'xi-api-key': key } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'mem0': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Mem0 API key is missing in Integrations & Connections.' };
      const useSearch = Boolean(query) || action === 'search';
      const target = useSearch
        ? 'https://api.mem0.ai/v1/memories/search/'
        : endpointUrl || 'https://api.mem0.ai/v1/memories/';
      const res = await safeExternalFetch(
        target,
        useSearch
          ? {
              method: 'POST',
              headers: { ...defaultHeaders, Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(args.payload ?? { query: query || 'preferences', user_id: integration.row.user_id }),
            }
          : { method: 'GET', headers: { ...defaultHeaders, Authorization: `Token ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'heygen': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'HeyGen API key is missing in Integrations & Connections.' };
      const target = endpointUrl || 'https://api.heygen.com/v2/avatars';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, 'X-Api-Key': key } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 2. Social Media
    case 'telegram': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Telegram Bot token is missing in Integrations & Connections.' };
      const methodName =
        action === 'webhook' || action === 'webhookinfo'
          ? 'getWebhookInfo'
          : action === 'updates'
            ? 'getUpdates'
            : 'getMe';
      const target = `https://api.telegram.org/bot${key}/${methodName}`;
      const res = await safeExternalFetch(target, { method: 'GET', headers: defaultHeaders }, key);
      return {
        ok: res.ok,
        httpStatus: res.status,
        endpoint: `https://api.telegram.org/bot[REDACTED]/${methodName}`,
        result: res.data,
        error: res.error,
      };
    }

    case 'x-twitter': {
      const key = requireSecret();
      if (endpointUrl) {
        const res = await safeExternalFetch(
          joinBaseAndPath(endpointUrl, path),
          {
            method,
            headers: {
              ...defaultHeaders,
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
              ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            },
            body: method === 'POST' ? JSON.stringify(args.payload ?? { query, action }) : undefined,
          },
          key
        );
        return { ok: res.ok, httpStatus: res.status, endpoint: endpointUrl, result: res.data, error: res.error };
      }
      if (!key) return { ok: false, error: 'X (Twitter) bearer token or webhook relay URL is missing.' };
      const target = query
        ? `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}`
        : 'https://api.x.com/2/users/me';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'youtube': {
      const key = requireSecret();
      if (endpointUrl) {
        const res = await safeExternalFetch(
          joinBaseAndPath(endpointUrl, path),
          {
            method,
            headers: {
              ...defaultHeaders,
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
              ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            },
            body: method === 'POST' ? JSON.stringify(args.payload ?? { query, action }) : undefined,
          },
          key
        );
        return { ok: res.ok, httpStatus: res.status, endpoint: endpointUrl, result: res.data, error: res.error };
      }
      if (!key) return { ok: false, error: 'YouTube API key/OAuth token or relay URL is missing.' };
      const target = query
        ? `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`
        : 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';
      const res = await safeExternalFetch(
        target,
        {
          method: 'GET',
          headers: query ? defaultHeaders : { ...defaultHeaders, Authorization: `Bearer ${key}` },
        },
        key
      );
      return {
        ok: res.ok,
        httpStatus: res.status,
        endpoint: 'https://www.googleapis.com/youtube/v3',
        result: res.data,
        error: res.error,
      };
    }

    // 3. Email
    case 'resend': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Resend API key is missing in Integrations & Connections.' };
      const target =
        action === 'emails' || action === 'list'
          ? 'https://api.resend.com/emails'
          : endpointUrl || 'https://api.resend.com/domains';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'mailchimp': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Mailchimp API key is missing in Integrations & Connections.' };
      const dcMatch = key.match(/-([a-z]{2}\d+)$/i);
      const dc = dcMatch ? dcMatch[1] : 'us21';
      const base = endpointUrl
        ? endpointUrl.replace(/\/ping\/?$/, '')
        : `https://${dc}.api.mailchimp.com/3.0`;
      const target =
        action === 'lists' || action === 'audiences'
          ? joinBaseAndPath(base, '/lists?count=10')
          : joinBaseAndPath(base, path || '/ping');
      const res = await safeExternalFetch(
        target,
        {
          method: 'GET',
          headers: { ...defaultHeaders, Authorization: `Basic ${encodeBasicBase64(`anystring:${key}`)}` },
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'brevo': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Brevo API key is missing in Integrations & Connections.' };
      const target =
        action === 'contacts' || action === 'list'
          ? 'https://api.brevo.com/v3/contacts?limit=10'
          : endpointUrl || 'https://api.brevo.com/v3/account';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, 'api-key': key } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 4. E-Commerce
    case 'shopify': {
      const key = requireSecret();
      if (!endpointUrl) {
        return {
          ok: false,
          error: 'Shopify store endpoint URL (e.g. https://your-store.myshopify.com/admin/api/2025-01/shop.json) is required.',
        };
      }
      const target =
        action === 'orders'
          ? endpointUrl.replace(/\/shop\.json$/, '/orders.json?limit=5&status=any')
          : action === 'products'
            ? endpointUrl.replace(/\/shop\.json$/, '/products.json?limit=5')
            : joinBaseAndPath(endpointUrl, path);
      const res = await safeExternalFetch(
        target,
        {
          method,
          headers: {
            ...defaultHeaders,
            ...(key ? { 'X-Shopify-Access-Token': key, Authorization: `Bearer ${key}` } : {}),
          },
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'woocommerce': {
      const key = requireSecret();
      if (!endpointUrl) {
        return { ok: false, error: 'WooCommerce store REST URL is required in Integrations & Connections.' };
      }
      const base = endpointUrl.replace(/\/system_status\/?$/, '');
      const target =
        action === 'orders'
          ? joinBaseAndPath(base, '/orders?per_page=5')
          : action === 'products'
            ? joinBaseAndPath(base, '/products?per_page=5')
            : path
              ? joinBaseAndPath(base, path)
              : endpointUrl;
      const authHeader = key
        ? key.includes(':')
          ? `Basic ${encodeBasicBase64(key)}`
          : `Bearer ${key}`
        : undefined;
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, ...(authHeader ? { Authorization: authHeader } : {}) } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 5. Document
    case 'notion': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Notion integration token is missing in Integrations & Connections.' };
      const useSearch = Boolean(query) || action === 'search' || action === 'list';
      const target = useSearch
        ? 'https://api.notion.com/v1/search'
        : endpointUrl || 'https://api.notion.com/v1/users/me';
      const res = await safeExternalFetch(
        target,
        useSearch
          ? {
              method: 'POST',
              headers: {
                ...defaultHeaders,
                Authorization: `Bearer ${key}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(args.payload ?? { query: query || undefined, page_size: 10 }),
            }
          : {
              method: 'GET',
              headers: { ...defaultHeaders, Authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28' },
            },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'dropbox': {
      const key = requireSecret();
      if (endpointUrl) {
        const res = await safeExternalFetch(
          joinBaseAndPath(endpointUrl, path),
          {
            method,
            headers: {
              ...defaultHeaders,
              ...(key ? { Authorization: `Bearer ${key}` } : {}),
              ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
            },
            body: method === 'POST' ? JSON.stringify(args.payload ?? { query, action }) : undefined,
          },
          key
        );
        return { ok: res.ok, httpStatus: res.status, endpoint: endpointUrl, result: res.data, error: res.error };
      }
      if (!key) return { ok: false, error: 'Dropbox access token or relay URL is missing.' };
      const target =
        action === 'list' || action === 'files'
          ? 'https://api.dropboxapi.com/2/files/list_folder'
          : 'https://api.dropboxapi.com/2/users/get_current_account';
      const res = await safeExternalFetch(
        target,
        {
          method: 'POST',
          headers: { ...defaultHeaders, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: action === 'list' || action === 'files' ? JSON.stringify({ path: path || '' }) : 'null',
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'google-drive': {
      const key = requireSecret();
      if (endpointUrl) {
        const res = await safeExternalFetch(
          joinBaseAndPath(endpointUrl, path),
          {
            method,
            headers: { ...defaultHeaders, ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          },
          key
        );
        return { ok: res.ok, httpStatus: res.status, endpoint: endpointUrl, result: res.data, error: res.error };
      }
      if (!key) return { ok: false, error: 'Google Drive OAuth token or Apps Script relay URL is missing.' };
      const qParam = query ? `&q=${encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}' and trashed = false`)}` : '';
      const target = `https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,modifiedTime)${qParam}`;
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: 'https://www.googleapis.com/drive/v3/files', result: res.data, error: res.error };
    }

    // 6. Developer Tools
    case 'github': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'GitHub Personal Access Token is missing in Integrations & Connections.' };
      let target = endpointUrl || 'https://api.github.com/user';
      if (path) {
        target = joinBaseAndPath('https://api.github.com', path);
      } else if (action === 'repos' || action === 'list') {
        target = 'https://api.github.com/user/repos?sort=updated&per_page=10';
      } else if (action === 'issues') {
        target = query && query.includes('/')
          ? `https://api.github.com/repos/${query}/issues?per_page=10`
          : 'https://api.github.com/issues?per_page=10';
      } else if (query) {
        target = query.includes('/')
          ? `https://api.github.com/repos/${query}`
          : `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`;
      }
      const res = await safeExternalFetch(
        target,
        {
          method: 'GET',
          headers: {
            ...defaultHeaders,
            Authorization: `Bearer ${key}`,
            Accept: 'application/vnd.github+json',
          },
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'cloudflare': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Cloudflare API token is missing in Integrations & Connections.' };
      const target =
        action === 'zones'
          ? 'https://api.cloudflare.com/client/v4/zones?per_page=10'
          : action === 'accounts'
            ? 'https://api.cloudflare.com/client/v4/accounts'
            : path
              ? joinBaseAndPath('https://api.cloudflare.com/client/v4', path)
              : endpointUrl || 'https://api.cloudflare.com/client/v4/user/tokens/verify';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'composio': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Composio API key is missing in Integrations & Connections.' };
      const target =
        action === 'accounts' || action === 'connections'
          ? 'https://backend.composio.dev/api/v1/connectedAccounts'
          : endpointUrl || 'https://backend.composio.dev/api/v1/apps';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, 'x-api-key': key } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'firecrawl': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Firecrawl API key is missing in Integrations & Connections.' };
      const isScrape = query && /^https?:\/\//i.test(query);
      const target = isScrape
        ? 'https://api.firecrawl.dev/v1/scrape'
        : endpointUrl || 'https://api.firecrawl.dev/v1/team/credit-usage';
      const res = await safeExternalFetch(
        target,
        isScrape
          ? {
              method: 'POST',
              headers: { ...defaultHeaders, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: query, formats: ['markdown'] }),
            }
          : { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'tavily': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Tavily API key is missing in Integrations & Connections.' };
      const target = endpointUrl || 'https://api.tavily.com/search';
      const res = await safeExternalFetch(
        target,
        {
          method: 'POST',
          headers: { ...defaultHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: key, query: query || 'African tech ecosystem news', max_results: 5 }),
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 7. Productivity & Booking
    case 'google-calendar': {
      const key = requireSecret();
      if (endpointUrl) {
        const res = await safeExternalFetch(
          joinBaseAndPath(endpointUrl, path),
          {
            method,
            headers: { ...defaultHeaders, ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          },
          key
        );
        return { ok: res.ok, httpStatus: res.status, endpoint: endpointUrl, result: res.data, error: res.error };
      }
      if (!key) return { ok: false, error: 'Google Calendar OAuth token or relay URL is missing.' };
      const nowIso = new Date().toISOString();
      const target = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(nowIso)}`;
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: 'https://www.googleapis.com/calendar/v3/calendars/primary/events', result: res.data, error: res.error };
    }

    case 'calendly': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Calendly token is missing in Integrations & Connections.' };
      const target =
        action === 'events'
          ? 'https://api.calendly.com/scheduled_events'
          : endpointUrl || 'https://api.calendly.com/users/me';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'linear': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Linear API key is missing in Integrations & Connections.' };
      if (endpointUrl && !endpointUrl.includes('linear.app')) {
        const res = await safeExternalFetch(
          joinBaseAndPath(endpointUrl, path),
          { method, headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
          key
        );
        return { ok: res.ok, httpStatus: res.status, endpoint: endpointUrl, result: res.data, error: res.error };
      }
      const target = 'https://api.linear.app/graphql';
      const gql =
        action === 'issues' || action === 'list' || query
          ? '{ viewer { id name } issues(first: 10) { nodes { identifier title state { name } priorityLabel } } }'
          : '{ viewer { id name email } }';
      const res = await safeExternalFetch(
        target,
        {
          method: 'POST',
          headers: { ...defaultHeaders, Authorization: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: gql }),
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'jira': {
      const key = requireSecret();
      if (!endpointUrl) {
        return { ok: false, error: 'Jira Cloud endpoint URL (e.g. https://your-domain.atlassian.net/rest/api/3/myself) is required.' };
      }
      const base = endpointUrl.replace(/\/rest\/api\/3\/.*$/, '');
      const target =
        action === 'issues' || action === 'search' || query
          ? `${base}/rest/api/3/search/jql?maxResults=10${query ? `&jql=${encodeURIComponent(query)}` : ''}`
          : path
            ? joinBaseAndPath(base, path)
            : endpointUrl;
      const authHeader = key
        ? key.includes(':')
          ? `Basic ${encodeBasicBase64(key)}`
          : `Bearer ${key}`
        : undefined;
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, ...(authHeader ? { Authorization: authHeader } : {}) } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'trello': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Trello API key/token is missing in Integrations & Connections.' };
      const target = endpointUrl || 'https://api.trello.com/1/members/me';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 8. CRM & Support
    case 'hubspot': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'HubSpot token is missing in Integrations & Connections.' };
      const target =
        action === 'deals'
          ? 'https://api.hubapi.com/crm/v3/objects/deals?limit=10'
          : endpointUrl || 'https://api.hubapi.com/crm/v3/objects/contacts?limit=10';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'freshdesk':
    case 'zendesk': {
      const key = requireSecret();
      if (!endpointUrl) {
        return { ok: false, error: `${integration.name} domain endpoint URL is required in Integrations & Connections.` };
      }
      const authHeader = key
        ? key.includes(':')
          ? `Basic ${encodeBasicBase64(key)}`
          : `Bearer ${key}`
        : undefined;
      const target = path ? joinBaseAndPath(endpointUrl, path) : endpointUrl;
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, ...(authHeader ? { Authorization: authHeader } : {}) } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'intercom': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Intercom access token is missing in Integrations & Connections.' };
      const target =
        action === 'conversations' || action === 'list'
          ? 'https://api.intercom.io/conversations?per_page=10'
          : endpointUrl || 'https://api.intercom.io/me';
      const res = await safeExternalFetch(
        target,
        {
          method: 'GET',
          headers: { ...defaultHeaders, Authorization: `Bearer ${key}`, 'Intercom-Version': '2.11' },
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 9. Databases & Analytics
    case 'supabase': {
      const key = requireSecret();
      if (!endpointUrl) {
        return { ok: false, error: 'Supabase REST endpoint URL (e.g. https://your-project.supabase.co/rest/v1/) is required.' };
      }
      if (!key) return { ok: false, error: 'Supabase API key is missing in Integrations & Connections.' };
      const target = joinBaseAndPath(endpointUrl, path || query);
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, apikey: key, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'airtable': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Airtable Personal Access Token is missing in Integrations & Connections.' };
      const target =
        action === 'bases' || action === 'list'
          ? 'https://api.airtable.com/v0/meta/bases'
          : path
            ? joinBaseAndPath('https://api.airtable.com/v0', path)
            : endpointUrl || 'https://api.airtable.com/v0/meta/whoami';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'posthog': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'PostHog API key is missing in Integrations & Connections.' };
      const target = endpointUrl || 'https://app.posthog.com/api/projects/@current/';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // 10. Finance & Payments
    case 'chapa': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Chapa Secret Key is missing in Integrations & Connections.' };
      const target =
        action === 'transactions' || action === 'list'
          ? 'https://api.chapa.co/v1/transactions'
          : query && action === 'verify'
            ? `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(query)}`
            : endpointUrl || 'https://api.chapa.co/v1/banks';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'paystack': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Paystack Secret Key is missing in Integrations & Connections.' };
      const target =
        action === 'transactions' || action === 'list'
          ? 'https://api.paystack.co/transaction?perPage=10'
          : action === 'balance'
            ? 'https://api.paystack.co/balance'
            : query && action === 'verify'
              ? `https://api.paystack.co/transaction/verify/${encodeURIComponent(query)}`
              : endpointUrl || 'https://api.paystack.co/bank?perPage=5';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'stripe': {
      const key = requireSecret();
      if (!key) return { ok: false, error: 'Stripe Secret Key is missing in Integrations & Connections.' };
      const target =
        action === 'charges' || action === 'payments' || action === 'list'
          ? 'https://api.stripe.com/v1/charges?limit=10'
          : action === 'customers'
            ? 'https://api.stripe.com/v1/customers?limit=10'
            : endpointUrl || 'https://api.stripe.com/v1/balance';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, Authorization: `Bearer ${key}` } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    case 'ton-wallet': {
      const key = requireSecret();
      const target =
        query && /^[A-Za-z0-9_-]{24,}$/.test(query)
          ? `https://tonapi.io/v2/accounts/${encodeURIComponent(query)}`
          : endpointUrl || 'https://tonapi.io/v2/status';
      const res = await safeExternalFetch(
        target,
        { method: 'GET', headers: { ...defaultHeaders, ...(key ? { Authorization: `Bearer ${key}` } : {}) } },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }

    // Relay/Webhook-based & Custom tools across all 10 categories:
    // (x-twitter fallback handled above; instagram, tiktok, linkedin, gmail, outlook-m365, custom-smtp,
    //  amazon, instacart, jiji-jumia, google-docs, confluence, zoho-desk, google-sheets, google-analytics, telebirr, custom)
    default: {
      const key = requireSecret();
      if (!endpointUrl) {
        return {
          ok: false,
          notImplementedHandler: true,
          error:
            toolId === 'custom-smtp'
              ? `${integration.name} requires an HTTP mail-relay endpoint URL (raw TCP SMTP/IMAP sockets are not exposed without a relay URL).`
              : `${integration.name} has no endpoint URL or live direct REST handler configured yet. Add a public relay/API endpoint URL in Integrations & Connections -> ${integration.name}.`,
        };
      }
      const target = path ? joinBaseAndPath(endpointUrl, path) : endpointUrl;
      const res = await safeExternalFetch(
        target,
        {
          method,
          headers: {
            ...defaultHeaders,
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          body:
            method === 'POST'
              ? JSON.stringify(args.payload ?? { action: action || 'query', query })
              : undefined,
        },
        key
      );
      return { ok: res.ok, httpStatus: res.status, endpoint: target, result: res.data, error: res.error };
    }
  }
}

export async function executeAssistantToolCall(params: {
  db: D1Database;
  env: WorkerBindings;
  user: PlatformUser;
  integrations: AssistantUserIntegration[];
  functionName: string;
  args: AssistantToolArgs;
}): Promise<{
  payload: Record<string, unknown>;
  summary?: AiToolExecutionSummary;
}> {
  const { db, env, user, integrations, functionName, args } = params;
  const normalizedFn = functionName.trim().toLowerCase();

  // 1. list_connected_tools
  if (normalizedFn === 'list_connected_tools') {
    const categoryFilter = typeof args.categoryId === 'string' ? args.categoryId.trim().toLowerCase() : '';
    const active = integrations.filter((item) => item.status !== 'disconnected');
    const filteredActive = categoryFilter
      ? active.filter((item) => item.categoryId === categoryFilter)
      : active;

    return {
      payload: {
        ok: true,
        userId: user.id,
        telegramScopeId: user.telegramId ? String(user.telegramId) : 'guest',
        connectedCount: filteredActive.length,
        connectedTools: filteredActive.map((item) => ({
          id: item.row.id,
          toolId: item.toolId,
          name: item.name,
          categoryId: item.categoryId,
          category: item.categoryLabel,
          functionName: toToolFunctionName(item.toolId),
          status: item.status,
          hasCredential: item.hasCredential,
          hasEndpointUrl: item.hasEndpointUrl,
          externalSetupCompleted: item.externalSetupCompleted,
          lastError: item.lastError ? scrubSensitiveText(item.lastError) : null,
          websiteUrl: item.websiteUrl,
        })),
        categories: INTEGRATION_CATEGORIES.map((cat) => ({
          id: cat.id,
          label: cat.label,
          connectedTools: active
            .filter((item) => item.categoryId === cat.id)
            .map((item) => item.name),
          availableCount: INTEGRATION_TOOLS_META.filter((t) => t.categoryId === cat.id).length,
        })),
      },
    };
  }

  // 2. check_tool_connection
  if (normalizedFn === 'check_tool_connection') {
    const requested = String(args.tool ?? args.toolId ?? '').trim();
    const meta = findIntegrationToolMeta(requested);
    const match = integrations.find(
      (item) =>
        item.status !== 'disconnected' &&
        (item.toolId.toLowerCase() === (meta?.id ?? requested.toLowerCase()) ||
          item.name.toLowerCase() === requested.toLowerCase())
    );

    if (!match) {
      return {
        payload: {
          ok: true,
          connected: false,
          toolId: meta?.id ?? requested.toLowerCase(),
          name: meta?.name ?? (requested || 'Unknown tool'),
          category: meta ? getIntegrationCategoryLabel(meta.categoryId) : 'Integrations & Connections',
          websiteUrl: meta?.websiteUrl ?? null,
          instructions:
            'This tool is NOT connected for this user yet. Tell the user clearly that it is not connected and direct them to Integrations & Connections -> Explore connections to connect it.',
        },
        summary: {
          toolId: meta?.id ?? requested,
          name: meta?.name ?? requested,
          status: 'not_connected',
        },
      };
    }

    return {
      payload: {
        ok: true,
        connected: true,
        toolId: match.toolId,
        name: match.name,
        category: match.categoryLabel,
        functionName: toToolFunctionName(match.toolId),
        status: match.status,
        hasCredential: match.hasCredential,
        hasEndpointUrl: match.hasEndpointUrl,
        externalSetupCompleted: match.externalSetupCompleted,
        lastError: match.lastError ? scrubSensitiveText(match.lastError) : null,
        websiteUrl: match.websiteUrl,
      },
    };
  }

  // 3. Per-tool invocation (use_<toolId> or execute_connected_tool)
  const targetLookup =
    normalizedFn === 'execute_connected_tool'
      ? String(args.toolId ?? args.tool ?? '').trim()
      : normalizedFn.startsWith('use_')
        ? normalizedFn.slice('use_'.length)
        : normalizedFn;

  const catalogMeta = findIntegrationToolMeta(targetLookup);
  const resolvedToolId = catalogMeta?.id ?? targetLookup.replace(/_/g, '-');

  const integration = integrations.find(
    (item) =>
      item.status !== 'disconnected' &&
      (item.toolId.toLowerCase() === resolvedToolId.toLowerCase() ||
        toToolFunctionName(item.toolId) === normalizedFn ||
        item.row.id.toLowerCase() === targetLookup.toLowerCase() ||
        item.name.toLowerCase() === targetLookup.toLowerCase())
  );

  if (!integration || integration.row.user_id !== user.id) {
    const toolName = catalogMeta?.name ?? (targetLookup || 'Requested tool');
    return {
      payload: {
        ok: false,
        connected: false,
        toolId: resolvedToolId,
        name: toolName,
        category: catalogMeta ? getIntegrationCategoryLabel(catalogMeta.categoryId) : undefined,
        websiteUrl: catalogMeta?.websiteUrl,
        error: `${toolName} is not connected for your account. Open Integrations & Connections -> Explore connections to connect ${toolName}.`,
      },
      summary: {
        toolId: resolvedToolId,
        name: toolName,
        status: 'not_connected',
      },
    };
  }

  // Re-verify ownership directly from D1 row before decryption
  const ownedRow = await db
    .prepare(
      `SELECT id, user_id, provider, name, endpoint_url, credentials_encrypted, config_json,
              status, last_tested_at, last_error, created_at, updated_at
       FROM integrations
       WHERE id = ? AND user_id = ?`
    )
    .bind(integration.row.id, user.id)
    .first<AssistantDbIntegrationRow>();

  if (!ownedRow || ownedRow.status === 'disconnected') {
    return {
      payload: {
        ok: false,
        connected: false,
        toolId: integration.toolId,
        name: integration.name,
        error: `${integration.name} is disconnected. Reconnect it in Integrations & Connections.`,
      },
      summary: {
        toolId: integration.toolId,
        name: integration.name,
        status: 'not_connected',
      },
    };
  }

  // Decrypt credentials strictly inside the backend for this user only
  let decryptedSecret: string | null = null;
  if (ownedRow.credentials_encrypted) {
    try {
      decryptedSecret = await decryptSecretValue(
        ownedRow.credentials_encrypted,
        env.BOT_TOKEN_ENCRYPTION_KEY,
        `integration:${ownedRow.id}`
      );
    } catch (err) {
      const errMsg = scrubSensitiveText(
        err instanceof Error ? err.message : 'Credential decryption failed.'
      );
      return {
        payload: {
          ok: false,
          connected: true,
          status: 'error',
          toolId: integration.toolId,
          name: integration.name,
          error: `Could not decrypt saved credentials for ${integration.name}: ${errMsg}. Ask the user to re-save their API key in Integrations & Connections.`,
        },
        summary: {
          toolId: integration.toolId,
          name: integration.name,
          status: 'error',
        },
      };
    }
  }

  // Handle website-only status completion where neither key nor endpoint was saved yet
  if (!decryptedSecret && !ownedRow.endpoint_url && integration.toolId !== 'ton-wallet') {
    return {
      payload: {
        ok: false,
        connected: true,
        status: ownedRow.status,
        externalSetupCompleted: integration.externalSetupCompleted,
        needsCredentialsOrEndpoint: true,
        toolId: integration.toolId,
        name: integration.name,
        websiteUrl: integration.websiteUrl,
        error: `${integration.name} is marked connected after website setup, but no API key/token or endpoint URL is saved yet. Direct the user to Integrations & Connections -> ${integration.name} -> Manage Credentials to paste their key or relay URL so AFRINEX AI can query it live.`,
      },
      summary: {
        toolId: integration.toolId,
        name: integration.name,
        status: 'error',
      },
    };
  }

  const execution = await runToolApiRequest({
    toolId: integration.toolId,
    integration,
    secret: decryptedSecret,
    args,
  });

  if (!execution.ok) {
    await logSystemEvent(db, {
      level: 'warn',
      category: 'integration',
      eventName: 'assistant.integration_tool_failed',
      message: execution.error ?? 'Integration tool call failed.',
      userId: user.id,
      statusCode: execution.httpStatus,
      metadata: {
        integrationId: ownedRow.id,
        toolId: integration.toolId,
      },
    });

    return {
      payload: {
        ok: false,
        connected: true,
        toolId: integration.toolId,
        name: integration.name,
        status: ownedRow.status,
        httpStatus: execution.httpStatus,
        notImplementedHandler: execution.notImplementedHandler ?? false,
        error: execution.error ?? 'External integration call failed.',
      },
      summary: {
        toolId: integration.toolId,
        name: integration.name,
        status: 'error',
        httpStatus: execution.httpStatus,
      },
    };
  }

  return {
    payload: {
      ok: true,
      connected: true,
      toolId: integration.toolId,
      name: integration.name,
      httpStatus: execution.httpStatus,
      endpoint: execution.endpoint,
      data: execution.result,
    },
    summary: {
      toolId: integration.toolId,
      name: integration.name,
      status: 'success',
      httpStatus: execution.httpStatus,
    },
  };
}
