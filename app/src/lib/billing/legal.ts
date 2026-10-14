import { getLegalDocument } from "@/lib/legal/documents";

/**
 * Versions of the legal texts a buyer accepts at checkout. These identifiers are
 * stored in billing_acceptances as evidence of WHAT was accepted. They are read
 * from the one legal registry (lib/legal/documents.ts), so the id stored for a
 * purchase is always the id of the document version published at
 * /legal/<slug>. Bump a version only together with the published document;
 * historic billing_acceptances rows keep the id they were written with.
 *
 * Immediate-service consent and the statutory-withdrawal acknowledgement are two
 * SEPARATE statements (no blanket "I waive all refunds everywhere").
 *
 * consentText identifies the checkout consent wording (dictionary keys
 * consentImmediate, consentWithdrawal and termsLine, per locale) as shown with
 * links to the v1.0 documents.
 */
export const LEGAL_VERSIONS = {
  terms: getLegalDocument("terms").versionId,
  privacy: getLegalDocument("privacy").versionId,
  billingTerms: getLegalDocument("billing").versionId,
  consentText: "checkout-consent-1.0-2026-10-14",
} as const;
