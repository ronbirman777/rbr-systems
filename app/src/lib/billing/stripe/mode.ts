import type { StripeMode } from "../types";

/**
 * The Stripe mode is ALWAYS derived from the secret key's own prefix, never from
 * a separate setting that could disagree with it. Test and Live objects (ids,
 * customers, subscriptions, webhook secrets) are therefore never mixed: every
 * stored Stripe id carries this mode, and the server only reads rows of the mode
 * its key belongs to.
 */
export function stripeModeFromSecretKey(key: string | undefined | null): StripeMode {
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  throw new Error("STRIPE_SECRET_KEY is not a recognisable Stripe key");
}

/** An event belongs to this deployment only if its livemode matches the key's mode. */
export function eventMatchesMode(mode: StripeMode, livemode: boolean): boolean {
  return (mode === "live") === livemode;
}
