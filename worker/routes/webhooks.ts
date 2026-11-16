import { Hono } from 'hono';
import {
  answerPreCheckoutQuery,
  PRO_PLANS,
  sendTelegramMessage,
} from '../lib/telegramBot.ts';
import { getInvoiceSigningSecret, verifyInvoicePayload } from '../lib/invoicePayload.ts';
import type { AppEnv } from '../types.ts';

const webhookRoutes = new Hono<AppEnv>();

interface TelegramUpdate {
  update_id?: number;
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id?: string;
    };
    refunded_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id?: string;
    };
  };
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

webhookRoutes.post('/telegram', async (c) => {
  const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');

  if (!expectedSecret) {
    return c.json(
      { error: 'Server misconfigured', message: 'TELEGRAM_WEBHOOK_SECRET is not set.' },
      500
    );
  }

  if (!providedSecret || !timingSafeEqualString(providedSecret, expectedSecret)) {
    return c.json({ error: 'Unauthorized webhook' }, 401);
  }

  const signingSecret = getInvoiceSigningSecret(c.env);
  if (!signingSecret) {
    return c.json(
      { error: 'Server misconfigured', message: 'Invoice signing secret is unavailable.' },
      500
    );
  }

  const update = (await c.req.json()) as TelegramUpdate;
  const db = c.env.DB;
  const botToken = c.env.TELEGRAM_BOT_TOKEN;

  // 1. Validate pre_checkout_query before Telegram finalizes Stars charge
  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const parsed = await verifyInvoicePayload(query.invoice_payload, signingSecret);
    let valid = false;
    let rejectReason = 'Invalid AFRINEX subscription invoice.';

    if (parsed && query.currency === 'XTR' && db) {
      const plan = PRO_PLANS[parsed.planId];
      if (query.total_amount === plan.starsAmount) {
        const userRow = await db
          .prepare('SELECT id, telegram_id FROM users WHERE id = ?')
          .bind(parsed.userId)
          .first<{ id: string; telegram_id: number }>();
        if (!userRow) {
          rejectReason = 'User account not found.';
        } else if (userRow.telegram_id !== query.from.id) {
          rejectReason = 'Invoice does not match Telegram payer account.';
        } else {
          valid = true;
        }
      } else {
        rejectReason = 'Payment amount mismatch.';
      }
    }

    if (botToken) {
      await answerPreCheckoutQuery(botToken, query.id, valid, rejectReason);
    }

    return c.json({ ok: true, preCheckoutValidated: valid });
  }

  // 2. Record completed Telegram Stars payment idempotently in D1
  if (update.message?.successful_payment && db) {
    const payment = update.message.successful_payment;
    const parsed = await verifyInvoicePayload(payment.invoice_payload, signingSecret);

    if (!parsed || payment.currency !== 'XTR') {
      return c.json({ ok: false, error: 'Unrecognized or tampered payment payload' }, 400);
    }

    const plan = PRO_PLANS[parsed.planId];
    if (payment.total_amount !== plan.starsAmount) {
      return c.json({ ok: false, error: 'Payment amount mismatch' }, 400);
    }

    const existing = await db
      .prepare('SELECT id FROM payments WHERE telegram_payment_charge_id = ?')
      .bind(payment.telegram_payment_charge_id)
      .first<{ id: string }>();

    if (existing) {
      return c.json({ ok: true, duplicate: true });
    }

    const currentUser = await db
      .prepare('SELECT id, tier, pro_expires_at FROM users WHERE id = ?')
      .bind(parsed.userId)
      .first<{ id: string; tier: 'free' | 'pro'; pro_expires_at: string | null }>();

    if (!currentUser) {
      return c.json({ ok: false, error: 'User account not found' }, 404);
    }

    const nowMs = Date.now();
    const existingExpiryMs = currentUser.pro_expires_at ? Date.parse(currentUser.pro_expires_at) : 0;
    const baseMs =
      currentUser.tier === 'pro' && Number.isFinite(existingExpiryMs) && existingExpiryMs > nowMs
        ? existingExpiryMs
        : nowMs;
    const expiresAt = new Date(baseMs + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();

    const paymentId = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const subscriptionId = `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

    await db.batch([
      db
        .prepare(
          `INSERT INTO payments (id, user_id, plan, telegram_payment_charge_id, provider_payment_charge_id, currency, amount, status)
           VALUES (?, ?, ?, ?, ?, 'XTR', ?, 'completed')`
        )
        .bind(
          paymentId,
          parsed.userId,
          plan.id,
          payment.telegram_payment_charge_id,
          payment.provider_payment_charge_id ?? null,
          payment.total_amount
        ),
      db
        .prepare(
          `INSERT INTO subscriptions (id, user_id, plan, status, expires_at)
           VALUES (?, ?, ?, 'active', ?)`
        )
        .bind(subscriptionId, parsed.userId, plan.id, expiresAt),
      db
        .prepare(
          "UPDATE users SET tier = 'pro', pro_expires_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
        )
        .bind(expiresAt, parsed.userId),
      db
        .prepare(
          'INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(
          crypto.randomUUID(),
          parsed.userId,
          'payment.stars_completed',
          'subscription',
          subscriptionId,
          JSON.stringify({ plan: plan.id, amount: payment.total_amount, currency: 'XTR', expiresAt })
        ),
    ]);

    if (botToken && update.message.chat?.id) {
      await sendTelegramMessage(
        botToken,
        update.message.chat.id,
        `Welcome to AFRINEX Pro! Your ${plan.title} membership is now active.`
      );
    }

    return c.json({ ok: true, paymentId, subscriptionId, expiresAt });
  }

  // 3. Handle Telegram Stars refunds & revoke Pro entitlement
  if (update.message?.refunded_payment && db) {
    const refund = update.message.refunded_payment;
    const paymentRow = await db
      .prepare('SELECT id, user_id, status FROM payments WHERE telegram_payment_charge_id = ?')
      .bind(refund.telegram_payment_charge_id)
      .first<{ id: string; user_id: string; status: 'pending' | 'completed' | 'refunded' }>();

    if (!paymentRow) {
      return c.json({ ok: true, ignored: 'payment_not_found' });
    }

    if (paymentRow.status === 'refunded') {
      return c.json({ ok: true, duplicateRefund: true });
    }

    await db.batch([
      db
        .prepare("UPDATE payments SET status = 'refunded' WHERE id = ?")
        .bind(paymentRow.id),
      db
        .prepare("UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'")
        .bind(paymentRow.user_id),
      db
        .prepare(
          "UPDATE users SET tier = 'free', pro_expires_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
        )
        .bind(paymentRow.user_id),
      db
        .prepare(
          'INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(
          crypto.randomUUID(),
          paymentRow.user_id,
          'payment.stars_refunded',
          'payment',
          paymentRow.id,
          JSON.stringify({
            chargeId: refund.telegram_payment_charge_id,
            amount: refund.total_amount,
            currency: refund.currency,
          })
        ),
    ]);

    return c.json({ ok: true, refundedPaymentId: paymentRow.id });
  }

  // 4. Handle basic Bot commands (/start, /help)
  if (update.message?.text && botToken) {
    const text = update.message.text.trim();
    if (text === '/start' || text === '/help') {
      await sendTelegramMessage(
        botToken,
        update.message.chat.id,
        'Welcome to AFRINEX — African Roots. Global Impact.\nOpen the Mini App using the menu button to access the AI Assistant, Builders, Learning Center, and Opportunities.'
      );
    }
  }

  return c.json({ ok: true });
});

export default webhookRoutes;
