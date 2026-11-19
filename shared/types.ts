export type PlatformSectionId =
  | 'hub'
  | 'assistant'
  | 'builders'
  | 'telegram-bots'
  | 'learning'
  | 'tools'
  | 'opportunities'
  | 'dashboard'
  | 'admin';

export type UserRole = 'member' | 'admin';
export type EffectiveUserRole = 'owner' | 'admin' | 'member';
export type AccountStatus = 'active' | 'suspended';
export type MembershipTier = 'free' | 'pro';

export type AdminPermission =
  | 'users.manage'
  | 'learning.manage'
  | 'tools.manage'
  | 'opportunities.manage'
  | 'ai.manage'
  | 'builders.manage'
  | 'billing.manage'
  | 'announcements.manage'
  | 'settings.manage'
  | 'audit.view';

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
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
];

export interface PlatformUser {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl?: string | null;
  languageCode?: string | null;
  role: UserRole;
  effectiveRole?: EffectiveUserRole;
  isOwner?: boolean;
  accountStatus?: AccountStatus;
  adminPermissions?: AdminPermission[];
  lastActiveAt?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
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
  actorName?: string | null;
  actorUsername?: string | null;
  actorTelegramId?: number | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadataJson: string;
  createdAt: string;
}

export interface AdminOverviewMetrics {
  newUsers7d: number;
  newUsers30d: number;
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  ownerCount: number;
  adminCount: number;
  suspendedCount: number;
  publishedCourses: number;
  publishedLessons: number;
  aiRequestsTotal: number;
  aiRequestsToday: number;
  aiErrorsTotal: number;
  activeProSubscriptions: number;
  completedRevenue: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  builderBreakdown: Array<{ builderType: BuilderType; count: number }>;
}

