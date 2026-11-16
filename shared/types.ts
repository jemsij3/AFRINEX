export type PlatformSectionId =
  | 'hub'
  | 'assistant'
  | 'builders'
  | 'telegram'
  | 'telegram-bots'
  | 'learning'
  | 'tools'
  | 'opportunities'
  | 'dashboard'
  | 'admin';

export type UserRole = 'member' | 'admin';
export type MembershipTier = 'free' | 'pro';

export interface PlatformUser {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl?: string | null;
  languageCode?: string | null;
  role: UserRole;
  tier: MembershipTier;
  proExpiresAt: string | null;
  createdAt?: string;
}

export interface AuthSessionResponse {
  token: string;
  expiresAt: string;
  user: PlatformUser;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadataJson: string;
  createdAt: string;
}

export interface AdminOverviewResponse {
  counts: {
    users: number;
    courses: number;
    lessons: number;
    aiTools: number;
    opportunities: number;
    builderProjects: number;
    payments: number;
  };
  users: PlatformUser[];
  recentAuditLogs: AuditLogEntry[];
}

export interface AdminPaginatedUsersResponse {
  users: PlatformUser[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface AdminPaymentEntry extends PaymentRecord {
  username: string | null;
  firstName: string;
  lastName: string | null;
  telegramId: number;
}

export interface AdminPaginatedPaymentsResponse {
  payments: AdminPaymentEntry[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface AdminSubscriptionEntry {
  id: string;
  userId: string;
  plan: ProPlanId | string;
  status: 'active' | 'expired' | 'cancelled';
  startedAt: string;
  expiresAt: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  telegramId: number;
}

export interface AdminPaginatedSubscriptionsResponse {
  subscriptions: AdminSubscriptionEntry[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface AdminRevenueResponse {
  total_revenue: number;
  monthly_revenue: Array<{ month: string; amount: number }>;
  active_subscriptions: number;
  total_payments: number;
}

export interface AdminAiUsageResponse {
  total_messages: number;
  daily_average: number;
  active_users: number;
}

export interface AdminPaginatedAuditLogsResponse {
  audit_logs: AuditLogEntry[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export type BuilderType =
  | 'telegram_bot'
  | 'ai_agent'
  | 'website'
  | 'mini_app'
  | 'workflow';

export type TelegramServiceType =
  | 'bot_dev'
  | 'channel_tools'
  | 'mini_app'
  | 'integration'
  | 'support_automation';

export interface TelegramBotPublic {
  id: string;
  bot_username: string | null;
  bot_name: string | null;
  webhook_url: string | null;
  webhook_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TelegramBotAnalyticsResponse {
  stats: Array<{ event_type: string; count: number }>;
  recent: Array<{ event_type: string; event_data: string | null; created_at: string }>;
}

export interface BuilderFile {
  path: string;
  language: string;
  content: string;
}

export interface BuilderSpec {
  architectureSummary: string;
  targetRuntime: 'cloudflare-workers' | 'cloudflare-pages';
  capabilities: string[];
  envVarsNeeded: string[];
  generationMode: 'workers_ai' | 'starter_scaffold';
}

export interface BuilderProject {
  id: string;
  userId: string;
  builderType: BuilderType;
  name: string;
  prompt: string;
  spec: BuilderSpec;
  files: BuilderFile[];
  status: 'draft' | 'generated' | 'previewed' | 'deployed';
  createdAt: string;
  updatedAt: string;
}

export interface TelegramServiceConfig {
  recommendedBotCommands: string[];
  webhookEndpoint: string;
  requiredSecrets: string[];
  setupChecklist: string[];
}

export interface TelegramService {
  id: string;
  userId: string;
  serviceType: TelegramServiceType;
  title: string;
  requirements: string;
  config: TelegramServiceConfig;
  status: 'planned' | 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export type LearningTrack = 'beginner' | 'intermediate' | 'advanced';
export type AiToolCategory = 'writing' | 'coding' | 'design' | 'productivity' | 'business';
export type AiToolPricing = 'free' | 'freemium' | 'paid' | 'open-source';
export type OpportunityType =
  | 'job'
  | 'freelance'
  | 'scholarship'
  | 'grant'
  | 'event'
  | 'startup'
  | 'programs';
export type OpportunityRegion = 'africa' | 'global' | 'remote';

export interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string;
  track: LearningTrack;
  category: string;
  isPro: boolean;
  published: boolean;
  lessonCount: number;
  completedCount: number;
  bookmarked: boolean;
  enrolled?: boolean;
  createdAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  contentMd: string;
  durationMins: number;
  sortOrder: number;
  published?: boolean;
  completed: boolean;
  locked: boolean;
  createdAt: string;
}

export interface CourseProgressResponse {
  courseId: string;
  enrolled: boolean;
  completedLessons: number;
  totalLessons: number;
  percentComplete: number;
  completedLessonIds: string[];
}

export interface CourseCertificate {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  courseTrack?: LearningTrack;
  courseCategory?: string;
  recipientName?: string;
  certificateCode: string;
  issuedAt: string;
}

export interface AiTool {
  id: string;
  name: string;
  summary: string;
  category: AiToolCategory;
  url: string;
  pricingModel: AiToolPricing;
  featured: boolean;
  published: boolean;
  bookmarked: boolean;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  summary: string;
  opportunityType: OpportunityType;
  region: OpportunityRegion;
  url: string;
  deadline: string | null;
  published: boolean;
  bookmarked: boolean;
  createdAt: string;
}

export interface DashboardAiUsage {
  used_today: number;
  limit: number | 'unlimited';
  plan: MembershipTier | string;
}

export interface DashboardOverviewResponse {
  stats: {
    completedLessons: number;
    totalLessons: number;
    bookmarkCount: number;
    projectCount?: number;
  };
  project_count: number;
  ai_usage: DashboardAiUsage;
  bookmarks: {
    courses: Course[];
    tools: AiTool[];
    opportunities: Opportunity[];
  };
}

export interface HealthCheckResponse {
  ok: boolean;
  service: string;
  environment: string;
  runtime: 'cloudflare-workers';
  bindings: {
    d1: boolean;
    workersAi: boolean;
    telegramConfigured: boolean;
  };
  model: string;
  timestamp: string;
}

export type AiTopic = 'general' | 'tech' | 'ai' | 'web3' | 'business';

export interface AiConversation {
  id: string;
  userId: string;
  title: string;
  topic: AiTopic;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  createdAt: string;
}

export interface AiChatResponse {
  conversation: AiConversation;
  userMessage: AiMessage;
  assistantMessage: AiMessage;
}

export type ProPlanId = 'pro_monthly' | 'pro_yearly';

export interface ProPlanDetails {
  id: ProPlanId;
  title: string;
  description: string;
  starsAmount: number;
  durationDays: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  plan: ProPlanId | string;
  telegramPaymentChargeId: string;
  currency: string;
  amount: number;
  status: 'pending' | 'completed' | 'refunded';
  createdAt: string;
}

export interface StarsInvoiceResponse {
  paymentId: string;
  invoiceLink: string;
  plan: ProPlanDetails;
}

export interface PlatformSectionBlueprint {
  id: Exclude<PlatformSectionId, 'hub'>;
  title: string;
  shortLabel: string;
  summary: string;
  phaseTarget: string;
  endpoints: string[];
  d1Tables: string[];
}
