/**
 * Supabase auth errors are internal-facing strings, not customer copy.
 * Maps the ones a real signup/login flow actually produces to InnerDweS's
 * own wording; anything unrecognized falls back to a safe generic message
 * rather than leaking the raw string.
 */
const KNOWN_MESSAGES: [match: string, friendly: string][] = [
  ["Email not confirmed", "Please confirm your email before logging in — check your inbox for the confirmation link we sent you."],
  ["Invalid login credentials", "That email or password isn't right. Double-check and try again."],
  ["User already registered", "An account with this email already exists — try logging in instead."],
  ["Password should be at least", "Your password needs to be at least 8 characters."],
  ["Unable to validate email address", "That doesn't look like a valid email address."],
  ["rate limit", "Too many attempts — please wait a few minutes and try again."],
];

export function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  for (const [match, friendly] of KNOWN_MESSAGES) {
    if (lower.includes(match.toLowerCase())) return friendly;
  }
  return "Something went wrong. Please try again.";
}
