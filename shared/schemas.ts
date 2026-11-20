import { z } from 'zod';

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'https:' || protocol === 'http:';
      } catch {
        return false;
      }
    },
    { message: 'URL must use http:// or https://' }
  );

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, 'Telegram initData is required'),
});

export const adminPermissionEnum = z.enum([
  'users.manage',
  'learning.manage',
  'tools.manage',
  'opportunities.manage',
  'ai.manage',
  'builders.manage',
  'billing.manage',
  'announcements.manage',
  'settings.manage',
  'audit.view',
]);

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(['member', 'admin']).optional(),
    tier: z.enum(['free', 'pro']).optional(),
    accountStatus: z.enum(['active', 'suspended']).optional(),
    suspendedReason: z.string().trim().max(300).nullable().optional(),
    adminPermissions: z.array(adminPermissionEnum).max(20).optional(),
  })
  .refine(
    (data) =>
      data.role !== undefined ||
      data.tier !== undefined ||
      data.accountStatus !== undefined ||
      data.adminPermissions !== undefined,
    {
      message: 'At least one user field must be provided',
    }
  );

export const courseResourceSchema = z.object({
  title: z.string().trim().min(1).max(120),
  url: httpUrlSchema,
});

export const adminCreateCourseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(10).max(500),
  track: z.enum(['beginner', 'intermediate', 'advanced']),
  category: z.string().trim().min(2).max(60),
  isPro: z.boolean().default(false),
  imageUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
  resources: z.array(courseResourceSchema).max(20).optional(),
});

export const adminUpdateCourseSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    summary: z.string().trim().min(10).max(500).optional(),
    track: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    category: z.string().trim().min(2).max(60).optional(),
    isPro: z.boolean().optional(),
    published: z.boolean().optional(),
    imageUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
    resources: z.array(courseResourceSchema).max(20).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one course field must be provided',
  });

export const adminCreateLessonSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(3).max(120),
  contentMd: z.string().trim().min(10).max(12000),
  durationMins: z.number().int().min(1).max(240).default(10),
  sortOrder: z.number().int().min(1).max(500).default(1),
  published: z.boolean().default(true),
});

export const adminUpdateLessonSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    contentMd: z.string().trim().min(10).max(12000).optional(),
    durationMins: z.number().int().min(1).max(240).optional(),
    sortOrder: z.number().int().min(1).max(500).optional(),
    published: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one lesson field must be provided',
  });

export const adminReorderLessonsSchema = z.object({
  lessonIds: z.array(z.string().min(1)).min(1).max(500),
});

export const adminPublishToggleSchema = z
  .object({
    published: z.boolean().optional(),
  })
  .optional();

export const adminFeatureToggleSchema = z
  .object({
    featured: z.boolean().optional(),
  })
  .optional();

export const adminArchiveToggleSchema = z
  .object({
    archived: z.boolean().optional(),
  })
  .optional();

export const adminCreateToolSchema = z.object({
  name: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(10).max(500),
  category: z.enum(['writing', 'coding', 'design', 'productivity', 'business']),
  url: httpUrlSchema,
  pricingModel: z.enum(['free', 'freemium', 'paid', 'open-source']).default('freemium'),
  featured: z.boolean().default(false),
});

export const adminUpdateToolSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    summary: z.string().trim().min(10).max(500).optional(),
    category: z.enum(['writing', 'coding', 'design', 'productivity', 'business']).optional(),
    url: httpUrlSchema.optional(),
    pricingModel: z.enum(['free', 'freemium', 'paid', 'open-source']).optional(),
    featured: z.boolean().optional(),
    published: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one tool field must be provided',
  });

export const opportunityTypeEnum = z.enum([
  'job',
  'freelance',
  'scholarship',
  'grant',
  'event',
  'startup',
  'programs',
]);

export const adminCreateOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(140),
  organization: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(10).max(600),
  opportunityType: opportunityTypeEnum,
  region: z.enum(['africa', 'global', 'remote']),
  url: httpUrlSchema,
  deadline: z.string().trim().max(40).optional(),
  featured: z.boolean().default(false),
});

export const adminUpdateOpportunitySchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    organization: z.string().trim().min(2).max(100).optional(),
    summary: z.string().trim().min(10).max(600).optional(),
    opportunityType: opportunityTypeEnum.optional(),
    region: z.enum(['africa', 'global', 'remote']).optional(),
    url: httpUrlSchema.optional(),
    deadline: z.string().trim().max(40).nullable().optional(),
    published: z.boolean().optional(),
    featured: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one opportunity field must be provided',
  });

export const adminAiConfigSchema = z.object({
  aiEnabled: z.boolean(),
  aiFreeDailyLimit: z.number().int().min(1).max(1000),
  aiSystemPrompt: z.string().trim().min(10).max(2000),
});

export const builderTypeEnum = z.enum([
  'telegram_bot',
  'ai_agent',
  'website',
  'mini_app',
  'workflow',
]);

