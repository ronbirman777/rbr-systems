import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/site-url";
import { SPACE_TYPES } from "@/lib/spaceTypes/registry";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { BillingDeps } from "./deps";
import { createSupabaseBillingStore } from "./store";
import { createStripeGateway } from "./stripe/real";
import { seedNewSpaceDefaults } from "./seedSpace";
import { createResendSender } from "./emails/resend";
import type { EmailSender } from "./emails/outbox";

/** The environment variable NAMES billing reads (values are never in the repo). Documented in docs/billing/ENVIRONMENT.md. */
export const BILLING_ENV = {
  stripeSecretKey: "STRIPE_SECRET_KEY",
  stripeWebhookSecret: "STRIPE_WEBHOOK_SECRET",
  stripeAutomaticTax: "STRIPE_AUTOMATIC_TAX",
  cronSecret: "CRON_SECRET",
  resendApiKey: "RESEND_API_KEY",
  billingEmailFrom: "BILLING_EMAIL_FROM",
} as const;

export function isStripeConfigured(): boolean {
  return !!process.env[BILLING_ENV.stripeSecretKey];
}

/** Real dependencies. Throws if Stripe is not configured - callers that can run without it check isStripeConfigured() first. */
export function getBillingDeps(): BillingDeps {
  const secretKey = process.env[BILLING_ENV.stripeSecretKey];
  if (!secretKey) throw new Error("Stripe is not configured");
  const admin = createAdminClient();
  return {
    store: createSupabaseBillingStore(admin),
    stripe: createStripeGateway({ secretKey, webhookSecret: process.env[BILLING_ENV.stripeWebhookSecret] ?? null }),
    now: () => new Date(),
    appUrl: APP_URL,
    // ONE authoritative tax source. Off until the legal operator/tax registration is final (docs/billing/TAX.md).
    automaticTax: process.env[BILLING_ENV.stripeAutomaticTax] === "true",
    seedSpace: (tenantId, spaceType, name) => seedNewSpaceDefaults(admin, tenantId, spaceType, name),
    untitledName: (t) => (t === "teach" ? SPACE_TYPES.teach.copy.untitledName : SPACE_TYPES.retreat.copy.untitledName),
    defaultTimezone: DEFAULT_TIMEZONE,
  };
}

/** The email sender, or null when no provider is configured (emails then simply stay queued). */
export function getEmailSender(): EmailSender | null {
  const apiKey = process.env[BILLING_ENV.resendApiKey];
  const from = process.env[BILLING_ENV.billingEmailFrom];
  return apiKey && from ? createResendSender({ apiKey, from }) : null;
}
