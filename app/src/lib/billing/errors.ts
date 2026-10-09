/** Business-level failures the UI can map to friendly, localised messages. */
export class BillingError extends Error {
  constructor(public readonly code: BillingErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "BillingError";
  }
}

export type BillingErrorCode =
  | "checkout_disabled"      // the server-side launch flag is off
  | "invalid_space_type"
  | "consent_required"
  | "plan_unavailable"       // plan missing/inactive/not for this Space type
  | "plan_not_synced"        // no Stripe price for this mode
  | "price_drift"            // Stripe price != trusted plan: refuse to sell
  | "checkout_not_found"
  | "checkout_closed"
  | "metadata_mismatch"      // the Stripe session does not match the pending checkout: never provision
  | "not_paid"
  | "subscription_not_active"
  | "wrong_mode"
  | "forbidden";
