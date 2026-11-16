import type { MembershipTier, UserRole } from '../../shared/types.ts';

export interface SessionJwtPayload {
  sub: string;
  tgId: number;
  role: UserRole;
  tier: MembershipTier;
  tv?: number;
  iat: number;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signSessionJwt(
  payload: Omit<SessionJwtPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds = 60 * 60 * 12
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionJwtPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const headerSegment = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadSegment = toBase64Url(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureSegment = toBase64Url(new Uint8Array(signature));

  return `${signingInput}.${signatureSegment}`;
}

export async function verifySessionJwt(
  token: string,
  secret: string
): Promise<SessionJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed session token');
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signingInput = `${headerSegment}.${payloadSegment}`;

  const key = await importHmacKey(secret);
  const signatureBytes = fromBase64Url(signatureSegment);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(signingInput)
  );

  if (!valid) {
    throw new Error('Invalid session signature');
  }

  const payloadJson = decoder.decode(fromBase64Url(payloadSegment));
  const payload = JSON.parse(payloadJson) as SessionJwtPayload;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('Session token expired');
  }

  return payload;
}
