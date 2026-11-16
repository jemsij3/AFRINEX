import { z } from 'zod';

export const telegramAuthSchema = z.object({
  initData: z.string().min(1, 'Telegram initData is required'),
});

export const devAuthSchema = z.object({
  role: z.enum(['member', 'admin']).default('member'),
  firstName: z.string().trim().min(1).max(60).optional(),
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

export const adminCreateLessonSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(3).max(120),
  contentMd: z.string().trim().min(10).max(12000),
  durationMins: z.number().int().min(1).max(240).default(10),
  sortOrder: z.number().int().min(1).max(500).default(1),
});

export const adminCreateToolSchema = z.object({
  name: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(10).max(500),
  category: z.enum(['writing', 'coding', 'design', 'productivity', 'business']),
  url: z.string().url(),
  pricingModel: z.enum(['free', 'freemium', 'paid', 'open-source']).default('freemium'),
  featured: z.boolean().default(false),
});

export const adminCreateOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(140),
  organization: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(10).max(600),
  opportunityType: z.enum(['job', 'freelance', 'scholarship', 'grant', 'event']),
  region: z.enum(['africa', 'global', 'remote']),
  url: z.string().url(),
  deadline: z.string().trim().max(40).optional(),
});

export const lessonProgressSchema = z.object({
  completed: z.boolean().default(true),
});

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
