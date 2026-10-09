/**
 * Versions of the legal texts a buyer accepts at checkout. These identifiers are
 * stored in billing_acceptances as evidence of WHAT was accepted. The text
 * itself, the contracting operator and the tax/invoice issuer are part of the
 * Paid Launch legal gate and are NOT decided here: bump a version only together
 * with the real, reviewed document.
 *
 * Immediate-service consent and the statutory-withdrawal acknowledgement are two
 * SEPARATE statements (no blanket "I waive all refunds everywhere").
 */
export const LEGAL_VERSIONS = {
  /** Placeholder identifiers until the operator-reviewed documents exist. */
  terms: "draft-2026-10",
  privacy: "draft-2026-10",
  billingTerms: "draft-2026-10",
  consentText: "checkout-consent-draft-2026-10",
} as const;
