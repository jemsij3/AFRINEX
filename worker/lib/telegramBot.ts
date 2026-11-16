import type { ProPlanDetails, ProPlanId } from '../../shared/types.ts';

export const PRO_PLANS: Record<ProPlanId, ProPlanDetails> = {
  pro_monthly: {
    id: 'pro_monthly',
    title: 'AFRINEX Pro — Monthly',
    description: 'Unlock all Pro courses, advanced AI builder templates, and priority features for 30 days.',
    starsAmount: 150,
    durationDays: 30,
  },
  pro_yearly: {
    id: 'pro_yearly',
    title: 'AFRINEX Pro — Annual',
    description: 'Full 365-day AFRINEX Pro membership with annual savings via Telegram Stars.',
    starsAmount: 1500,
    durationDays: 365,
  },
};

export async function createStarsInvoiceLink(
  botToken: string,
  params: {
    title: string;
    description: string;
    payload: string;
    starsAmount: number;
  }
): Promise<string> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      description: params.description,
      payload: params.payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: params.title, amount: params.starsAmount }],
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    result?: string;
    description?: string;
  };

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description || 'Telegram createInvoiceLink failed');
  }

  return data.result;
}

export async function answerPreCheckoutQuery(
  botToken: string,
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      ...(ok ? {} : { error_message: errorMessage || 'Invalid payment payload' }),
    }),
  });
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
}