export interface AdminConfigStatus {
  adminIdsConfigured: boolean;
  telegramBotConfigured: boolean;
  workersAiBound: boolean;
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
  metrics?: AdminOverviewMetrics;
  adminConfigStatus?: AdminConfigStatus;
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

export interface AdminUserDetailResponse {
  user: PlatformUser;
  learning: {
    completedLessons: number;
    totalLessons: number;
    enrolledCourses: Array<{
      courseId: string;
      title: string;
      track: LearningTrack;
      enrolledAt: string;
      completedLessons: number;
      totalLessons: number;
    }>;
    certificates: CourseCertificate[];
  };
  aiUsage: {
    usedToday: number;
    totalRequests: number;
    totalConversations: number;
  };
  builderProjects: Array<{
    id: string;
    name: string;
    builderType: BuilderType;
    status: string;
    createdAt: string;
  }>;
  subscriptions: AdminSubscriptionEntry[];
  payments: AdminPaymentEntry[];
  recentAuditLogs: AuditLogEntry[];
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
  pending_payments?: number;
  failed_payments?: number;
  refunded_payments?: number;
  refunded_revenue?: number;
}

export interface AdminAiUsageResponse {
  total_messages: number;
  daily_average: number;
  active_users: number;
}

export interface AdminAiControlResponse {
  model: string;
  workersAiBound: boolean;
  config: {
    aiEnabled: boolean;
    aiFreeDailyLimit: number;
    aiSystemPrompt: string;
  };
  stats: {
    totalMessages: number;
    totalConversations: number;
    dailyAverage: number;
    activeUsers: number;
    requests24h: number;
    errorsTotal: number;
    errors24h: number;
    recentErrors: Array<{
      id: string;
      model: string;
      errorMessage: string | null;
      createdAt: string;
    }>;
  };
}

export interface AdminBuilderProjectEntry {
  id: string;
  userId: string;
  builderType: BuilderType;
  name: string;
  prompt: string;
  status: 'draft' | 'generated' | 'previewed' | 'deployed';
  createdAt: string;
  updatedAt: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  telegramId: number;
}

export interface AdminBuildersResponse {
  projects: AdminBuilderProjectEntry[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  countsByType: Array<{ builderType: BuilderType; count: number }>;
  config: {
    buildersEnabled: boolean;
    enabledBuilderTypes: BuilderType[];
    builderDailyLimit: number;
  };
}

export interface AdminPaginatedAuditLogsResponse {
  audit_logs: AuditLogEntry[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export type AnnouncementAudience = 'all' | 'free' | 'pro';
export type AnnouncementDeliveryStatus = 'draft' | 'published' | 'sent' | 'partial';

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  published: boolean;
  createdBy: string | null;
  sentAt: string | null;
  deliveryCount: number;
  deliveryStatus: AnnouncementDeliveryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingsConfig {
  platformName: string;
  platformSlogan: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationEnabled: boolean;
  featureAiAssistantEnabled: boolean;
  featureBuildersEnabled: boolean;
  featureLearningEnabled: boolean;
  featureToolsEnabled: boolean;
  featureOpportunitiesEnabled: boolean;
  featureTelegramServicesEnabled: boolean;
  featureSubscriptionsEnabled: boolean;
  aiFreeDailyLimit: number;
  aiSystemPrompt: string;
  builderDailyLimit: number;
  enabledBuilderTypes: BuilderType[];
  proMonthlyStars: number;
  proYearlyStars: number;
  freePlanLabel: string;
  proPlanLabel: string;
}

export interface PublicPlatformConfig {
  platformName: string;
  platformSlogan: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  registrationEnabled: boolean;
  features: {
    aiAssistant: boolean;
    builders: boolean;
    learning: boolean;
    tools: boolean;
    opportunities: boolean;
    telegramServices: boolean;
    subscriptions: boolean;
  };
  enabledBuilderTypes: BuilderType[];
  aiFreeDailyLimit: number;
  builderDailyLimit: number;
  proMonthlyStars: number;
  proYearlyStars: number;
  freePlanLabel: string;
  proPlanLabel: string;
}

export type BuilderType =
  | 'telegram_bot'
  | 'ai_agent'
  | 'website'
  | 'mini_app'
  | 'workflow';

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

export interface TelegramBotBuilderConfig {
  botPurpose: string;
  commands: string[];
  keyboardType: 'inline' | 'reply' | 'both' | 'none';
  userRegistrationEnabled: boolean;
  adminFeaturesEnabled: boolean;
  aiIntegrationEnabled: boolean;
  storageBackend: 'd1' | 'kv' | 'memory';
  webhookMode: 'cloudflare_webhook' | 'long_polling';
  externalIntegrations: string[];
}

export interface AiAgentBuilderConfig {
  agentIdentity: string;
  systemInstructions: string;
  aiProviderModel: string;
  knowledgeBaseSummary: string;
  tools: string[];
  memoryMode: 'd1_conversation' | 'session_window' | 'stateless';
  accessControl: 'public' | 'authenticated_users' | 'admin_only';
}

export interface WebsiteBuilderConfig {
  websiteType: 'landing' | 'saas' | 'portfolio' | 'ecommerce' | 'docs' | 'community';
  brandStyle: 'minimal_editorial' | 'modern_dark' | 'vibrant_startup' | 'corporate_clean';
  primaryColor: string;
  pages: string[];
  includeBackendApi: boolean;
  includeDatabaseAuth: boolean;
  includeForms: boolean;
  includePayments: boolean;
}

export interface MiniAppBuilderConfig {
  targetPlatform: 'telegram_mini_app' | 'mobile_pwa' | 'cross_platform_web';
  screens: string[];
  authMode: 'telegram_initdata' | 'token_session' | 'public';
  backendDatabaseEnabled: boolean;
  telegramSdkEnabled: boolean;
  paymentsMode: 'none' | 'telegram_stars' | 'stripe_checkout';
  mobileTheme: 'telegram_adaptive' | 'dark' | 'light';
}

export interface AutomationBuilderConfig {
  triggerType: 'webhook' | 'cron_schedule' | 'telegram_event' | 'manual';
  scheduleCron: string;
  webhookPath: string;
  integrations: string[];
  conditions: string;
  actions: string[];
  dataMapping: string;
  isActive: boolean;
}

export type BuilderProjectConfig =
  | TelegramBotBuilderConfig
  | AiAgentBuilderConfig
  | WebsiteBuilderConfig
  | MiniAppBuilderConfig
  | AutomationBuilderConfig;

export interface BuilderProjectPlan {
  overview: string;
  modules: Array<{ name: string; responsibility: string }>;
  entryPoints: string[];
  dataModels: string[];
  integrations: string[];
  securityControls: string[];
  deploymentSteps: string[];
}

export interface BuilderTestRun {
  id: string;
  kind: 'command_sim' | 'agent_turn' | 'site_audit' | 'miniapp_audit' | 'workflow_exec';
  passed: boolean;
  inputSummary: string;
  outputSummary: string;
  details: Record<string, unknown>;
  executedAt: string;
}

export interface BuilderDeploymentConfig {
  targetEnvironment: 'cloudflare-workers' | 'cloudflare-pages';
  deployUrl: string | null;
  webhookUrl: string | null;
  readinessChecks: Array<{ label: string; passed: boolean; note?: string }>;
  cliCommands: string[];
  deployedAt: string | null;
}

export interface BuilderSpec {
  architectureSummary: string;
  targetRuntime: 'cloudflare-workers' | 'cloudflare-pages';
  capabilities: string[];
  envVarsNeeded: string[];
  generationMode: 'workers_ai' | 'starter_scaffold';
  config?: BuilderProjectConfig;
  plan?: BuilderProjectPlan;
  testHistory?: BuilderTestRun[];
  deployment?: BuilderDeploymentConfig;
  modelUsed?: string;
  generatedAt?: string;
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

export interface BuilderProvidersResponse {
  workersAiBound: boolean;
  defaultModel: string;
  models: Array<{
    id: string;
    label: string;
    provider: string;
    strength: string;
  }>;
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

export interface CourseResource {
  title: string;
  url: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string;
  track: LearningTrack;
  category: string;
  isPro: boolean;
  published: boolean;
  imageUrl?: string | null;
  resources?: CourseResource[];
  lessonCount: number;
  completedCount: number;
  enrollmentCount?: number;
  completionCount?: number;
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
  featured?: boolean;
  archived?: boolean;
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
  enrolledCourses?: Array<{
    courseId: string;
    title: string;
    track: LearningTrack;
    category: string;
    lessonCount: number;
    completedCount: number;
    enrolledAt: string;
  }>;
  certificates?: CourseCertificate[];
  recentProjects?: Array<{
    id: string;
    name: string;
    builderType: BuilderType;
    status: string;
    updatedAt: string;
  }>;
  subscriptions?: Array<{
    id: string;
    plan: string;
    status: 'active' | 'expired' | 'cancelled';
    startedAt: string;
    expiresAt: string;
  }>;
  announcements?: AnnouncementRecord[];
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
  reconciliationNote?: string | null;
  reconciledAt?: string | null;
  failedReason?: string | null;
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
