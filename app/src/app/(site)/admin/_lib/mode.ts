import "server-only";
import { stripeModeFromSecretKey } from "@/lib/billing/stripe/mode";
import type { StripeMode } from "@/lib/billing/types";

/** The Stripe mode this deployment talks to (test/live) derived from the key PREFIX only; the key itself is never exposed. null = not configured. */
export function currentStripeMode(): StripeMode | null {
  try {
    return stripeModeFromSecretKey(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}
