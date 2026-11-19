const textEncoder = new TextEncoder();

/**
 * Constant-time UTF-8 string comparison to prevent timing side-channels
 * on webhook secrets, Telegram HMAC signatures, and invoice MACs.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bytesA = textEncoder.encode(a);
  const bytesB = textEncoder.encode(b);
  const maxLen = Math.max(bytesA.length, bytesB.length);

  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Returns the UTC calendar date (`YYYY-MM-DD`) for the given Date/epoch ms (default now).
 */
export function utcToday(dateOrMs: Date | number = new Date()): string {
  const date = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the ISO-8601 UTC midnight timestamp (`YYYY-MM-DDT00:00:00.000Z`) for the given date.
 */
export function utcDayStartIso(dateOrMs: Date | number = new Date()): string {
  return `${utcToday(dateOrMs)}T00:00:00.000Z`;
}
