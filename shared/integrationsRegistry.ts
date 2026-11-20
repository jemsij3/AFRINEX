import type { IntegrationProvider } from './types.ts';

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

export interface IntegrationToolMeta {
  id: string;
  name: string;
  categoryId: IntegrationCategoryId;
  websiteUrl: string;
  authMode: IntegrationAuthMode;
  defaultProvider: IntegrationProvider;
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

export const INTEGRATION_TOOLS_META: IntegrationToolMeta[] = [
  // 1. AI & Machine Learning
  { id: 'perplexity', name: 'Perplexity AI', categoryId: 'ai-ml', websiteUrl: 'https://www.perplexity.ai', authMode: 'apiKey', defaultProvider: 'openai_compatible' },
  { id: 'elevenlabs', name: 'ElevenLabs', categoryId: 'ai-ml', websiteUrl: 'https://elevenlabs.io', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'mem0', name: 'Mem0', categoryId: 'ai-ml', websiteUrl: 'https://mem0.ai', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'heygen', name: 'HeyGen', categoryId: 'ai-ml', websiteUrl: 'https://www.heygen.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'openai', name: 'OpenAI', categoryId: 'ai-ml', websiteUrl: 'https://platform.openai.com', authMode: 'apiKey', defaultProvider: 'openai_compatible' },

  // 2. Social Media
  { id: 'telegram', name: 'Telegram', categoryId: 'social', websiteUrl: 'https://t.me/BotFather', authMode: 'apiKey', defaultProvider: 'telegram_bot' },
  { id: 'x-twitter', name: 'X (Twitter)', categoryId: 'social', websiteUrl: 'https://developer.x.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'instagram', name: 'Instagram', categoryId: 'social', websiteUrl: 'https://developers.facebook.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'tiktok', name: 'TikTok', categoryId: 'social', websiteUrl: 'https://developers.tiktok.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'linkedin', name: 'LinkedIn', categoryId: 'social', websiteUrl: 'https://www.linkedin.com/developers', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'youtube', name: 'YouTube', categoryId: 'social', websiteUrl: 'https://console.cloud.google.com', authMode: 'oauth', defaultProvider: 'webhook' },

  // 3. Email
  { id: 'gmail', name: 'Gmail', categoryId: 'email', websiteUrl: 'https://mail.google.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'outlook-m365', name: 'Outlook / Microsoft 365', categoryId: 'email', websiteUrl: 'https://outlook.live.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'resend', name: 'Resend', categoryId: 'email', websiteUrl: 'https://resend.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'mailchimp', name: 'Mailchimp', categoryId: 'email', websiteUrl: 'https://mailchimp.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'brevo', name: 'Brevo', categoryId: 'email', websiteUrl: 'https://www.brevo.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'custom-smtp', name: 'Custom SMTP / IMAP', categoryId: 'email', websiteUrl: 'https://nodemailer.com', authMode: 'apiKey', defaultProvider: 'custom' },

  // 4. E-Commerce
  { id: 'shopify', name: 'Shopify', categoryId: 'ecommerce', websiteUrl: 'https://admin.shopify.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'woocommerce', name: 'WooCommerce', categoryId: 'ecommerce', websiteUrl: 'https://woocommerce.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'amazon', name: 'Amazon', categoryId: 'ecommerce', websiteUrl: 'https://sellercentral.amazon.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'instacart', name: 'Instacart', categoryId: 'ecommerce', websiteUrl: 'https://www.instacart.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'jiji-jumia', name: 'Jiji / Jumia', categoryId: 'ecommerce', websiteUrl: 'https://jiji.com.et', authMode: 'apiKey', defaultProvider: 'external_api' },

  // 5. Document
  { id: 'google-docs', name: 'Google Docs', categoryId: 'document', websiteUrl: 'https://docs.google.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'notion', name: 'Notion', categoryId: 'document', websiteUrl: 'https://www.notion.so', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'google-drive', name: 'Google Drive', categoryId: 'document', websiteUrl: 'https://drive.google.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'dropbox', name: 'Dropbox', categoryId: 'document', websiteUrl: 'https://www.dropbox.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'confluence', name: 'Confluence', categoryId: 'document', websiteUrl: 'https://www.atlassian.com/software/confluence', authMode: 'oauth', defaultProvider: 'webhook' },

  // 6. Developer Tools
  { id: 'github', name: 'GitHub', categoryId: 'developer', websiteUrl: 'https://github.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'cloudflare', name: 'Cloudflare', categoryId: 'developer', websiteUrl: 'https://dash.cloudflare.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'composio', name: 'Composio', categoryId: 'developer', websiteUrl: 'https://app.composio.dev', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'firecrawl', name: 'Firecrawl', categoryId: 'developer', websiteUrl: 'https://www.firecrawl.dev', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'tavily', name: 'Tavily', categoryId: 'developer', websiteUrl: 'https://app.tavily.com', authMode: 'apiKey', defaultProvider: 'external_api' },

  // 7. Productivity & Booking
  { id: 'google-calendar', name: 'Google Calendar', categoryId: 'productivity', websiteUrl: 'https://calendar.google.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'calendly', name: 'Calendly', categoryId: 'productivity', websiteUrl: 'https://calendly.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'linear', name: 'Linear', categoryId: 'productivity', websiteUrl: 'https://linear.app', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'jira', name: 'Jira', categoryId: 'productivity', websiteUrl: 'https://www.atlassian.com/software/jira', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'trello', name: 'Trello', categoryId: 'productivity', websiteUrl: 'https://trello.com', authMode: 'oauth', defaultProvider: 'webhook' },

  // 8. CRM & Support
  { id: 'hubspot', name: 'HubSpot', categoryId: 'crm-support', websiteUrl: 'https://app.hubspot.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'freshdesk', name: 'Freshdesk', categoryId: 'crm-support', websiteUrl: 'https://freshdesk.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'zendesk', name: 'Zendesk', categoryId: 'crm-support', websiteUrl: 'https://www.zendesk.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'intercom', name: 'Intercom', categoryId: 'crm-support', websiteUrl: 'https://www.intercom.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'zoho-desk', name: 'Zoho Desk', categoryId: 'crm-support', websiteUrl: 'https://desk.zoho.com', authMode: 'oauth', defaultProvider: 'webhook' },

  // 9. Databases & Analytics
  { id: 'supabase', name: 'Supabase', categoryId: 'databases-analytics', websiteUrl: 'https://supabase.com/dashboard', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'airtable', name: 'Airtable', categoryId: 'databases-analytics', websiteUrl: 'https://airtable.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'google-sheets', name: 'Google Sheets', categoryId: 'databases-analytics', websiteUrl: 'https://sheets.google.com', authMode: 'oauth', defaultProvider: 'webhook' },
  { id: 'posthog', name: 'PostHog', categoryId: 'databases-analytics', websiteUrl: 'https://app.posthog.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'google-analytics', name: 'Google Analytics', categoryId: 'databases-analytics', websiteUrl: 'https://analytics.google.com', authMode: 'oauth', defaultProvider: 'webhook' },

  // 10. Finance & Payments
  { id: 'chapa', name: 'Chapa', categoryId: 'finance-payments', websiteUrl: 'https://dashboard.chapa.co', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'telebirr', name: 'Telebirr', categoryId: 'finance-payments', websiteUrl: 'https://www.ethiotelecom.et/telebirr/', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'paystack', name: 'Paystack', categoryId: 'finance-payments', websiteUrl: 'https://dashboard.paystack.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'stripe', name: 'Stripe', categoryId: 'finance-payments', websiteUrl: 'https://dashboard.stripe.com', authMode: 'apiKey', defaultProvider: 'external_api' },
  { id: 'ton-wallet', name: 'TON Wallet', categoryId: 'finance-payments', websiteUrl: 'https://ton.org/en/wallets', authMode: 'apiKey', defaultProvider: 'external_api' },
];

export function findIntegrationToolMeta(idOrName: string | null | undefined): IntegrationToolMeta | undefined {
  if (!idOrName) return undefined;
  const normalized = idOrName.trim().toLowerCase().replace(/^use_/, '').replace(/_/g, '-');
  return INTEGRATION_TOOLS_META.find(
    (item) =>
      item.id === normalized ||
      item.name.toLowerCase() === idOrName.trim().toLowerCase() ||
      item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === normalized
  );
}

export function getIntegrationCategoryLabel(categoryId: IntegrationCategoryId): string {
  return INTEGRATION_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}
