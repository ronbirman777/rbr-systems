import type { BillingStore } from "./store";
import type { StripeGateway } from "./stripe/gateway";

/**
 * Everything the billing services need, injected - so every service is a pure
 * function of (deps, input) and testable with fakes. getBillingDeps() (server
 * only, in deps.server.ts) builds the real set from the environment.
 */
export type BillingDeps = {
  store: BillingStore;
  stripe: StripeGateway;
  now: () => Date;
  /** Origin used for links in emails and Stripe return URLs (the Studio/app origin). */
  appUrl: string;
  /** Single tax source switch: true ONLY when Stripe Tax is the authoritative tax engine (see docs/billing/TAX.md). */
  automaticTax: boolean;
  /** Idempotent: ensure a freshly provisioned Space has its starting Studio defaults. */
  seedSpace: (tenantId: string, spaceType: "teach" | "retreat", name: string) => Promise<void>;
  /** Default name for a Space bought but not yet named. */
  untitledName: (spaceType: "teach" | "retreat") => string;
  defaultTimezone: string;
};
