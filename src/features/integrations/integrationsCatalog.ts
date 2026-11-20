import type { IntegrationProvider } from '../../../shared/types.ts';

export type IntegrationCategoryId =
  | 'ai-ml'
  | 'social'
  | 'email'
  | 'ecommerce'
  | 'document'
  | 'developer'
  | 'productivity'
  | 'crm-support'
  | 'databases-analytics'
  | 'finance-payments';

export type IntegrationAuthMode = 'apiKey' | 'oauth';

export interface IntegrationCategoryMeta {
  id: IntegrationCategoryId;
  label: string;
}

export interface IntegrationToolCatalogItem {
  id: string;
  name: string;
  featuredTitle?: string;
  categoryId: IntegrationCategoryId;
  description: string;
  aboutText: string;
  samplePrompts: [string, string, string];
  authMode: IntegrationAuthMode;
  oauthConnectUrl?: string;
  defaultProvider: IntegrationProvider;
  secretLabel: string;
  keyPlaceholder: string;
  endpointPlaceholder: string;
  featured?: boolean;
}

export const INTEGRATION_CATEGORIES: IntegrationCategoryMeta[] = [
  { id: 'ai-ml', label: 'AI & Machine Learning' },
  { id: 'social', label: 'Social Media' },
  { id: 'email', label: 'Email' },
  { id: 'ecommerce', label: 'E-Commerce' },
  { id: 'document', label: 'Document' },
  { id: 'developer', label: 'Developer Tools' },
  { id: 'productivity', label: 'Productivity & Booking' },
  { id: 'crm-support', label: 'CRM & Support' },
  { id: 'databases-analytics', label: 'Databases & Analytics' },
  { id: 'finance-payments', label: 'Finance & Payments' },
];

export const FEATURED_TOOL_IDS = ['chapa', 'github', 'notion', 'telegram'] as const;

