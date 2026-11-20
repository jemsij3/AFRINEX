import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createStarsInvoiceSchema } from '../../shared/schemas.ts';
import type { PaymentRecord, StarsInvoiceResponse } from '../../shared/types.ts';
import { createStarsInvoiceLink, PRO_PLANS } from '../lib/telegramBot.ts';
import { getInvoiceSigningSecret, signInvoicePayload } from '../lib/invoicePayload.ts';
import { logSystemEvent } from '../lib/monitoring.ts';
import { getAppSettings, getDynamicProPlans } from '../lib/settings.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const paymentRoutes = new Hono<AppEnv>();

paymentRoutes.get('/plans', async (c) => {
  const plans = c.env.DB
    ? getDynamicProPlans(await getAppSettings(c.env.DB))
    : PRO_PLANS;
  return c.json({
    currency: 'XTR',
    plans: Object.values(plans),
  });
});

paymentRoutes.get('/history', requireAuth, async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, user_id, plan, telegram_payment_charge_id, currency, amount, status, reconciliation_note, reconciled_at, failed_reason, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
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
      reconciliation_note?: string | null;
      reconciled_at?: string | null;
      failed_reason?: string | null;
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
    reconciliationNote: row.reconciliation_note ?? null,
    reconciledAt: row.reconciled_at ?? null,
    failedReason: row.failed_reason ?? null,
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
    const db = c.env.DB;
    const user = c.get('user')!;
    const { plan } = c.req.valid('json');

    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }

    const settings = await getAppSettings(db);
    if (!settings.featureSubscriptionsEnabled && user.role !== 'admin') {
      return c.json(
        {
          error: 'Subscriptions paused',
          message: 'AFRINEX Pro upgrades are temporarily paused by an administrator.',
        },
        503
      );
    }

    const plans = getDynamicProPlans(settings);
    const selectedPlan = plans[plan];

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

    const paymentId = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const pendingChargePlaceholder = `pending_${paymentId}`;

    await db
      .prepare(
        `INSERT INTO payments (id, user_id, plan, telegram_payment_charge_id, provider_payment_charge_id, currency, amount, status)
         VALUES (?, ?, ?, ?, NULL, 'XTR', ?, 'pending')`
      )
      .bind(paymentId, user.id, selectedPlan.id, pendingChargePlaceholder, selectedPlan.starsAmount)
      .run();

    const invoicePayload = await signInvoicePayload(
      user.id,
      selectedPlan.id,
      signingSecret,
      paymentId
    );

    try {
      const invoiceLink = await createStarsInvoiceLink(c.env.TELEGRAM_BOT_TOKEN, {
        title: selectedPlan.title,
        description: selectedPlan.description,
        payload: invoicePayload,
        starsAmount: selectedPlan.starsAmount,
      });

      const response: StarsInvoiceResponse = {
        paymentId,
        invoiceLink,
        plan: selectedPlan,
      };
      return c.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create Stars invoice.';
      await Promise.all([
        db
          .prepare("UPDATE payments SET failed_reason = ? WHERE id = ? AND status = 'pending'")
          .bind(message.slice(0, 300), paymentId)
          .run()
          .catch(() => {}),
        logSystemEvent(db, {
          level: 'error',
          category: 'payment',
          eventName: 'payment.stars_invoice_failed',
          message,
          userId: user.id,
          requestPath: c.req.path,
          statusCode: 502,
          metadata: { paymentId, plan: selectedPlan.id },
        }),
      ]);
      return c.json({ error: 'Invoice creation failed', message }, 502);
    }
  }
);

export default paymentRoutes;