export const adminBuildersConfigSchema = z.object({
  buildersEnabled: z.boolean(),
  enabledBuilderTypes: z.array(builderTypeEnum).min(0).max(5),
  builderDailyLimit: z.number().int().min(1).max(500),
});

export const adminReconcilePaymentSchema = z.object({
  reconciliationNote: z.string().trim().min(3).max(500),
});

export const adminAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(5).max(2000),
  audience: z.enum(['all', 'free', 'pro']).default('all'),
  published: z.boolean().default(false),
});

export const adminAppSettingsSchema = z
  .object({
    platformName: z.string().trim().min(2).max(60).optional(),
    platformSlogan: z.string().trim().min(2).max(140).optional(),
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().trim().min(5).max(300).optional(),
    registrationEnabled: z.boolean().optional(),
    featureAiAssistantEnabled: z.boolean().optional(),
    featureBuildersEnabled: z.boolean().optional(),
    featureLearningEnabled: z.boolean().optional(),
    featureToolsEnabled: z.boolean().optional(),
    featureOpportunitiesEnabled: z.boolean().optional(),
    featureTelegramServicesEnabled: z.boolean().optional(),
    featureSubscriptionsEnabled: z.boolean().optional(),
    aiFreeDailyLimit: z.number().int().min(1).max(1000).optional(),
    aiSystemPrompt: z.string().trim().min(10).max(2000).optional(),
    builderDailyLimit: z.number().int().min(1).max(500).optional(),
    enabledBuilderTypes: z.array(builderTypeEnum).min(0).max(5).optional(),
    proMonthlyStars: z.number().int().min(1).max(50000).optional(),
    proYearlyStars: z.number().int().min(1).max(250000).optional(),
    freePlanLabel: z.string().trim().min(2).max(40).optional(),
    proPlanLabel: z.string().trim().min(2).max(40).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one settings field must be provided',
  });

export const lessonProgressSchema = z.object({
  completed: z.boolean().default(true),
});

export const dashboardProfileUpdateSchema = z
  .object({
    first_name: z.string().trim().min(1).max(80).optional(),
    last_name: z.string().trim().max(80).nullable().optional(),
    language_code: z.string().trim().min(2).max(16).optional(),
    photo_url: httpUrlSchema.nullable().optional().or(z.literal('')),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().max(80).nullable().optional(),
    languageCode: z.string().trim().min(2).max(16).optional(),
    photoUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
  })
  .refine(
    (data) =>
      data.first_name !== undefined ||
      data.last_name !== undefined ||
      data.language_code !== undefined ||
      data.photo_url !== undefined ||
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.languageCode !== undefined ||
      data.photoUrl !== undefined,
    { message: 'At least one profile field must be provided' }
  );

export const aiChatSchema = z.object({
  conversationId: z.string().min(1).optional(),
  topic: z.enum(['general', 'tech', 'ai', 'web3', 'business']).optional(),
  message: z.string().trim().min(2).max(4000),
});

export const telegramBotConfigSchema = z.object({
  botPurpose: z.string().trim().min(3).max(400),
  commands: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  keyboardType: z.enum(['inline', 'reply', 'both', 'none']).default('inline'),
  userRegistrationEnabled: z.boolean().default(true),
  adminFeaturesEnabled: z.boolean().default(true),
  aiIntegrationEnabled: z.boolean().default(false),
  storageBackend: z.enum(['d1', 'kv', 'memory']).default('d1'),
  webhookMode: z.enum(['cloudflare_webhook', 'long_polling']).default('cloudflare_webhook'),
  externalIntegrations: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});

export const aiAgentConfigSchema = z.object({
  agentIdentity: z.string().trim().min(2).max(240),
  systemInstructions: z.string().trim().min(5).max(2000),
  aiProviderModel: z.string().trim().min(2).max(160),
  knowledgeBaseSummary: z.string().trim().max(1500).default(''),
  tools: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  memoryMode: z.enum(['d1_conversation', 'session_window', 'stateless']).default('d1_conversation'),
  accessControl: z.enum(['public', 'authenticated_users', 'admin_only']).default('authenticated_users'),
});

export const websiteConfigSchema = z.object({
  websiteType: z.enum(['landing', 'saas', 'portfolio', 'ecommerce', 'docs', 'community']).default('saas'),
  brandStyle: z.enum(['minimal_editorial', 'modern_dark', 'vibrant_startup', 'corporate_clean']).default('minimal_editorial'),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
  pages: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  includeBackendApi: z.boolean().default(false),
  includeDatabaseAuth: z.boolean().default(false),
  includeForms: z.boolean().default(true),
  includePayments: z.boolean().default(false),
});

