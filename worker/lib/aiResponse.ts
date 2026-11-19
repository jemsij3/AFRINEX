export type AiResponseFormat =
  | 'string'
  | 'object'
  | 'choices'
  | 'content_parts'
  | 'empty';

export interface NormalizedAiResponse {
  text: string;
  json: Record<string, unknown> | null;
  format: AiResponseFormat;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeTrimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractTextFromParts(parts: unknown[]): string {
  const chunks: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      const cleaned = part.trim();
      if (cleaned) chunks.push(cleaned);
    } else if (isPlainRecord(part)) {
      const nested =
        safeTrimString(part.text) ||
        safeTrimString(part.content) ||
        safeTrimString(part.value);
      if (nested) chunks.push(nested);
    }
  }
  return chunks.join('\n').trim();
}

export function tryParseJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];

  // Strip fenced ```json ... ``` blocks if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1].trim());
  }

  // Extract outermost {...} object if surrounded by prose
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isPlainRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

function sanitizeExtractedText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '[object Object]') {
    return '';
  }
  return trimmed;
}

function extractFromUnknownValue(
  value: unknown,
  fallbackFormat: AiResponseFormat
): NormalizedAiResponse {
  if (value === null || value === undefined) {
    return { text: '', json: null, format: 'empty' };
  }

  if (typeof value === 'string') {
    const cleaned = sanitizeExtractedText(value);
    if (!cleaned) {
      return { text: '', json: null, format: 'empty' };
    }
    return {
      text: cleaned,
      json: tryParseJsonObject(cleaned),
      format: fallbackFormat,
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value), json: null, format: fallbackFormat };
  }

  if (Array.isArray(value)) {
    const text = sanitizeExtractedText(extractTextFromParts(value));
    if (!text) {
      return { text: '', json: null, format: 'empty' };
    }
    return {
      text,
      json: tryParseJsonObject(text),
      format: 'content_parts',
    };
  }

  if (isPlainRecord(value)) {
    // Check if the object itself wraps a text field
    const directText =
      safeTrimString(value.text) ||
      safeTrimString(value.content) ||
      safeTrimString(value.output_text);
    if (directText) {
      const cleaned = sanitizeExtractedText(directText);
      return {
        text: cleaned,
        json: tryParseJsonObject(cleaned) ?? value,
        format: 'object',
      };
    }

    // Structured JSON payload returned directly by Workers AI (e.g. output.response = { ... })
    try {
      const serialized = JSON.stringify(value);
      return {
        text: serialized,
        json: value,
        format: 'object',
      };
    } catch {
      return { text: '', json: null, format: 'empty' };
    }
  }

  return { text: '', json: null, format: 'empty' };
}

/**
 * Safely normalizes responses from Cloudflare Workers AI or OpenAI-compatible providers.
 * Handles strings, parsed JSON objects on `.response`, content-part arrays, and nested `.result`
 * envelopes without ever calling `.trim()` on non-strings or coercing objects to `[object Object]`.
 */
export function normalizeAiResponse(rawOutput: unknown): NormalizedAiResponse {
  if (rawOutput === null || rawOutput === undefined) {
    return { text: '', json: null, format: 'empty' };
  }

  if (typeof rawOutput === 'string' || Array.isArray(rawOutput)) {
    return extractFromUnknownValue(rawOutput, 'string');
  }

  if (!isPlainRecord(rawOutput)) {
    return { text: '', json: null, format: 'empty' };
  }

  const envelope = isPlainRecord(rawOutput.result) ? rawOutput.result : rawOutput;

  if (envelope.response !== undefined && envelope.response !== null) {
    const fromResponse = extractFromUnknownValue(envelope.response, 'string');
    if (fromResponse.text || fromResponse.json) {
      return fromResponse;
    }
  }

  const choices = envelope.choices;
  if (Array.isArray(choices) && choices.length > 0 && isPlainRecord(choices[0])) {
    const firstChoice = choices[0];
    const message = isPlainRecord(firstChoice.message) ? firstChoice.message : null;
    if (message && message.content !== undefined && message.content !== null) {
      const fromChoice = extractFromUnknownValue(message.content, 'choices');
      if (fromChoice.text || fromChoice.json) {
        return fromChoice;
      }
    }
    if (firstChoice.text !== undefined && firstChoice.text !== null) {
      const fromChoiceText = extractFromUnknownValue(firstChoice.text, 'choices');
      if (fromChoiceText.text || fromChoiceText.json) {
        return fromChoiceText;
      }
    }
  }

  if (envelope.output_text !== undefined && envelope.output_text !== null) {
    const fromOutputText = extractFromUnknownValue(envelope.output_text, 'string');
    if (fromOutputText.text || fromOutputText.json) {
      return fromOutputText;
    }
  }

  if (envelope.content !== undefined && envelope.content !== null) {
    const fromContent = extractFromUnknownValue(envelope.content, 'object');
    if (fromContent.text || fromContent.json) {
      return fromContent;
    }
  }

  if (envelope.text !== undefined && envelope.text !== null) {
    const fromText = extractFromUnknownValue(envelope.text, 'string');
    if (fromText.text || fromText.json) {
      return fromText;
    }
  }

  // Last resort: check if the envelope itself is a domain JSON object (not just an error/empty wrapper)
  const keys = Object.keys(envelope).filter(
    (k) => k !== 'usage' && k !== 'response' && k !== 'choices'
  );
  if (keys.length > 0) {
    try {
      return {
        text: JSON.stringify(envelope),
        json: envelope,
        format: 'object',
      };
    } catch {
      return { text: '', json: null, format: 'empty' };
    }
  }

  return { text: '', json: null, format: 'empty' };
}

export function extractAiText(rawOutput: unknown): string {
  const normalized = normalizeAiResponse(rawOutput);
  if (normalized.json) {
    for (const candidateKey of ['reply', 'message', 'answer', 'content', 'summary']) {
      const val = normalized.json[candidateKey];
      if (typeof val === 'string' && val.trim() && val.trim() !== '[object Object]') {
        return val.trim();
      }
    }
  }
  return normalized.text;
}

export function extractAiJsonObject(rawOutput: unknown): Record<string, unknown> | null {
  const normalized = normalizeAiResponse(rawOutput);
  return normalized.json;
}
