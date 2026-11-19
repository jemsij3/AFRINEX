import type { ProPlanId } from '../../shared/types.ts';
import { timingSafeEqual } from '../../shared/utils.ts';
import { getJwtSecret } from '../middleware/auth.ts';
import type { WorkerBindings } from '../types.ts';

const encoder = new TextEncoder();

export interface VerifiedInvoicePayload {
  userId: string;
  planId: ProPlanId;
  nonce: string;
}

export function getInvoiceSigningSecret(env: WorkerBindings): string | null {
  const jwtSecret = getJwtSecret(env);
  if (jwtSecret) return jwtSecret;

  const webhookSecret =
    typeof env.TELEGRAM_WEBHOOK_SECRET === 'string' ? env.TELEGRAM_WEBHOOK_SECRET.trim() : '';
  if (env.ENVIRONMENT === 'development' && webhookSecret.length >= 16) {
    return webhookSecret;
  }
  if (webhookSecret.length >= 32) {
    return webhookSecret;
  }
  return null;
}

async function computeInvoiceMacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`afrinex-invoice:${body}`));
  return Array.from(new Uint8Array(sig))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Produces a Telegram-compatible (<= 128 bytes) HMAC-signed invoice payload.
 * Format: afrinex:<userId>:<planId>:<nonce>:<24-hex-hmac>
 */
export async function signInvoicePayload(
  userId: string,
  planId: ProPlanId,
  secret: string,
  nonceOverride?: string
): Promise<string> {
  const nonce = (nonceOverride ?? crypto.randomUUID().replace(/-/g, '').slice(0, 8)).slice(0, 24);
  const body = `${userId}:${planId}:${nonce}`;
  const mac = await computeInvoiceMacHex(body, secret);
  return `afrinex:${body}:${mac}`;
}

export async function verifyInvoicePayload(
  payload: string,
  secret: string
): Promise<VerifiedInvoicePayload | null> {
  const parts = payload.split(':');
  if (parts.length !== 5 || parts[0] !== 'afrinex') {
    return null;
  }

  const [, userId, planRaw, nonce, providedMac] = parts;
  if (!userId || !nonce || !providedMac) {
    return null;
  }
  if (planRaw !== 'pro_monthly' && planRaw !== 'pro_yearly') {
    return null;
  }

  const expectedMac = await computeInvoiceMacHex(`${userId}:${planRaw}:${nonce}`, secret);
  if (!timingSafeEqual(expectedMac, providedMac.toLowerCase())) {
    return null;
  }

  return { userId, planId: planRaw, nonce };
}
