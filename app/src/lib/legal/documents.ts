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
 * text means a new `version` and `versionId` here (and a new `effectiveDate`
 * unless the owner decides otherwise, as for the same-day 1.1 amendment),
 * together with the text, a new entry at the top of the document's `history`,
 * the superseded text preserved in lib/legal/content/archive/ (served noindex
 * at /legal/<slug>/v/<version>), and a new row in the internal Legal & Policy
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

/** One published version of a document. */
export type LegalDocumentVersion = {
  /** Human version, e.g. "1.0". */
  version: string;
  /** Immutable identifier stored as acceptance evidence: `<version>-<effectiveDate>`. */
  versionId: string;
  /** ISO date (YYYY-MM-DD) from which this version applies. */
  effectiveDate: string;
  /** ISO date (YYYY-MM-DD) of the last textual change of this version. */
  lastUpdated: string;
  /** Short plain-English summary of what this version changed. */
  changeSummary: string;
};

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
  /**
   * Every published version, NEWEST FIRST. history[0] is always the current
   * version (the same values as version/versionId/effectiveDate/lastUpdated
   * above); the rest are superseded and each has an archived body.
   */
  history: readonly LegalDocumentVersion[];
};

const V1_0: LegalDocumentVersion = {
  version: "1.0",
  versionId: "1.0-2026-10-14",
  effectiveDate: "2026-10-14",
  lastUpdated: "2026-10-14",
  changeSummary: "Initial publication.",
};

/** Same-day amendment (owner-approved, 14 October 2026): the normal-cancellation retention rule. */
const V1_1_DATES = { version: "1.1", versionId: "1.1-2026-10-14", effectiveDate: "2026-10-14", lastUpdated: "2026-10-14" } as const;
const CANCELLATION_RULE_SUMMARY =
  "Added the rule for what happens when you cancel a paid subscription: the subscription stays active until the end of the period you have already paid for; the Space then becomes unavailable to guests while you keep access to billing and reactivation; its content is preserved for 30 days and then becomes eligible for deletion; reactivating before deletion restores the Space without data loss; your other Spaces are not automatically deleted. The separate failed-payment process is unchanged.";

/** A document still at its first publication. */
function v1(): Pick<LegalDocument, "version" | "versionId" | "effectiveDate" | "lastUpdated" | "history"> {
  const { version, versionId, effectiveDate, lastUpdated } = V1_0;
  return { version, versionId, effectiveDate, lastUpdated, history: [V1_0] };
}

/** A document amended to Version 1.1 by the cancellation retention rule. */
function v1_1(changeSummary: string): Pick<LegalDocument, "version" | "versionId" | "effectiveDate" | "lastUpdated" | "history"> {
  return { ...V1_1_DATES, history: [{ ...V1_1_DATES, changeSummary }, V1_0] };
}

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    id: "terms",
    title: "Terms of Service",
    shortTitle: "Terms",
    slug: "terms",
    ...v1_1(CANCELLATION_RULE_SUMMARY + " Sections changed: 21 (Cancellation), 25 (Data retention) and 29 (Reactivation)."),
    summary: "The agreement that governs your use of InnerDweS, the Studio, Spaces and Guest Apps.",
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    slug: "privacy",
    ...v1_1("Added the retention period for the content of a Space whose paid subscription you cancel (preserved for 30 days after the end of the paid period, then eligible for deletion) to the retention table in section 17, and clarified in section 18 that the failed-payment timeline is separate. Nothing else changed."),
    summary: "What personal data InnerDweS processes, why, for how long, and the rights you have.",
  },
  {
    id: "dpa",
    title: "Data Processing Addendum",
    shortTitle: "Data Processing",
    slug: "dpa",
    ...v1_1("Section 14 (Deletion and return) now states that, after you cancel a paid subscription for a Space, its content is preserved for 30 days after the end of the paid period and then becomes eligible for deletion, and that after a failed payment the Billing policy timeline applies. Nothing else changed."),
    summary: "How InnerDweS processes personal data on behalf of Creators who act as Controller.",
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use Policy",
    shortTitle: "Acceptable Use",
    slug: "acceptable-use",
    ...v1(),
    summary: "The content and conduct that are not allowed on InnerDweS.",
  },
  {
    id: "copyright",
    title: "Copyright & Content Takedown Policy",
    shortTitle: "Copyright & Takedown",
    slug: "copyright",
    ...v1(),
    summary: "How to report content that infringes your rights, and how InnerDweS handles reports.",
  },
  {
    id: "subprocessors",
    title: "Service Providers & Subprocessors",
    shortTitle: "Subprocessors",
    slug: "subprocessors",
    ...v1(),
    summary: "The third-party providers InnerDweS uses to operate the Service.",
  },
  {
    id: "billing",
    title: "Billing, Cancellation & Refund Policy",
    shortTitle: "Billing & Refunds",
    slug: "billing",
    ...v1_1(CANCELLATION_RULE_SUMMARY + " Sections changed: 10 (Cancellation), 11 (What happens after cancellation, now a timeline) and 15 (Failed payments, a sentence stating it is separate from cancellation)."),
    summary: "Subscriptions, renewals, cancellation, refunds, withdrawal rights and failed payments.",
  },
];

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

/** Superseded versions of a document, newest first (empty for a first publication). */
export function previousLegalVersions(doc: LegalDocument): readonly LegalDocumentVersion[] {
  return doc.history.slice(1);
}

/** Stable public path of one superseded version, e.g. "/legal/billing/v/1.0". */
export function legalVersionHref(id: LegalDocumentId, version: string): string {
  return `${legalHref(id)}/v/${version}`;
}

/** A superseded version of the document at `slug`, or undefined (the current version is not "archived"). */
export function findArchivedLegalVersion(
  slug: string,
  version: string,
): { doc: LegalDocument; entry: LegalDocumentVersion } | undefined {
  const doc = findLegalDocumentBySlug(slug);
  const entry = doc && previousLegalVersions(doc).find((v) => v.version === version);
  return doc && entry ? { doc, entry } : undefined;
}

/** Every superseded (document, version) pair - the archive pages that exist. */
export function archivedLegalVersions(): { doc: LegalDocument; entry: LegalDocumentVersion }[] {
  return LEGAL_DOCUMENTS.flatMap((doc) => previousLegalVersions(doc).map((entry) => ({ doc, entry })));
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
