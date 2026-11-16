import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createStarsInvoiceSchema } from '../../shared/schemas.ts';
import type { PaymentRecord, StarsInvoiceResponse } from '../../shared/types.ts';
import { createStarsInvoiceLink, PRO_PLANS } from '../lib/telegramBot.ts';
import { getInvoiceSigningSecret, signInvoicePayload } from '../lib/invoicePayload.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const paymentRoutes = new Hono<AppEnv>();

paymentRoutes.get('/plans', (c) => {
  return c.json({
    currency: 'XTR',
    plans: Object.values(PRO_PLANS),
  });
});

paymentRoutes.get('/history', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, user_id, plan, telegram_payment_charge_id, currency, amount, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    )
    .bind(user.id)
    .all<{
      id: string;
      user_id: string;
      plan: string;
      telegram_payment_charge_id: string;
      currency: string;
      amount: number;
      status: 'pending' | 'completed' | 'refunded';
      created_at: string;
    }>();

  const payments: PaymentRecord[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    telegramPaymentChargeId: row.telegram_payment_charge_id,
    currency: row.currency,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
  }));

  return c.json({ payments });
});

paymentRoutes.post(
  '/stars-invoice',
  requireAuth,
  rateLimit({ keyPrefix: 'stars_inv', limit: 10, windowSeconds: 60 }),
  zValidator('json', createStarsInvoiceSchema),
  async (c) => {
    const user = c.get('user')!;
    const { plan } = c.req.valid('json');
    const selectedPlan = PRO_PLANS[plan];

    if (!c.env.TELEGRAM_BOT_TOKEN) {
      return c.json(
        {
          error: 'Telegram Bot not configured',
          message:
            'TELEGRAM_BOT_TOKEN must be configured via Wrangler secret or .dev.vars to generate live Telegram Stars invoices.',
        },
        503
      );
    }

    const signingSecret = getInvoiceSigningSecret(c.env);
    if (!signingSecret) {
      return c.json(
        {
          error: 'Server misconfigured',
          message: 'JWT_SECRET (>= 32 chars) or TELEGRAM_WEBHOOK_SECRET is required for invoice signing.',
        },
        500
      );
    }

    const invoicePayload = await signInvoicePayload(user.id, selectedPlan.id, signingSecret);

    try {
      const invoiceLink = await createStarsInvoiceLink(c.env.TELEGRAM_BOT_TOKEN, {
        title: selectedPlan.title,
        description: selectedPlan.description,
        payload: invoicePayload,
        starsAmount: selectedPlan.starsAmount,
      });

      const response: StarsInvoiceResponse = {
        invoiceLink,
        plan: selectedPlan,
      };
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create Stars invoice.';
      return c.json({ error: 'Invoice creation failed', message }, 502);
    }
  }
);

export default paymentRoutes;