export const INTEGRATION_TOOLS: IntegrationToolCatalogItem[] = [
  // 1. AI & Machine Learning
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    categoryId: 'ai-ml',
    description: 'Run grounded web research and cited answer synthesis inside AI Agents and Workflows.',
    aboutText:
      'Perplexity AI equips AFRINEX AI Assistant and your custom AI Agents with live web search, source citations, and real-time market intelligence without leaving your workspace.',
    samplePrompts: [
      'Research the latest fintech regulations across East Africa with cited sources',
      'Compare remote software engineering grant deadlines closing this month',
      'Summarize today’s major AI developer announcements into 5 bullet points',
    ],
    authMode: 'apiKey',
    defaultProvider: 'openai_compatible',
    secretLabel: 'Perplexity API Key',
    keyPlaceholder: 'pplx-...',
    endpointPlaceholder: 'https://api.perplexity.ai',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    categoryId: 'ai-ml',
    description: 'Convert scripts into realistic multilingual voice audio for bots, courses, and agents.',
    aboutText:
      'Connect ElevenLabs to generate studio-grade voiceovers, lesson narrations, and interactive Telegram voice replies directly from scripts drafted in AFRINEX Builders.',
    samplePrompts: [
      'Generate a crisp 60-second course intro voice script for an AI basics lesson',
      'Draft an English and Swahili welcome voice prompt for my Telegram bot',
      'List recommended voice settings for educational audio lessons',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'ElevenLabs API Key',
    keyPlaceholder: 'xi-api-key...',
    endpointPlaceholder: 'https://api.elevenlabs.io/v1/voices',
  },
  {
    id: 'mem0',
    name: 'Mem0',
    categoryId: 'ai-ml',
    description: 'Persist long-term user preferences and memory across conversations in your AI Agents.',
    aboutText:
      'Mem0 adds adaptive long-term memory to AFRINEX AI Agents so bots remember customer language preferences, past orders, and learning goals across sessions.',
    samplePrompts: [
      'Design a Mem0 memory schema for tracking learner skill levels and goals',
      'How should my AI Agent recall previous support issues before replying?',
      'Write a retention prompt that updates user preferences cleanly via Mem0',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Mem0 API Key',
    keyPlaceholder: 'm0-...',
    endpointPlaceholder: 'https://api.mem0.ai/v1/memories',
  },
  {
    id: 'heygen',
    name: 'HeyGen',
    categoryId: 'ai-ml',
    description: 'Automate AI avatar video lessons, product walkthroughs, and localized updates.',
    aboutText:
      'Link HeyGen to transform written course modules, product release notes, and onboarding scripts into localized presenter videos via automated API workflows.',
    samplePrompts: [
      'Write a 45-second HeyGen presenter script announcing our new Mini App',
      'Convert this onboarding guide into a 3-scene video tutorial storyboard',
      'Structure a webhook flow that triggers a HeyGen video when a lesson publishes',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'HeyGen API Key',
    keyPlaceholder: 'hg-...',
    endpointPlaceholder: 'https://api.heygen.com/v2/avatars',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    categoryId: 'ai-ml',
    description: 'Connect GPT models, embeddings, and structured tool calling across your builders.',
    aboutText:
      'Connect your own OpenAI or compatible endpoint key (encrypted with AES-256-GCM) to power custom AI Agents, structured JSON extractors, and high-throughput builder automations.',
    samplePrompts: [
      'Design a structured JSON extraction schema for parsing customer invoices',
      'Compare system prompt patterns for reliable function-calling AI Agents',
      'Help me tune temperature and token budgets for a multi-step support bot',
    ],
    authMode: 'apiKey',
    defaultProvider: 'openai_compatible',
    secretLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    endpointPlaceholder: 'https://api.openai.com/v1/models',
  },

  // 2. Social Media
  {
    id: 'telegram',
    name: 'Telegram',
    featuredTitle: 'Telegram Bot',
    categoryId: 'social',
    description: 'Send notifications, connect @BotFather bots, and automate channel or group workflows.',
    aboutText:
      'Connect your @BotFather bot token so AFRINEX can verify bot identity live, route automated workflow alerts to your Telegram chats, and power custom Telegram Mini App & bot automations.',
    samplePrompts: [
      'Design a welcome flow and /menu inline keyboard for my Telegram bot',
      'Draft an engaging weekly community digest post for our Telegram channel',
      'Create a webhook alert template notifying admins when a new order arrives',
    ],
    authMode: 'apiKey',
    defaultProvider: 'telegram_bot',
    secretLabel: 'Telegram Bot Token',
    keyPlaceholder: '123456789:AAH...',
    endpointPlaceholder: 'Optional webhook URL (https://...)',
    featured: true,
  },
  {
    id: 'x-twitter',
    name: 'X (Twitter)',
    categoryId: 'social',
    description: 'Draft threads, monitor mentions, and publish scheduled updates from AFRINEX workflows.',
    aboutText:
      'Connect X (Twitter) to craft punchy product threads, summarize trending builder conversations, and automate scheduled posts or mention alerts through your AFRINEX workflows.',
    samplePrompts: [
      'Turn our latest Mini App feature launch into a 5-part X thread with hooks',
      'Summarize key developer pain points from recent fintech discussions on X',
      'Draft 3 concise replies for welcoming new builders tagging our handle',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Bearer Token',
    keyPlaceholder: 'Bearer token or signing secret',
    endpointPlaceholder: 'https://your-relay.example.com/x-webhook',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    categoryId: 'social',
    description: 'Automate creator DM replies, comment triggers, and media publishing pipelines.',
    aboutText:
      'Integrate Instagram to prepare carousel captions, design DM keyword lead-capture flows, and sync creator campaign alerts with your AFRINEX automations.',
    samplePrompts: [
      'Write a 5-slide Instagram carousel caption teaching AI productivity skills',
      'Design an automated DM reply flow for followers commenting "START"',
      'Generate a weekly Reels content calendar for an African EdTech brand',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Access Token',
    keyPlaceholder: 'Relay secret or Meta token',
    endpointPlaceholder: 'https://your-relay.example.com/instagram',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    categoryId: 'social',
    description: 'Sync short-video performance metrics and trigger content workflows automatically.',
    aboutText:
      'Connect TikTok to plan short-form hooks, analyze campaign engagement trends, and automate cross-posting alerts whenever new creator videos go live.',
    samplePrompts: [
      'Write 3 viral 15-second TikTok script hooks for an AI automation demo',
      'Analyze which short-video topics convert best into Telegram Mini App signups',
      'Draft a TikTok series outline breaking down no-code workflow recipes',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / API Token',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/tiktok',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    categoryId: 'social',
    description: 'Share articles, company updates, and career announcements directly from your workspace.',
    aboutText:
      'Use the LinkedIn connector to turn project milestones, scholarship opportunities, and technical case studies into high-signal posts and company page updates.',
    samplePrompts: [
      'Draft a thoughtful LinkedIn post announcing our remote fellowship program',
      'Convert this technical architecture summary into an executive LinkedIn article',
      'Create 3 founder storytelling hooks highlighting African tech builders',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Access Token',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/linkedin',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    categoryId: 'social',
    description: 'Monitor channel uploads, summarize comments, and trigger video-to-post workflows.',
    aboutText:
      'Link YouTube to repurpose tutorial videos into course study guides, track audience questions in comments, and automate channel upload announcements to Telegram.',
    samplePrompts: [
      'Outline a 10-minute YouTube tutorial showing how to build a Telegram bot',
      'Generate SEO-friendly titles, chapters, and description copy for a demo video',
      'Turn a YouTube transcript into a structured AFRINEX learning lesson',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / API Key',
    keyPlaceholder: 'AIza... or webhook secret',
    endpointPlaceholder: 'https://your-relay.example.com/youtube',
  },

  // 3. Email
  {
    id: 'gmail',
    name: 'Gmail',
    categoryId: 'email',
    description: 'Search threads, triage inbound leads, and draft replies inside AFRINEX Assistant.',
    aboutText:
      'Connect Gmail (via custom webhook relay or future OAuth) to summarize long email threads, draft context-aware replies, and turn inbound client requests into tracked tasks.',
    samplePrompts: [
      'Summarize unread partnership emails and draft polite next-step replies',
      'Extract action items and deadlines from this client email thread',
      'Write a crisp follow-up email template for grant application inquiries',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Relay Key',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/gmail',
  },
  {
    id: 'outlook-m365',
    name: 'Outlook / Microsoft 365',
    categoryId: 'email',
    description: 'Connect enterprise mail folders and automate Microsoft 365 notifications cleanly.',
    aboutText:
      'Bridge Outlook & Microsoft 365 into AFRINEX to organize team inboxes, summarize project stakeholder updates, and dispatch structured status digests.',
    samplePrompts: [
      'Draft a weekly stakeholder status update formatted for Outlook teams',
      'Create a rule summary to separate vendor invoices from support emails',
      'Write a formal enterprise onboarding welcome email for new partners',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Graph Secret',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/outlook',
  },
  {
    id: 'resend',
    name: 'Resend',
    categoryId: 'email',
    description: 'Send fast transactional emails, receipts, and onboarding alerts from built apps.',
    aboutText:
      'Resend gives your AFRINEX websites, Mini Apps, and Cloudflare Workers reliable transactional email delivery with clean API keys encrypted safely in D1.',
    samplePrompts: [
      'Write a responsive HTML + React Email welcome template for new members',
      'Generate a Cloudflare Worker snippet sending payment receipts via Resend',
      'Design a 3-email onboarding drip sequence for newly registered builders',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Resend API Key',
    keyPlaceholder: 're_...',
    endpointPlaceholder: 'https://api.resend.com/domains',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    categoryId: 'email',
    description: 'Sync subscriber audiences, segment tags, and trigger newsletter campaigns automatically.',
    aboutText:
      'Connect Mailchimp to segment audience tags, draft high-converting newsletters, and sync new subscribers captured from your AFRINEX Websites and Telegram bots.',
    samplePrompts: [
      'Draft a monthly newsletter highlighting top remote AI jobs & scholarships',
      'Design an audience tagging strategy separating students, founders, and devs',
      'Write 5 subject-line A/B tests for an upcoming cohort launch campaign',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Mailchimp API Key',
    keyPlaceholder: 'xxxx-us21',
    endpointPlaceholder: 'https://us21.api.mailchimp.com/3.0/ping',
  },
  {
    id: 'brevo',
    name: 'Brevo',
    categoryId: 'email',
    description: 'Automate transactional emails, SMS notifications, and CRM contact lists globally.',
    aboutText:
      'Integrate Brevo to coordinate email and SMS alerts, update contact attributes after user actions, and power multi-channel lifecycle messaging.',
    samplePrompts: [
      'Create an SMS + email reminder pair for upcoming cohort session deadlines',
      'Design a webhook payload mapping Mini App signups into Brevo contact lists',
      'Draft a re-engagement email for inactive members with a clear CTA',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Brevo API Key',
    keyPlaceholder: 'xkeysib-...',
    endpointPlaceholder: 'https://api.brevo.com/v3/account',
  },
  {
    id: 'custom-smtp',
    name: 'Custom SMTP / IMAP',
    categoryId: 'email',
    description: 'Connect your own domain mail relay or HTTP-to-SMTP gateway for full delivery control.',
    aboutText:
      'Use Custom SMTP / IMAP to link self-hosted mail servers or HTTP mail relays with AES-256-GCM encrypted credentials for custom-domain alerts and automations.',
    samplePrompts: [
      'Check best-practice SPF, DKIM, and DMARC records for custom domain mail',
      'Design an HTTP-to-SMTP bridge endpoint schema for Cloudflare Workers',
      'Write a plain-text + HTML transactional alert template with low spam score',
    ],
    authMode: 'apiKey',
    defaultProvider: 'custom',
    secretLabel: 'SMTP Relay Password / Token',
    keyPlaceholder: 'smtp-secret-token',
    endpointPlaceholder: 'https://mail-relay.yourdomain.com/health',
  },

  // 4. E-Commerce
  {
    id: 'shopify',
    name: 'Shopify',
    categoryId: 'ecommerce',
    description: 'Track orders, inventory levels, and customer alerts across your online storefronts.',
    aboutText:
      'Connect Shopify to monitor new storefront orders, check inventory thresholds, write product copy, and send instant fulfillment updates into Telegram workflows.',
    samplePrompts: [
      'Write high-converting Shopify product descriptions for a digital creator bundle',
      'Design an abandoned-cart Telegram & email recovery workflow for Shopify',
      'Outline a webhook handler notifying warehouse staff on high-value orders',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Admin API Token',
    keyPlaceholder: 'shpat_... or webhook secret',
    endpointPlaceholder: 'https://your-store.myshopify.com/admin/api/2025-01/shop.json',
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    categoryId: 'ecommerce',
    description: 'Connect WordPress storefronts to inspect orders, products, and automated alerts.',
    aboutText:
      'Connect WooCommerce with encrypted REST keys to inspect store orders, sync catalog stock status, and trigger Telegram Mini App buyer notifications.',
    samplePrompts: [
      'Generate a REST webhook payload mapping WooCommerce orders to Telegram alerts',
      'Draft automated shipping confirmation messages for WooCommerce buyers',
      'Suggest low-stock threshold alert rules for fast-moving digital or physical SKUs',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'WooCommerce Consumer Key / Secret',
    keyPlaceholder: 'ck_...:cs_...',
    endpointPlaceholder: 'https://yourstore.com/wp-json/wc/v3/system_status',
  },
  {
    id: 'amazon',
    name: 'Amazon',
    categoryId: 'ecommerce',
    description: 'Monitor seller catalog listings, order volume, and automated marketplace alerts.',
    aboutText:
      'Link Amazon seller feeds via relay webhook to summarize daily order volume, optimize product bullet points, and watch catalog or buy-box changes.',
    samplePrompts: [
      'Rewrite this product listing into 5 keyword-rich Amazon bullet points',
      'Design a daily Amazon sales & refund digest formatted for Telegram',
      'Summarize common 3-star product review themes into product fixes',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / SP-API Relay Key',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/amazon',
  },
  {
    id: 'instacart',
    name: 'Instacart',
    categoryId: 'ecommerce',
    description: 'Link grocery storefront fulfillment events and automated inventory catalog updates.',
    aboutText:
      'Integrate Instacart catalog & fulfillment feeds to monitor basket substitutions, track store inventory availability, and streamline local delivery workflows.',
    samplePrompts: [
      'Design a real-time order substitution alert message for grocery buyers',
      'Create a structured SKU sync checklist for local retail catalogs',
      'Outline an automated webhook notification when store inventory runs low',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Partner API Key',
    keyPlaceholder: 'Partner key or webhook secret',
    endpointPlaceholder: 'https://your-relay.example.com/instacart',
  },
  {
    id: 'jiji-jumia',
    name: 'Jiji / Jumia',
    categoryId: 'ecommerce',
    description: 'Integrate African marketplace seller feeds, order webhooks, and buyer notifications.',
    aboutText:
      'Built for merchants across Africa: connect Jiji or Jumia seller bridges to automate listing updates, centralize buyer inquiries, and notify your team on Telegram.',
    samplePrompts: [
      'Write compelling Jiji & Jumia product titles and trust-building specs',
      'Create a fast Telegram buyer inquiry auto-responder for marketplace leads',
      'Design a daily inventory reconciliation checklist across Jiji and Jumia',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Seller API Key / Feed Token',
    keyPlaceholder: 'Seller API key',
    endpointPlaceholder: 'https://your-seller-bridge.example.com/status',
  },

  // 5. Document
  {
    id: 'google-docs',
    name: 'Google Docs',
    categoryId: 'document',
    description: 'Create, read, and summarize collaborative documents straight from AI Builders.',
    aboutText:
      'Connect Google Docs to turn project specs, meeting transcripts, and research notes into clean formatted documents or concise executive summaries.',
    samplePrompts: [
      'Turn these rough voice notes into a clean formatted Google Doc project brief',
      'Summarize a 10-page partnership agreement into key obligations and risks',
      'Draft a repeatable weekly team sync template ready for Google Docs',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Apps Script Key',
    keyPlaceholder: 'Apps Script secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/google-docs',
  },
  {
    id: 'notion',
    name: 'Notion',
    categoryId: 'document',
    description: 'Sync knowledge bases, project roadmaps, and structured databases with AI Assistant.',
    aboutText:
      'Connect Notion to query internal databases, create project roadmap cards, and keep your team wiki synchronized with AFRINEX Builders and AI Assistant.',
    samplePrompts: [
      'Design a Notion database schema for tracking AFRINEX content & builder sprints',
      'Summarize today’s action items into structured Notion tasks with owners',
      'Connect a Notion internal integration token to log new leads automatically',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Internal Integration Secret (ntn_...)',
    keyPlaceholder: 'ntn_... or secret_...',
    endpointPlaceholder: 'https://api.notion.com/v1/users/me',
    featured: true,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    categoryId: 'document',
    description: 'Search shared project folders, index files, and organize deliverables securely.',
    aboutText:
      'Link Google Drive via relay webhook or Apps Script to track new shared folder uploads, index deliverable links, and trigger notifications on file changes.',
    samplePrompts: [
      'Organize a clean client onboarding folder hierarchy for Google Drive',
      'Generate an Apps Script webhook notifying Telegram when files are uploaded',
      'Create a naming convention guide for team assets and invoices in Drive',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Drive Relay Key',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/google-drive',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    categoryId: 'document',
    description: 'Access shared team folders, asset archives, and file update webhooks automatically.',
    aboutText:
      'Connect Dropbox to monitor shared media folders, automate asset delivery links inside bots or Mini Apps, and keep design handoffs organized.',
    samplePrompts: [
      'Design a client media handoff workflow triggered by new Dropbox uploads',
      'Draft an automated Telegram alert with safe file metadata on folder changes',
      'Create an archive cleanup policy separating active vs completed client folders',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Scoped Access Token',
    keyPlaceholder: 'sl.... or webhook secret',
    endpointPlaceholder: 'https://your-relay.example.com/dropbox',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    categoryId: 'document',
    description: 'Connect engineering wikis, SOPs, and team documentation into your AI knowledge workflows.',
    aboutText:
      'Link Confluence spaces to transform technical runbooks, release notes, and onboarding SOPs into searchable context for your engineering team.',
    samplePrompts: [
      'Write a production incident postmortem template structured for Confluence',
      'Convert this API spec into a clean Confluence developer onboarding page',
      'Summarize quarterly engineering RFC decisions into a 1-page digest',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Atlassian API Token / Webhook Key',
    keyPlaceholder: 'ATATT3x...',
    endpointPlaceholder: 'https://your-domain.atlassian.net/wiki/rest/api/space',
  },

  // 6. Developer Tools
  {
    id: 'github',
    name: 'GitHub',
    categoryId: 'developer',
    description: 'Inspect repositories, issues, pull requests, and push generated builder code safely.',
    aboutText:
      'Connect your GitHub Personal Access Token (encrypted via AES-256-GCM) so AFRINEX AI Assistant and Builders can inspect repo structure, triage issues, and streamline code workflows.',
    samplePrompts: [
      'Review recent open issues and prioritize bugs vs feature requests cleanly',
      'Draft a crisp pull request description and release changelog from commits',
      'Generate a GitHub Actions CI workflow running tests and Wrangler dry-run',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'GitHub Personal Access Token',
    keyPlaceholder: 'ghp_... or github_pat_...',
    endpointPlaceholder: 'https://api.github.com/user',
    featured: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    categoryId: 'developer',
    description: 'Manage Workers deployments, D1 diagnostics, and edge DNS routes via API token.',
    aboutText:
      'Verify and manage Cloudflare Workers edge deployments, D1 database migrations, and environment bindings using scoped API tokens stored safely in AFRINEX.',
    samplePrompts: [
      'Audit our wrangler.toml bindings, D1 indexes, and hourly cron schedule',
      'Generate a step-by-step zero-downtime D1 migration checklist',
      'Diagnose a Worker 500 error pattern and outline structured logging fixes',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Cloudflare API Token',
    keyPlaceholder: 'cf_api_token...',
    endpointPlaceholder: 'https://api.cloudflare.com/client/v4/user/tokens/verify',
  },
  {
    id: 'composio',
    name: 'Composio',
    categoryId: 'developer',
    description: 'Equip AFRINEX AI Agents with managed external tool actions and execution runtimes.',
    aboutText:
      'Plug Composio into AFRINEX AI Agents to orchestrate multi-app function calling, managed tool schemas, and authenticated external action pipelines.',
    samplePrompts: [
      'Design a Composio toolset configuration for a customer-onboarding AI Agent',
      'Map safe read/write permissions for an autonomous calendar & CRM agent',
      'Write error-retry logic when an external Composio tool call times out',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Composio API Key',
    keyPlaceholder: 'comp_...',
    endpointPlaceholder: 'https://backend.composio.dev/api/v1/apps',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    categoryId: 'developer',
    description: 'Scrape websites into clean markdown and structured JSON ready for AI context.',
    aboutText:
      'Use Firecrawl to convert public documentation sites, grant portals, and product pages into clean Markdown or structured JSON for AI Agents.',
    samplePrompts: [
      'Design a structured JSON schema to extract scholarship deadlines from web pages',
      'Outline a Firecrawl + Workers pipeline indexing product docs into markdown',
      'Compare single-page scrape vs full-site crawl settings for documentation bots',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Firecrawl API Key',
    keyPlaceholder: 'fc-...',
    endpointPlaceholder: 'https://api.firecrawl.dev/v1/team/credit-usage',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    categoryId: 'developer',
    description: 'Give AI Agents fast, real-time web search tailored for accurate reasoning loops.',
    aboutText:
      'Connect Tavily Search API to give custom AFRINEX AI Agents sub-second factual web lookups, domain filtering, and clean search snippets.',
    samplePrompts: [
      'Configure Tavily search depth and domain allowlists for a research agent',
      'Build a prompt loop verifying live exchange rates and startup news via Tavily',
      'Summarize best practices for caching frequent Tavily search queries in D1',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Tavily API Key',
    keyPlaceholder: 'tvly-...',
    endpointPlaceholder: 'https://api.tavily.com/search',
  },

  // 7. Productivity & Booking
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    categoryId: 'productivity',
    description: 'Check availability, schedule meetings, and sync opportunity deadline events.',
    aboutText:
      'Connect Google Calendar to turn opportunity deadlines, client calls, and team standups into structured calendar schedules and morning Telegram agenda alerts.',
    samplePrompts: [
      'Draft a structured weekly time-blocking schedule balancing deep work and calls',
      'Create calendar event copy and prep checklist for a 30-minute client discovery call',
      'Build an Apps Script webhook sending daily morning agenda alerts to Telegram',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Custom Webhook / Calendar Relay Key',
    keyPlaceholder: 'Relay secret or token',
    endpointPlaceholder: 'https://your-relay.example.com/calendar',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    categoryId: 'productivity',
    description: 'Share booking links and notify your team whenever a client schedules a session.',
    aboutText:
      'Integrate Calendly with AES-256-GCM protected tokens or webhooks to route new booking alerts, qualify leads from intake questions, and prep call briefs automatically.',
    samplePrompts: [
      'Design 4 smart Calendly intake questions to qualify AI automation leads',
      'Write a Telegram alert template triggered whenever a Calendly meeting books',
      'Draft polite reschedule and no-show follow-up messages for booked clients',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Calendly Personal Access Token',
    keyPlaceholder: 'eyJraWQiOi...',
    endpointPlaceholder: 'https://api.calendly.com/users/me',
  },
  {
    id: 'linear',
    name: 'Linear',
    categoryId: 'productivity',
    description: 'Create bug reports, sync sprint issues, and track engineering velocity in chat.',
    aboutText:
      'Connect Linear to turn user bug reports and product ideas directly into triaged issues, sprint cycle summaries, and Telegram release notifications.',
    samplePrompts: [
      'Convert this user bug report into a crisp Linear issue with repro steps',
      'Draft a sprint retrospective summary grouping shipped features vs blockers',
      'Design a webhook rule notifying Telegram when high-priority issues ship',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Linear Personal API Key',
    keyPlaceholder: 'lin_api_...',
    endpointPlaceholder: 'https://your-relay.example.com/linear',
  },
  {
    id: 'jira',
    name: 'Jira',
    categoryId: 'productivity',
    description: 'Sync product backlogs, sprint tickets, and release status across engineering teams.',
    aboutText:
      'Link Jira Cloud to write clearer user stories, summarize backlog priorities, and route critical ticket transitions to your engineering Telegram channels.',
    samplePrompts: [
      'Turn this feature idea into a Jira epic with acceptance criteria subtasks',
      'Write JQL queries highlighting overdue blockers and unreviewed PR tickets',
      'Generate a Friday sprint stakeholder digest from completed Jira issues',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Atlassian API Token / Webhook Key',
    keyPlaceholder: 'ATATT3x...',
    endpointPlaceholder: 'https://your-domain.atlassian.net/rest/api/3/myself',
  },
  {
    id: 'trello',
    name: 'Trello',
    categoryId: 'productivity',
    description: 'Move Kanban cards, capture checklists, and turn chat ideas into organized tasks.',
    aboutText:
      'Connect Trello boards to capture ideas from Telegram or AI Assistant into Kanban cards, build step-by-step checklists, and track card due dates.',
    samplePrompts: [
      'Design a 5-column Trello Kanban board for launching client Telegram Mini Apps',
      'Break this marketing launch plan into Trello cards with checklists',
      'Draft a weekly board summary showing cards stuck in Review for >3 days',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Trello API Key / Token',
    keyPlaceholder: 'ATTA...',
    endpointPlaceholder: 'https://api.trello.com/1/members/me',
  },

  // 8. CRM & Support
  {
    id: 'hubspot',
    name: 'HubSpot',
    categoryId: 'crm-support',
    description: 'Manage CRM contacts, deal stages, and AI-assisted sales follow-up sequences.',
    aboutText:
      'Integrate HubSpot to organize lead pipelines, enrich contact records from Telegram inquiries, and draft personalized deal follow-up sequences.',
    samplePrompts: [
      'Design a 6-stage HubSpot sales pipeline tailored for B2B AI & bot agencies',
      'Summarize call notes into structured HubSpot contact properties and next steps',
      'Write a 3-touch HubSpot follow-up sequence for warm demo leads',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'HubSpot Private App Token',
    keyPlaceholder: 'pat-na1-...',
    endpointPlaceholder: 'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
  },
  {
    id: 'freshdesk',
    name: 'Freshdesk',
    categoryId: 'crm-support',
    description: 'Route customer tickets, draft agent responses, and monitor SLA resolution times.',
    aboutText:
      'Connect Freshdesk to auto-tag incoming tickets, generate helpful knowledge-based agent drafts, and escalate urgent SLA breaches immediately.',
    samplePrompts: [
      'Create 5 Freshdesk canned response macros for billing and bot setup questions',
      'Build a ticket triage rubric routing Billing, Technical, and Bug tickets cleanly',
      'Draft a clear SLA escalation alert posted to Telegram when urgent tickets age',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Freshdesk API Key / Webhook Secret',
    keyPlaceholder: 'fd_api_key...',
    endpointPlaceholder: 'https://yourdomain.freshdesk.com/api/v2/tickets',
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    categoryId: 'crm-support',
    description: 'Sync support conversations, macro suggestions, and customer health statuses.',
    aboutText:
      'Bridge Zendesk with AFRINEX to classify inbound tickets, draft empathetic troubleshooting replies, and turn recurring support themes into help docs.',
    samplePrompts: [
      'Draft a calm, clear Zendesk reply explaining Telegram webhook troubleshooting',
      'Analyze recurring support ticket subjects and suggest 3 FAQ improvements',
      'Design an automated CSAT follow-up trigger after ticket resolution',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Zendesk API Token / Webhook Secret',
    keyPlaceholder: 'zd_token...',
    endpointPlaceholder: 'https://yourdomain.zendesk.com/api/v2/tickets.json',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    categoryId: 'crm-support',
    description: 'Bridge live messenger conversations, user traits, and automated onboarding help.',
    aboutText:
      'Connect Intercom to align live product messaging, tag onboarding friction points, and deliver proactive user guidance triggered by product events.',
    samplePrompts: [
      'Write an Intercom onboarding series guiding users through their first AI Bot',
      'Design conversation tagging rules separating bugs from billing questions',
      'Draft concise in-app Intercom tooltips for new Workspace features',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Intercom Access Token / Webhook Key',
    keyPlaceholder: 'dG9r...',
    endpointPlaceholder: 'https://api.intercom.io/me',
  },
  {
    id: 'zoho-desk',
    name: 'Zoho Desk',
    categoryId: 'crm-support',
    description: 'Automate ticket assignment, SLA alerts, and multi-channel support summaries.',
    aboutText:
      'Link Zoho Desk to streamline department ticket routing, dispatch urgent alerts over Telegram webhooks, and summarize daily support resolution metrics.',
    samplePrompts: [
      'Design Zoho Desk auto-assignment rules for multi-timezone support teams',
      'Write clear support escalation templates for enterprise SLA customers',
      'Create a daily Zoho Desk summary report format for team leads',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Zoho Webhook / Relay Token',
    keyPlaceholder: 'zoho-relay-token',
    endpointPlaceholder: 'https://your-relay.example.com/zoho-desk',
  },

  // 9. Databases & Analytics
  {
    id: 'supabase',
    name: 'Supabase',
    categoryId: 'databases-analytics',
    description: 'Query Postgres tables, trigger Edge Functions, and connect auth backends.',
    aboutText:
      'Connect Supabase REST or service credentials (stored with AES-256-GCM encryption) so your generated Websites, Mini Apps, and Automations can persist Postgres records securely.',
    samplePrompts: [
      'Write a Postgres schema with Row Level Security for a multi-tenant Mini App',
      'Generate a TypeScript helper calling a Supabase REST table from a Worker',
      'Review indexing strategies for high-traffic activity feed queries in Postgres',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Supabase Service / Anon Key',
    keyPlaceholder: 'eyJhbGciOi...',
    endpointPlaceholder: 'https://your-project.supabase.co/rest/v1/',
  },
  {
    id: 'airtable',
    name: 'Airtable',
    categoryId: 'databases-analytics',
    description: 'Use Airtable bases as live structured backends for AI Agents and Mini Apps.',
    aboutText:
      'Integrate Airtable with a scoped Personal Access Token so bots and automations can log leads, read curated directories, and manage structured operations bases.',
    samplePrompts: [
      'Design a 3-table Airtable CRM base tracking Leads, Projects, and Payouts',
      'Write a fetch helper upserting Telegram user registrations into Airtable',
      'Draft an Airtable formula calculating upcoming grant deadline urgency',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Airtable Personal Access Token',
    keyPlaceholder: 'pat...',
    endpointPlaceholder: 'https://api.airtable.com/v0/meta/whoami',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    categoryId: 'databases-analytics',
    description: 'Append leads, export opportunity logs, and analyze spreadsheet rows live.',
    aboutText:
      'Connect Google Sheets via Apps Script webhook or future OAuth to append bot submissions, maintain lookup pricing tables, and generate clean spreadsheet reports.',
    samplePrompts: [
      'Create an Apps Script doPost webhook appending Telegram form leads to Sheets',
      'Design a Google Sheets tracker layout for monthly revenue and churn KPIs',
      'Write a clean QUERY formula summarizing weekly applications by category',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'Apps Script / Webhook Secret',
    keyPlaceholder: 'Sheets relay secret',
    endpointPlaceholder: 'https://your-relay.example.com/sheets',
  },
  {
    id: 'posthog',
    name: 'PostHog',
    categoryId: 'databases-analytics',
    description: 'Track product funnels, feature flags, and retention metrics inside dashboards.',
    aboutText:
      'Link PostHog to instrument Mini App conversion funnels, evaluate feature flags cleanly, and track real activation metrics across product releases.',
    samplePrompts: [
      'Design a clean event-naming taxonomy for tracking AFRINEX Builder activation',
      'Outline a 4-step signup-to-deployment conversion funnel in PostHog',
      'Write a lightweight privacy-safe PostHog event capture helper for React',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'PostHog Personal API Key',
    keyPlaceholder: 'phx_...',
    endpointPlaceholder: 'https://app.posthog.com/api/projects/@current/',
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    categoryId: 'databases-analytics',
    description: 'Monitor GA4 traffic sources, conversions, and automated weekly audience digests.',
    aboutText:
      'Connect Google Analytics 4 measurement events to track landing page traffic attribution, key conversion events, and automated weekly growth summaries.',
    samplePrompts: [
      'List the top 6 GA4 custom events every SaaS landing page should measure',
      'Build a UTM tagging convention sheet for Telegram, X, and YouTube links',
      'Write a Measurement Protocol server event payload for completed signups',
    ],
    authMode: 'oauth',
    defaultProvider: 'webhook',
    secretLabel: 'GA4 Measurement Secret / Relay Key',
    keyPlaceholder: 'GA4 secret or relay token',
    endpointPlaceholder: 'https://your-relay.example.com/ga4',
  },

  // 10. Finance & Payments
  {
    id: 'chapa',
    name: 'Chapa',
    categoryId: 'finance-payments',
    description: 'Accept ETB & multi-currency African payments, verify transactions, and handle webhooks.',
    aboutText:
      'Integrate Chapa using your encrypted Secret Key to initialize checkout sessions, verify ETB/USD transactions server-side, and trigger instant Telegram fulfillment receipts.',
    samplePrompts: [
      'Generate a Cloudflare Worker route initializing and verifying a Chapa payment',
      'Design a secure Chapa webhook handler confirming order status idempotently',
      'Draft a bilingual customer payment confirmation receipt for Telegram checkout',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Chapa Secret Key',
    keyPlaceholder: 'CHASECK_TEST-...',
    endpointPlaceholder: 'https://api.chapa.co/v1/banks',
    featured: true,
  },
  {
    id: 'telebirr',
    name: 'Telebirr',
    categoryId: 'finance-payments',
    description: 'Integrate Ethiopian mobile money checkout and instant payment confirmation callbacks.',
    aboutText:
      'Connect Telebirr merchant credentials safely via AES-256-GCM encryption to support mobile money checkout callbacks, order reconciliation, and Mini App receipts.',
    samplePrompts: [
      'Outline a Telebirr H5 / Mini App checkout signing and callback flow',
      'Design a D1 payment reconciliation table preventing duplicate order credits',
      'Draft clear troubleshooting steps for mobile money timeout retries',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Telebirr App Key / Merchant Secret',
    keyPlaceholder: 'telebirr-app-secret',
    endpointPlaceholder: 'https://your-telebirr-gateway.example.com/health',
  },
  {
    id: 'paystack',
    name: 'Paystack',
    categoryId: 'finance-payments',
    description: 'Process NGN, GHS, KES, ZAR, and USD payments across West and East Africa.',
    aboutText:
      'Store your Paystack Secret Key with AES-256-GCM encryption to verify card, mobile money, and bank transfer payments across Nigeria, Ghana, Kenya, and South Africa.',
    samplePrompts: [
      'Write a Hono Worker endpoint verifying Paystack webhooks with HMAC SHA-512',
      'Compare Paystack split-payment flows for multi-vendor digital marketplaces',
      'Draft a subscription renewal reminder & receipt flow powered by Paystack',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Paystack Secret Key',
    keyPlaceholder: 'sk_live_... or sk_test_...',
    endpointPlaceholder: 'https://api.paystack.co/bank?perPage=1',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    categoryId: 'finance-payments',
    description: 'Accept global cards, manage recurring SaaS subscriptions, and sync billing events.',
    aboutText:
      'Connect Stripe with encrypted restricted/secret keys to support global Checkout sessions, SaaS subscription webhooks, and automated customer billing alerts.',
    samplePrompts: [
      'Generate a Stripe Checkout + webhook signature verification handler for Workers',
      'Design an idempotent subscription lifecycle sync covering upgrades and refunds',
      'Compare Stripe Payment Links vs embedded Checkout for digital SaaS products',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'Stripe Secret Key',
    keyPlaceholder: 'sk_live_... or rk_live_...',
    endpointPlaceholder: 'https://api.stripe.com/v1/balance',
  },
  {
    id: 'ton-wallet',
    name: 'TON Wallet',
    categoryId: 'finance-payments',
    description: 'Verify on-chain TON & Jetton transfers seamlessly for Telegram Mini App commerce.',
    aboutText:
      'Connect TON Center or TonAPI credentials to verify on-chain TON and USDT-TON Jetton transactions inside Telegram Mini Apps and Web3 builder workflows.',
    samplePrompts: [
      'Design a Telegram Mini App payment verification flow checking TON comment memos',
      'Compare TonAPI webhook subscriptions vs polling for confirming Jetton deposits',
      'Audit security checks needed before crediting users for on-chain TON transfers',
    ],
    authMode: 'apiKey',
    defaultProvider: 'external_api',
    secretLabel: 'TON Center / TonAPI Key',
    keyPlaceholder: 'tonapi_key...',
    endpointPlaceholder: 'https://tonapi.io/v2/status',
  },
];

export function findCatalogToolById(toolId: string | null | undefined): IntegrationToolCatalogItem | undefined {
  if (!toolId) return undefined;
  return INTEGRATION_TOOLS.find((t) => t.id === toolId);
}
