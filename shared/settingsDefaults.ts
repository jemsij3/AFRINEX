import defaultAppSettingsJson from './defaultAppSettings.json';
import type { AppSettingsConfig, BuilderType } from './types.ts';

type SettingKey = keyof AppSettingsConfig;

interface RawSettingDefinition {
  dbKey: string;
  value: unknown;
}

const RAW_SETTINGS = defaultAppSettingsJson as Record<SettingKey, RawSettingDefinition>;

export const DEFAULT_APP_SETTINGS: AppSettingsConfig = {
  platformName: RAW_SETTINGS.platformName.value as string,
  platformSlogan: RAW_SETTINGS.platformSlogan.value as string,
  maintenanceMode: RAW_SETTINGS.maintenanceMode.value as boolean,
  maintenanceMessage: RAW_SETTINGS.maintenanceMessage.value as string,
  registrationEnabled: RAW_SETTINGS.registrationEnabled.value as boolean,
  featureAiAssistantEnabled: RAW_SETTINGS.featureAiAssistantEnabled.value as boolean,
  featureBuildersEnabled: RAW_SETTINGS.featureBuildersEnabled.value as boolean,
  featureLearningEnabled: RAW_SETTINGS.featureLearningEnabled.value as boolean,
  featureToolsEnabled: RAW_SETTINGS.featureToolsEnabled.value as boolean,
  featureOpportunitiesEnabled: RAW_SETTINGS.featureOpportunitiesEnabled.value as boolean,
  featureTelegramServicesEnabled: RAW_SETTINGS.featureTelegramServicesEnabled.value as boolean,
  featureSubscriptionsEnabled: RAW_SETTINGS.featureSubscriptionsEnabled.value as boolean,
  aiFreeDailyLimit: RAW_SETTINGS.aiFreeDailyLimit.value as number,
  aiSystemPrompt: RAW_SETTINGS.aiSystemPrompt.value as string,
  builderDailyLimit: RAW_SETTINGS.builderDailyLimit.value as number,
  enabledBuilderTypes: [...(RAW_SETTINGS.enabledBuilderTypes.value as BuilderType[])],
  proMonthlyStars: RAW_SETTINGS.proMonthlyStars.value as number,
  proYearlyStars: RAW_SETTINGS.proYearlyStars.value as number,
  freePlanLabel: RAW_SETTINGS.freePlanLabel.value as string,
  proPlanLabel: RAW_SETTINGS.proPlanLabel.value as string,
};

export const APP_SETTING_DB_KEYS: Record<SettingKey, string> = {
  platformName: RAW_SETTINGS.platformName.dbKey,
  platformSlogan: RAW_SETTINGS.platformSlogan.dbKey,
  maintenanceMode: RAW_SETTINGS.maintenanceMode.dbKey,
  maintenanceMessage: RAW_SETTINGS.maintenanceMessage.dbKey,
  registrationEnabled: RAW_SETTINGS.registrationEnabled.dbKey,
  featureAiAssistantEnabled: RAW_SETTINGS.featureAiAssistantEnabled.dbKey,
  featureBuildersEnabled: RAW_SETTINGS.featureBuildersEnabled.dbKey,
  featureLearningEnabled: RAW_SETTINGS.featureLearningEnabled.dbKey,
  featureToolsEnabled: RAW_SETTINGS.featureToolsEnabled.dbKey,
  featureOpportunitiesEnabled: RAW_SETTINGS.featureOpportunitiesEnabled.dbKey,
  featureTelegramServicesEnabled: RAW_SETTINGS.featureTelegramServicesEnabled.dbKey,
  featureSubscriptionsEnabled: RAW_SETTINGS.featureSubscriptionsEnabled.dbKey,
  aiFreeDailyLimit: RAW_SETTINGS.aiFreeDailyLimit.dbKey,
  aiSystemPrompt: RAW_SETTINGS.aiSystemPrompt.dbKey,
  builderDailyLimit: RAW_SETTINGS.builderDailyLimit.dbKey,
  enabledBuilderTypes: RAW_SETTINGS.enabledBuilderTypes.dbKey,
  proMonthlyStars: RAW_SETTINGS.proMonthlyStars.dbKey,
  proYearlyStars: RAW_SETTINGS.proYearlyStars.dbKey,
  freePlanLabel: RAW_SETTINGS.freePlanLabel.dbKey,
  proPlanLabel: RAW_SETTINGS.proPlanLabel.dbKey,
};

export const DEFAULT_APP_SETTINGS_ROWS: ReadonlyArray<readonly [string, string]> = Object.values(
  RAW_SETTINGS
).map((entry) => [entry.dbKey, JSON.stringify(entry.value)] as const);
