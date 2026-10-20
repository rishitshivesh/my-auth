export const REDACTED = "[redacted]";
export const TRUNCATION_SUFFIX = "…[truncated]";
export const DEPTH_LIMIT_MARKER = "[depth-limit]";
export const MAX_STRING_LENGTH = 500;
export const MAX_ARRAY_ITEMS = 50;
export const MAX_DEPTH = 5;

/**
 * Keys whose values must never reach the audit log. A bare `code` is treated
 * as a one-time code; keys such as `errorCode` are kept.
 */
const SENSITIVE_KEY =
  /pass|secret|token|authorization|cookie|credential|otp|recovery|hash|ciphertext|private|api_?key/i;

function isSensitiveKey(key: string): boolean {
  return key.toLowerCase() === "code" || SENSITIVE_KEY.test(key);
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return DEPTH_LIMIT_MARKER;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH) + TRUNCATION_SUFFIX
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return redactObject(value as Record<string, unknown>, depth + 1);
  }
  return null;
}

function redactObject(
  input: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = isSensitiveKey(key) ? REDACTED : redactValue(value, depth);
  }
  return output;
}

/** Pure, recursive redactor for audit metadata. Non-objects yield {}. */
export function redactMetadata(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  return redactObject(input as Record<string, unknown>, 0);
}
