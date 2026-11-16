import { z } from 'zod';

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, 'Telegram initData is required'),
});

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(['member', 'admin']).optional(),
    tier: z.enum(['free', 'pro']).optional(),
  })
  .refine((data) => data.role !== undefined || data.tier !== undefined, {
    message: 'At least one of role or tier must be provided',
  });

export const adminCreateCourseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(10).max(500),
  track: z.enum(['beginner', 'intermediate', 'advanced']),
  category: z.string().trim().min(2).max(60),
  isPro: z.boolean().default(false),
});

export const adminUpdateCourseSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    summary: z.string().trim().min(10).max(500).optional(),
    track: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    category: z.string().trim().min(2).max(60).optional(),
    isPro: z.boolean().optional(),
    published: z.boolean().optional(),
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
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one opportunity field must be provided',
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

export const createBuilderProjectSchema = z.object({
  builderType: z.enum(['telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow']),
  name: z.string().trim().min(2).max(80),
  prompt: z.string().trim().min(10).max(2000),
});

export const createTelegramServiceSchema = z.object({
  serviceType: z.enum([
    'bot_dev',
    'channel_tools',
    'mini_app',
    'integration',
    'support_automation',
  ]),
  title: z.string().trim().min(3).max(100),
  requirements: z.string().trim().min(10).max(2000),
});

export const updateTelegramServiceStatusSchema = z.object({
  status: z.enum(['planned', 'active', 'paused']),
});

export const createStarsInvoiceSchema = z.object({
  plan: z.enum(['pro_monthly', 'pro_yearly']),
});

export const bookmarkToggleSchema = z.object({
  itemType: z.enum(['course', 'tool', 'opportunity']),
  itemId: z.string().min(1),
});
