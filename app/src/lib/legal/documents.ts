/**
 * The single registry of InnerDweS's PUBLIC legal documents.
 *
 * Everything that names, links to or records a legal document reads it from
 * here: the /legal pages, the site footer, the sign-up notice, the My Spaces
 * account links and - on the billing line - the version identifiers stored as
 * acceptance evidence (lib/billing/legal.ts). A document's text lives in
 * lib/legal/content/<id>.ts; this file holds only its identity and version.
 *
 * Versioning rule: a published version is immutable. Changing a document's
 * text means a new `version`, a new `versionId` and a new `effectiveDate`
 * here, together with the text, and a new row in the internal Legal & Policy
 * Version Register. Historic acceptance records keep the versionId they were
 * created with and are never rewritten.
 *
 * Internal compliance documents (retention schedule, incident plan, registers
 * and so on) are deliberately NOT here: they are never routed or linked.
 */

export const LEGAL_CONTACT_EMAIL = "contact@innerdwes.com";

/** Base path of every public legal page. */
export const LEGAL_BASE_PATH = "/legal";

export type LegalDocumentId =
  | "terms"
  | "privacy"
  | "dpa"
  | "acceptable-use"
  | "copyright"
  | "subprocessors"
  | "billing";

export type LegalDocument = {
  id: LegalDocumentId;
  /** Full public title, exactly as shown on the page. */
  title: string;
  /** Short label for compact link lists (footer). */
  shortTitle: string;
  /** URL segment under /legal. Stable: never rename a published slug. */
  slug: string;
  /** Human version shown on the page, e.g. "1.0". */
  version: string;
  /** Immutable identifier stored as acceptance evidence: `<version>-<effectiveDate>`. */
  versionId: string;
  /** ISO date (YYYY-MM-DD) from which this version applies. */
  effectiveDate: string;
  /** ISO date (YYYY-MM-DD) of the last textual change. */
  lastUpdated: string;
  /** One-sentence summary for the /legal index and page metadata. */
  summary: string;
};

const V1 = { version: "1.0", versionId: "1.0-2026-10-14", effectiveDate: "2026-10-14", lastUpdated: "2026-10-14" } as const;

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    id: "terms",
    title: "Terms of Service",
    shortTitle: "Terms",
    slug: "terms",
    ...V1,
    summary: "The agreement that governs your use of InnerDweS, the Studio, Spaces and Guest Apps.",
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    slug: "privacy",
    ...V1,
    summary: "What personal data InnerDweS processes, why, for how long, and the rights you have.",
  },
  {
    id: "dpa",
    title: "Data Processing Addendum",
    shortTitle: "Data Processing",
    slug: "dpa",
    ...V1,
    summary: "How InnerDweS processes personal data on behalf of Creators who act as Controller.",
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use Policy",
    shortTitle: "Acceptable Use",
    slug: "acceptable-use",
    ...V1,
    summary: "The content and conduct that are not allowed on InnerDweS.",
  },
  {
    id: "copyright",
    title: "Copyright & Content Takedown Policy",
    shortTitle: "Copyright & Takedown",
    slug: "copyright",
    ...V1,
    summary: "How to report content that infringes your rights, and how InnerDweS handles reports.",
  },
  {
    id: "subprocessors",
    title: "Service Providers & Subprocessors",
    shortTitle: "Subprocessors",
    slug: "subprocessors",
    ...V1,
    summary: "The third-party providers InnerDweS uses to operate the Service.",
  },
  {
    id: "billing",
    title: "Billing, Cancellation & Refund Policy",
    shortTitle: "Billing & Refunds",
    slug: "billing",
    ...V1,
    summary: "Subscriptions, renewals, cancellation, refunds, withdrawal rights and failed payments.",
  },
] as const;

export function getLegalDocument(id: LegalDocumentId): LegalDocument {
  const doc = LEGAL_DOCUMENTS.find((d) => d.id === id);
  if (!doc) throw new Error(`Unknown legal document: ${id}`);
  return doc;
}

export function findLegalDocumentBySlug(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}

/** The public path of a legal document, e.g. "/legal/terms". */
export function legalHref(id: LegalDocumentId): string {
  return `${LEGAL_BASE_PATH}/${getLegalDocument(id).slug}`;
}

/** "14 October 2026" - fixed English format, independent of the server locale. */
export function formatLegalDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Permanent short aliases. Each one is a 308 redirect to its document and is
 * exempt from the pre-launch preview gate exactly like the document itself.
 */
export const LEGAL_ALIASES: Readonly<Record<string, LegalDocumentId>> = {
  "/terms": "terms",
  "/privacy": "privacy",
};
