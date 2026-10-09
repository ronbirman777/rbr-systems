/**
 * Audit before/after snapshots must never carry a secret. Any key that looks
 * secret-bearing is replaced, at any depth, before the row is written - the
 * audit table is append-only, so a secret that got in could never be removed.
 */
const SENSITIVE_KEY = /secret|token|password|passwd|totp|otp|authorization|api[_-]?key|card|cvc|cvv|pan\b|session|cookie|signature/i;
const MAX_DEPTH = 6;

export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value == null || typeof value !== "object") {
    return typeof value === "string" && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactForAudit(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactForAudit(v, depth + 1);
  }
  return out;
}
