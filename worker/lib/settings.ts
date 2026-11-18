import type {
  AppSettingsConfig,
  BuilderType,
  ProPlanDetails,
  ProPlanId,
  PublicPlatformConfig,
} from '../../shared/types.ts';
import { PRO_PLANS } from './telegramBot.ts';

export const DEFAULT_APP_SETTINGS: AppSettingsConfig = {
  platformName: 'AFRINEX',
  platformSlogan: 'African Roots. Global Impact.',
  maintenanceMode: false,
  maintenanceMessage:
    'AFRINEX is undergoing scheduled maintenance. Please check back shortly.',
  registrationEnabled: true,
  featureAiAssistantEnabled: true,
  featureBuildersEnabled: true,
  featureLearningEnabled: true,
  featureToolsEnabled: true,
  featureOpportunitiesEnabled: true,
  featureTelegramServicesEnabled: true,
  featureSubscriptionsEnabled: true,
  aiFreeDailyLimit: 20,
  aiSystemPrompt:
    'You are AFRINEX AI Assistant, a helpful AI focused on AI, technology, Web3, business, and general assistance. Be concise, accurate, and helpful.',
  builderDailyLimit: 10,
  enabledBuilderTypes: ['telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow'],
  proMonthlyStars: PRO_PLANS.pro_monthly.starsAmount,
  proYearlyStars: PRO_PLANS.pro_yearly.starsAmount,
  freePlanLabel: 'Free Member',
  proPlanLabel: 'AFRINEX Pro',
};

const KEY_TO_DB_MAP: Record<keyof AppSettingsConfig, string> = {
  platformName: 'platform_name',
  platformSlogan: 'platform_slogan',
  maintenanceMode: 'maintenance_mode',
  maintenanceMessage: 'maintenance_message',
  registrationEnabled: 'registration_enabled',
  featureAiAssistantEnabled: 'feature_ai_assistant_enabled',
  featureBuildersEnabled: 'feature_builders_enabled',
  featureLearningEnabled: 'feature_learning_enabled',
  featureToolsEnabled: 'feature_tools_enabled',
  featureOpportunitiesEnabled: 'feature_opportunities_enabled',
  featureTelegramServicesEnabled: 'feature_telegram_services_enabled',
  featureSubscriptionsEnabled: 'feature_subscriptions_enabled',
  aiFreeDailyLimit: 'ai_free_daily_limit',
  aiSystemPrompt: 'ai_system_prompt',
  builderDailyLimit: 'builder_daily_limit',
  enabledBuilderTypes: 'enabled_builder_types',
  proMonthlyStars: 'pro_monthly_stars',
  proYearlyStars: 'pro_yearly_stars',
  freePlanLabel: 'free_plan_label',
  proPlanLabel: 'pro_plan_label',
};

const VALID_BUILDER_TYPES: ReadonlySet<BuilderType> = new Set([
  'telegram_bot',
  'ai_agent',
  'website',
  'mini_app',
  'workflow',
]);

