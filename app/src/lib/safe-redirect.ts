/**
 * Validates that a value is safe to hand to redirect()/NextResponse.redirect()
 * after a sensitive server-side action - auth confirmation (which just
 * established a real session) and the preview-access gate (which just
 * granted staging access). Never an absolute URL, a protocol-relative URL
 * (//evil.example), a non-http(s) scheme (javascript:...), or anything
 * else that could send the visitor's browser off this site right after
 * one of those actions. Falls back to `fallback` for any value that fails
 * the check, including missing/empty/malformed input.
 *
 * Deliberately narrow - not a general routing/URL utility, just the one
 * question both call sites need answered: "is this safe to redirect to."
 */
export function safeInternalRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;

  // Must start with exactly one "/" - rules out absolute URLs (which don't
  // start with "/" at all) and protocol-relative ones (which start "//").
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  // Browsers treat a backslash as a path separator for http(s) URLs, so
  // "/\evil.example" can behave like "//evil.example" even though it
  // doesn't literally start with "//" - reject it the same way rather
  // than relying on the URL parser alone to catch it.
  if (value.startsWith("/\\")) return fallback;

  // Resolve against a fixed, arbitrary same-origin base and confirm the
  // parsed result didn't escape to a different origin or scheme - this is
  // what actually catches "javascript:...", odd encodings, etc., not just
  // the prefix checks above. Returns the original string (not the
  // resolved one) so a valid path's own query/hash pass through exactly
  // as given.
  const base = "http://localhost";
  try {
    if (new URL(value, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }

  return value;
}
