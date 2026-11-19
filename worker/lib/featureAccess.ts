import type { Context } from 'hono';
import type { AppSettingsConfig, PlatformUser } from '../../shared/types.ts';
import type { AppEnv } from '../types.ts';

export type BooleanFeatureSettingKey =
  | 'featureAiAssistantEnabled'
  | 'featureBuildersEnabled'
  | 'featureLearningEnabled'
  | 'featureToolsEnabled'
  | 'featureOpportunitiesEnabled'
  | 'featureTelegramServicesEnabled'
  | 'featureSubscriptionsEnabled';

export function isFeatureAccessible(
  settings: AppSettingsConfig,
  featureKey: BooleanFeatureSettingKey,
  user?: PlatformUser | null
): boolean {
  if (user?.role === 'admin') return true;
  return Boolean(settings[featureKey]);
}

export function featureDisabledResponse(c: Context<AppEnv>, featureLabel: string) {
  return c.json(
    {
      error: 'Feature disabled',
      message: `${featureLabel} is temporarily disabled by an administrator.`,
    },
    503
  );
}