function parseJsonValue<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getAppSettings(db: D1Database): Promise<AppSettingsConfig> {
  try {
    const rows = await db
      .prepare('SELECT key, value_json FROM app_settings')
      .all<{ key: string; value_json: string }>();

    const map = new Map<string, string>();
    for (const row of rows.results ?? []) {
      map.set(row.key, row.value_json);
    }

    const parsedBuilderTypes = parseJsonValue<unknown>(
      map.get('enabled_builder_types'),
      DEFAULT_APP_SETTINGS.enabledBuilderTypes
    );
    const enabledBuilderTypes = Array.isArray(parsedBuilderTypes)
      ? parsedBuilderTypes.filter(
          (item): item is BuilderType =>
            typeof item === 'string' && VALID_BUILDER_TYPES.has(item as BuilderType)
        )
      : DEFAULT_APP_SETTINGS.enabledBuilderTypes;

    const aiFreeDailyLimit = Number(
      parseJsonValue<number>(map.get('ai_free_daily_limit'), DEFAULT_APP_SETTINGS.aiFreeDailyLimit)
    );
    const builderDailyLimit = Number(
      parseJsonValue<number>(map.get('builder_daily_limit'), DEFAULT_APP_SETTINGS.builderDailyLimit)
    );
    const proMonthlyStars = Number(
      parseJsonValue<number>(map.get('pro_monthly_stars'), DEFAULT_APP_SETTINGS.proMonthlyStars)
    );
    const proYearlyStars = Number(
      parseJsonValue<number>(map.get('pro_yearly_stars'), DEFAULT_APP_SETTINGS.proYearlyStars)
    );

    return {
      platformName:
        String(
          parseJsonValue<string>(map.get('platform_name'), DEFAULT_APP_SETTINGS.platformName)
        ).trim() || DEFAULT_APP_SETTINGS.platformName,
      platformSlogan:
        String(
          parseJsonValue<string>(map.get('platform_slogan'), DEFAULT_APP_SETTINGS.platformSlogan)
        ).trim() || DEFAULT_APP_SETTINGS.platformSlogan,
      maintenanceMode: Boolean(
        parseJsonValue<boolean>(map.get('maintenance_mode'), DEFAULT_APP_SETTINGS.maintenanceMode)
      ),
      maintenanceMessage:
        String(
          parseJsonValue<string>(
            map.get('maintenance_message'),
            DEFAULT_APP_SETTINGS.maintenanceMessage
          )
        ).trim() || DEFAULT_APP_SETTINGS.maintenanceMessage,
      registrationEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('registration_enabled'),
          DEFAULT_APP_SETTINGS.registrationEnabled
        )
      ),
      featureAiAssistantEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_ai_assistant_enabled'),
          DEFAULT_APP_SETTINGS.featureAiAssistantEnabled
        )
      ),
      featureBuildersEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_builders_enabled'),
          DEFAULT_APP_SETTINGS.featureBuildersEnabled
        )
      ),
      featureLearningEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_learning_enabled'),
          DEFAULT_APP_SETTINGS.featureLearningEnabled
        )
      ),
      featureToolsEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_tools_enabled'),
          DEFAULT_APP_SETTINGS.featureToolsEnabled
        )
      ),
      featureOpportunitiesEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_opportunities_enabled'),
          DEFAULT_APP_SETTINGS.featureOpportunitiesEnabled
        )
      ),
      featureTelegramServicesEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_telegram_services_enabled'),
          DEFAULT_APP_SETTINGS.featureTelegramServicesEnabled
        )
      ),
      featureSubscriptionsEnabled: Boolean(
        parseJsonValue<boolean>(
          map.get('feature_subscriptions_enabled'),
          DEFAULT_APP_SETTINGS.featureSubscriptionsEnabled
        )
      ),
      aiFreeDailyLimit:
        Number.isFinite(aiFreeDailyLimit) && aiFreeDailyLimit >= 1
          ? Math.floor(aiFreeDailyLimit)
          : DEFAULT_APP_SETTINGS.aiFreeDailyLimit,
      aiSystemPrompt:
        String(
          parseJsonValue<string>(map.get('ai_system_prompt'), DEFAULT_APP_SETTINGS.aiSystemPrompt)
        ).trim() || DEFAULT_APP_SETTINGS.aiSystemPrompt,
      builderDailyLimit:
        Number.isFinite(builderDailyLimit) && builderDailyLimit >= 1
          ? Math.floor(builderDailyLimit)
          : DEFAULT_APP_SETTINGS.builderDailyLimit,
      enabledBuilderTypes,
      proMonthlyStars:
        Number.isFinite(proMonthlyStars) && proMonthlyStars >= 1
          ? Math.floor(proMonthlyStars)
          : DEFAULT_APP_SETTINGS.proMonthlyStars,
      proYearlyStars:
        Number.isFinite(proYearlyStars) && proYearlyStars >= 1
          ? Math.floor(proYearlyStars)
          : DEFAULT_APP_SETTINGS.proYearlyStars,
      freePlanLabel:
        String(
          parseJsonValue<string>(map.get('free_plan_label'), DEFAULT_APP_SETTINGS.freePlanLabel)
        ).trim() || DEFAULT_APP_SETTINGS.freePlanLabel,
      proPlanLabel:
        String(
          parseJsonValue<string>(map.get('pro_plan_label'), DEFAULT_APP_SETTINGS.proPlanLabel)
        ).trim() || DEFAULT_APP_SETTINGS.proPlanLabel,
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export async function updateAppSettings(
  db: D1Database,
  actorUserId: string,
  updates: Partial<AppSettingsConfig>
): Promise<AppSettingsConfig> {
  const entries = Object.entries(updates) as Array<
    [keyof AppSettingsConfig, AppSettingsConfig[keyof AppSettingsConfig]]
  >;
  const statements: D1PreparedStatement[] = [];

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    const dbKey = KEY_TO_DB_MAP[key];
    if (!dbKey) continue;
    statements.push(
      db
        .prepare(
          `INSERT INTO app_settings (key, value_json, updated_by, updated_at)
           VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`
        )
        .bind(dbKey, JSON.stringify(value), actorUserId)
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return getAppSettings(db);
}

export function toPublicPlatformConfig(settings: AppSettingsConfig): PublicPlatformConfig {
  return {
    platformName: settings.platformName,
    platformSlogan: settings.platformSlogan,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    registrationEnabled: settings.registrationEnabled,
    features: {
      aiAssistant: settings.featureAiAssistantEnabled,
      builders: settings.featureBuildersEnabled,
      learning: settings.featureLearningEnabled,
      tools: settings.featureToolsEnabled,
      opportunities: settings.featureOpportunitiesEnabled,
      telegramServices: settings.featureTelegramServicesEnabled,
      subscriptions: settings.featureSubscriptionsEnabled,
    },
    enabledBuilderTypes: settings.enabledBuilderTypes,
    aiFreeDailyLimit: settings.aiFreeDailyLimit,
    builderDailyLimit: settings.builderDailyLimit,
    proMonthlyStars: settings.proMonthlyStars,
    proYearlyStars: settings.proYearlyStars,
    freePlanLabel: settings.freePlanLabel,
    proPlanLabel: settings.proPlanLabel,
  };
}

export function getDynamicProPlans(
  settings: AppSettingsConfig
): Record<ProPlanId, ProPlanDetails> {
  return {
    pro_monthly: {
      ...PRO_PLANS.pro_monthly,
      title: `${settings.proPlanLabel} — Monthly`,
      starsAmount: settings.proMonthlyStars,
    },
    pro_yearly: {
      ...PRO_PLANS.pro_yearly,
      title: `${settings.proPlanLabel} — Annual`,
      starsAmount: settings.proYearlyStars,
    },
  };
}
