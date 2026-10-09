import { safeInternalRedirectPath } from "@/lib/safe-redirect";

/** The owner's Billing / Plan page for one Space. */
export const billingPath = (tenantId: string) => `/billing/${tenantId}`;
export const buildBillingUrl = (appUrl: string, tenantId: string) => `${appUrl.replace(/\/$/, "")}${billingPath(tenantId)}`;

/** Checkout return URLs are built ONLY from server-known ids and the configured app origin - never from client input. */
export const checkoutSuccessUrl = (appUrl: string, pendingCheckoutId: string) =>
  `${appUrl.replace(/\/$/, "")}/create/complete?c=${encodeURIComponent(pendingCheckoutId)}`;
export const checkoutCancelUrl = (appUrl: string, spaceType: "teach" | "retreat") =>
  `${appUrl.replace(/\/$/, "")}/create/${spaceType === "teach" ? "teach" : "flow"}?canceled=1`;

/** Only same-site relative paths may ever be used as a post-action destination. */
export const safeNext = (value: string | null | undefined, fallback: string) => safeInternalRedirectPath(value, fallback);
