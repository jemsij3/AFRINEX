export interface TelegramInitUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface VerifiedInitData {
  user: TelegramInitUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}

const encoder = new TextEncoder();

async function hmacSha256Raw(keyBytes: Uint8Array, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
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
 * Verifies Telegram Mini App `initData` using Web Crypto HMAC-SHA256.
 * Compatible with Cloudflare Workers (zero Node.js `crypto` usage).
 */
export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 300
): Promise<VerifiedInitData> {
  const params = new URLSearchParams(initData);
  const providedHash = params.get('hash');
  if (!providedHash) {
    throw new Error('Missing Telegram initData hash');
  }

  const authDateRaw = params.get('auth_date');
  const authDate = Number(authDateRaw);
  if (!authDateRaw || !Number.isFinite(authDate)) {
    throw new Error('Invalid Telegram auth_date');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate - nowSeconds > 60) {
    throw new Error('Telegram auth_date is in the future');
  }
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new Error('Telegram initData has expired');
  }

  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      entries.push([key, value]);
    }
  });
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');

  const secretKeyBuffer = await hmacSha256Raw(encoder.encode('WebAppData'), botToken);
  const computedHashBuffer = await hmacSha256Raw(
    new Uint8Array(secretKeyBuffer),
    dataCheckString
  );
  const computedHashHex = bufferToHex(computedHashBuffer);

  if (!timingSafeEqualHex(computedHashHex, providedHash.toLowerCase())) {
    throw new Error('Invalid Telegram initData signature');
  }

  const userJson = params.get('user');
  if (!userJson) {
    throw new Error('Missing Telegram user payload');
  }

  const parsedUser = JSON.parse(userJson) as TelegramInitUser;
  if (!parsedUser || typeof parsedUser.id !== 'number' || !parsedUser.first_name) {
    throw new Error('Malformed Telegram user payload');
  }

  return {
    user: parsedUser,
    authDate,
    queryId: params.get('query_id') ?? undefined,
    startParam: params.get('start_param') ?? undefined,
  };
}
