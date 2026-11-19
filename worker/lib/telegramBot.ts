import { DEFAULT_APP_SETTINGS } from '../../shared/settingsDefaults.ts';
import type { ProPlanDetails, ProPlanId } from '../../shared/types.ts';

export const PRO_PLANS: Record<ProPlanId, ProPlanDetails> = {
  pro_monthly: {
    id: 'pro_monthly',
    title: `${DEFAULT_APP_SETTINGS.proPlanLabel} — Monthly`,
    description: 'Unlock all Pro courses, advanced AI builder templates, and priority features for 30 days.',
    starsAmount: DEFAULT_APP_SETTINGS.proMonthlyStars,
    durationDays: 30,
  },
  pro_yearly: {
    id: 'pro_yearly',
    title: `${DEFAULT_APP_SETTINGS.proPlanLabel} — Annual`,
    description: 'Full 365-day AFRINEX Pro membership with annual savings via Telegram Stars.',
    starsAmount: DEFAULT_APP_SETTINGS.proYearlyStars,
    durationDays: 365,
  },
};

export async function callTelegramBotApi<T>(
  botToken: string,
  method: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const data = (await response.json().catch(() => null)) as {
    ok: boolean;
    result?: T;
    description?: string;
  } | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} request failed`);
  }

  return data.result as T;
}

export async function createStarsInvoiceLink(
  botToken: string,
  params: {
    title: string;
    description: string;
    payload: string;
    starsAmount: number;
  }
): Promise<string> {
  const result = await callTelegramBotApi<string>(botToken, 'createInvoiceLink', {
    title: params.title,
    description: params.description,
    payload: params.payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: params.title, amount: params.starsAmount }],
  });

  if (!result) {
    throw new Error('Telegram createInvoiceLink failed');
  }

  return result;
}

export async function answerPreCheckoutQuery(
  botToken: string,
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string
): Promise<void> {
  await callTelegramBotApi(botToken, 'answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(ok ? {} : { error_message: errorMessage || 'Invalid payment payload' }),
  });
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  await callTelegramBotApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
  });
}
