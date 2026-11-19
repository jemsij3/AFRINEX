const ENC_PREFIX = 'enc:v1:';
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
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new Error('Invalid base64url token encoding.');
  }
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function decodeKeyBytes(rawKey: string | undefined): Uint8Array {
  const trimmed = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!trimmed) {
    throw new Error('BOT_TOKEN_ENCRYPTION_KEY is missing.');
  }

  let bytes: Uint8Array | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      bytes[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    try {
      const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const binary = atob(padded);
      const decoded = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        decoded[i] = binary.charCodeAt(i);
      }
      if (decoded.length === 32) {
        bytes = decoded;
      }
    } catch {
      bytes = null;
    }
  }

  if (!bytes || bytes.length !== 32) {
    throw new Error(
      'BOT_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.'
    );
  }

  let nonZero = false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0) {
      nonZero = true;
      break;
    }
  }
  if (!nonZero) {
    throw new Error('BOT_TOKEN_ENCRYPTION_KEY must not be an all-zero key.');
  }

  return bytes;
}

export async function validateBotTokenEncryptionKey(rawKey: string | undefined): Promise<CryptoKey> {
  const keyBytes = decodeKeyBytes(rawKey);
  return crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isEncryptedBotToken(value: string): boolean {
  if (!value.startsWith(ENC_PREFIX)) return false;
  const parts = value.slice(ENC_PREFIX.length).split(':');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

export function looksLikePlaintextBotToken(value: string): boolean {
  return /^\d+:[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

export async function encryptBotToken(
  plaintextToken: string,
  rawKey: string | undefined,
  botId: string
): Promise<string> {
  const trimmedToken = plaintextToken.trim();
  if (!trimmedToken) {
    throw new Error('Bot token must not be empty.');
  }
  const key = await validateBotTokenEncryptionKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(`afrinex:telegram_bot:v1:${botId}`);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
    key,
    encoder.encode(trimmedToken) as BufferSource
  );
  return `${ENC_PREFIX}${toBase64Url(iv)}:${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptBotToken(
  storedValue: string,
  rawKey: string | undefined,
  botId: string,
  options: { allowLegacyPlaintext?: boolean } = {}
): Promise<string> {
  const key = await validateBotTokenEncryptionKey(rawKey);

  if (!storedValue.startsWith('enc:')) {
    if (options.allowLegacyPlaintext && looksLikePlaintextBotToken(storedValue)) {
      return storedValue.trim();
    }
    throw new Error('Stored Telegram bot token is not encrypted.');
  }

  if (!isEncryptedBotToken(storedValue)) {
    throw new Error('Unsupported encrypted bot token format.');
  }

  const [ivPart, cipherPart] = storedValue.slice(ENC_PREFIX.length).split(':');
  try {
    const iv = fromBase64Url(ivPart);
    const cipherBytes = fromBase64Url(cipherPart);
    if (iv.length !== 12) {
      throw new Error('Invalid IV length.');
    }
    const aad = encoder.encode(`afrinex:telegram_bot:v1:${botId}`);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource },
      key,
      cipherBytes as BufferSource
    );
    return decoder.decode(plainBuffer);
  } catch {
    throw new Error('Failed to decrypt stored Telegram bot token.');
  }
}
