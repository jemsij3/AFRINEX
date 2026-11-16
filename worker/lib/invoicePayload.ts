import type { ProPlanId } from '../../shared/types.ts';
import { getJwtSecret } from '../middleware/auth.ts';
import type { WorkerBindings } from '../types.ts';

const encoder = new TextEncoder();

export interface VerifiedInvoicePayload {
  userId: string;
  planId: ProPlanId;
  nonce: string;
}

export function getInvoiceSigningSecret(env: WorkerBindings): string | null {
  return getJwtSecret(env) ?? (env.TELEGRAM_WEBHOOK_SECRET || null);
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

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Produces a Telegram-compatible (<= 128 bytes) HMAC-signed invoice payload.
 * Format: afrinex:<userId>:<planId>:<nonce>:<24-hex-hmac>
 */
export async function signInvoicePayload(
  userId: string,
  planId: ProPlanId,
  secret: string
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
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
  if (!timingSafeEqualHex(expectedMac, providedMac.toLowerCase())) {
    return null;
  }

  return { userId, planId: planRaw, nonce };
}