export const miniAppConfigSchema = z.object({
  targetPlatform: z.enum(['telegram_mini_app', 'mobile_pwa', 'cross_platform_web']).default('telegram_mini_app'),
  screens: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
  authMode: z.enum(['telegram_initdata', 'token_session', 'public']).default('telegram_initdata'),
  backendDatabaseEnabled: z.boolean().default(true),
  telegramSdkEnabled: z.boolean().default(true),
  paymentsMode: z.enum(['none', 'telegram_stars', 'stripe_checkout']).default('none'),
  mobileTheme: z.enum(['telegram_adaptive', 'dark', 'light']).default('telegram_adaptive'),
});

export const automationConfigSchema = z.object({
  triggerType: z.enum(['webhook', 'cron_schedule', 'telegram_event', 'manual']).default('webhook'),
  scheduleCron: z.string().trim().max(60).default('0 */6 * * *'),
  webhookPath: z.string().trim().max(120).default('/hooks/trigger'),
  integrations: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  conditions: z.string().trim().max(500).default(''),
  actions: z.array(z.string().trim().min(1).max(120)).min(1).max(15),
  dataMapping: z.string().trim().max(1000).default(''),
  isActive: z.boolean().default(false),
});

export const builderConfigUnionSchema = z.union([
  telegramBotConfigSchema,
  aiAgentConfigSchema,
  websiteConfigSchema,
  miniAppConfigSchema,
  automationConfigSchema,
]);

export const createBuilderProjectSchema = z.object({
  builderType: builderTypeEnum,
  name: z.string().trim().min(2).max(80),
  prompt: z.string().trim().min(10).max(2500),
  generationStep: z.enum(['plan', 'full']).default('full'),
  config: builderConfigUnionSchema.optional(),
});

export const generateBuilderFilesSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  prompt: z.string().trim().min(10).max(2500).optional(),
  config: builderConfigUnionSchema.optional(),
});

export const regenerateBuilderFileSchema = z.object({
  filePath: z.string().trim().min(1).max(160),
  instructions: z.string().trim().max(800).optional(),
});

export const builderFileSchema = z.object({
  path: z.string().trim().min(1).max(160),
  language: z.string().trim().min(1).max(40),
  content: z.string().max(100000),
});

export const builderProjectStatusEnum = z.enum([
  'draft',
  'in_progress',
  'completed',
  'failed',
  'generated',
  'previewed',
  'deployed',
]);

export const updateBuilderProjectSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  prompt: z.string().trim().min(10).max(2500).optional(),
  config: builderConfigUnionSchema.optional(),
  files: z.array(builderFileSchema).max(20).optional(),
  status: builderProjectStatusEnum.optional(),
  folder: z.string().trim().min(1).max(40).optional(),
  isFavorite: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const createBuilderVersionSchema = z.object({
  label: z.string().trim().min(1).max(80).default('Manual Snapshot'),
});

export const testBuilderProjectSchema = z.object({
  testInput: z.string().trim().max(2000).optional(),
  command: z.string().trim().max(60).optional(),
  payloadJson: z.string().trim().max(4000).optional(),
});

export const deployBuilderProjectSchema = z.object({
  deployUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
  webhookUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
  markDeployed: z.boolean().default(true),
});

export const createStarsInvoiceSchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_yearly']),
});

export const bookmarkToggleSchema = z.object({
  itemType: z.enum(['course', 'tool', 'opportunity']),
  itemId: z.string().min(1),
});

export const opportunityApplicationSchema = z.object({
  status: z.enum(['saved', 'applied', 'interviewing', 'accepted', 'rejected', 'withdrawn']),
  appliedAt: z.string().trim().max(40).nullable().optional(),
  deadlineAt: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).default(''),
});

export const createIntegrationSchema = z.object({
  provider: z.enum(['telegram_bot', 'webhook', 'external_api', 'openai_compatible', 'custom']),
  name: z.string().trim().min(2).max(80),
  endpointUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
  secretValue: z.string().trim().max(2000).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const updateIntegrationSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    endpointUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
    secretValue: z.string().trim().max(2000).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['connected', 'error', 'disconnected']).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one integration field must be provided',
  });

export const testDraftIntegrationSchema = z.object({
  provider: z.enum(['telegram_bot', 'webhook', 'external_api', 'openai_compatible', 'custom']),
  endpointUrl: httpUrlSchema.nullable().optional().or(z.literal('')),
  secretValue: z.string().trim().max(2000).optional(),
});

export const notificationPreferencesSchema = z.object({
  telegramEnabled: z.boolean().optional(),
  deadlinesEnabled: z.boolean().optional(),
  aiEventsEnabled: z.boolean().optional(),
  projectEventsEnabled: z.boolean().optional(),
  billingEventsEnabled: z.boolean().optional(),
  announcementsEnabled: z.boolean().optional(),
});

export const createSupportTicketSchema = z.object({
  category: z.enum(['general', 'account', 'billing', 'builders', 'integrations', 'bug', 'feature']).default('general'),
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(10).max(3000),
});

export const adminUpdateSupportTicketSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    adminReply: z.string().trim().min(2).max(3000).optional(),
  })
  .refine((data) => data.status !== undefined || data.adminReply !== undefined, {
    message: 'Provide a status or reply message',
  });
