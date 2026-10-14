import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  LEGAL_ALIASES,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  findLegalDocumentBySlug,
  formatLegalDate,
  getLegalDocument,
  legalHref,
  legalVersionHref,
  archivedLegalVersions,
  findArchivedLegalVersion,
  previousLegalVersions,
} from "./documents";
import { LEGAL_BODIES } from "./content";
import { LEGAL_ARCHIVED_BODIES } from "./content/archive";

/**
 * The registry is the single source every page, link and acceptance record
 * reads. These tests pin the publication exactly: seven documents, stable
 * slugs, one effective date (14 October 2026), Version 1.1 for the four
 * documents amended by the same-day cancellation retention rule and 1.0 for
 * the other three, and an immutable archive of every superseded version.
 */
const AMENDED_1_1 = ["terms", "privacy", "dpa", "billing"] as const;
const UNCHANGED_1_0 = ["acceptable-use", "copyright", "subprocessors"] as const;

/** sha256 of JSON.stringify(body) of each Version 1.0 body as published at 94de158. */
const V1_0_BODY_SHA256: Record<(typeof AMENDED_1_1)[number], string> = {
  terms: "f1f538012a11a31f418b75173725918d76bf00264011ada42be56f9e8b2b654b",
  privacy: "9bb2bb982d14d71db964a04fa7a6fb9b4a32f37c78efc044853c7a8ae88ad02d",
  dpa: "2ade4f5cb948fb692d1185c3453766aff5b95fa48a4ac5a605f8cb51d147b630",
  billing: "4ed6ee2bf8cd5c16288ce259ef7f3376b2d938e1501d70a5d16283e7c4bcf487",
};
const sha256 = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const EXPECTED = [
  ["terms", "Terms of Service", "terms"],
  ["privacy", "Privacy Policy", "privacy"],
  ["dpa", "Data Processing Addendum", "dpa"],
  ["acceptable-use", "Acceptable Use Policy", "acceptable-use"],
  ["copyright", "Copyright & Content Takedown Policy", "copyright"],
  ["subprocessors", "Service Providers & Subprocessors", "subprocessors"],
  ["billing", "Billing, Cancellation & Refund Policy", "billing"],
] as const;

describe("legal document registry", () => {
  it("lists exactly the seven public documents, in order, with their exact titles and slugs", () => {
    expect(LEGAL_DOCUMENTS.map((d) => [d.id, d.title, d.slug])).toEqual(EXPECTED.map((e) => [...e]));
  });

  it("Terms, Privacy, DPA and Billing are Version 1.1 (1.1-2026-10-14); the other three stay Version 1.0", () => {
    for (const id of AMENDED_1_1) {
      const d = getLegalDocument(id);
      expect([d.version, d.versionId], id).toEqual(["1.1", "1.1-2026-10-14"]);
    }
    for (const id of UNCHANGED_1_0) {
      const d = getLegalDocument(id);
      expect([d.version, d.versionId], id).toEqual(["1.0", "1.0-2026-10-14"]);
      expect(d.history.length, id).toBe(1);
      expect(LEGAL_ARCHIVED_BODIES[id], id).toBeUndefined();
    }
  });

  it("keeps a version history per document: newest first, history[0] is the current version, 1.0 is the initial publication", () => {
    for (const d of LEGAL_DOCUMENTS) {
      const [current] = d.history;
      expect(current).toMatchObject({ version: d.version, versionId: d.versionId, effectiveDate: d.effectiveDate, lastUpdated: d.lastUpdated });
      expect(d.history[d.history.length - 1]).toEqual({
        version: "1.0",
        versionId: "1.0-2026-10-14",
        effectiveDate: "2026-10-14",
        lastUpdated: "2026-10-14",
        changeSummary: "Initial publication.",
      });
      expect(new Set(d.history.map((v) => v.versionId)).size).toBe(d.history.length);
      for (const v of d.history) {
        expect(v.versionId).toBe(`${v.version}-${v.effectiveDate}`);
        expect(v.changeSummary.length).toBeGreaterThan(10);
      }
    }
    for (const id of AMENDED_1_1) {
      const d = getLegalDocument(id);
      expect(d.history.map((v) => v.versionId)).toEqual(["1.1-2026-10-14", "1.0-2026-10-14"]);
      expect(d.history[0].changeSummary).toMatch(/30 days/);
      expect(previousLegalVersions(d).map((v) => v.version)).toEqual(["1.0"]);
    }
  });

  it("archives the exact Version 1.0 text of every amended document (content hash pinned)", () => {
    for (const id of AMENDED_1_1) {
      const archived = LEGAL_ARCHIVED_BODIES[id]?.["1.0"];
      expect(archived, id).toBeDefined();
      expect(sha256(archived), id).toBe(V1_0_BODY_SHA256[id]);
      expect(sha256(LEGAL_BODIES[id]), id).not.toBe(V1_0_BODY_SHA256[id]);
    }
  });

  it("has an archived body for every superseded version and nothing else; archive paths are stable", () => {
    const pairs = archivedLegalVersions().map(({ doc, entry }) => `${doc.id}@${entry.version}`);
    expect(pairs.sort()).toEqual(["billing@1.0", "dpa@1.0", "privacy@1.0", "terms@1.0"]);
    const archivedKeys = Object.entries(LEGAL_ARCHIVED_BODIES).flatMap(([id, byVersion]) => Object.keys(byVersion ?? {}).map((v) => `${id}@${v}`));
    expect(archivedKeys.sort()).toEqual(pairs.sort());
    expect(legalVersionHref("billing", "1.0")).toBe("/legal/billing/v/1.0");
    expect(findArchivedLegalVersion("billing", "1.0")?.entry.versionId).toBe("1.0-2026-10-14");
    expect(findArchivedLegalVersion("billing", "1.1")).toBeUndefined(); // the current version is not archived
    expect(findArchivedLegalVersion("copyright", "1.0")).toBeUndefined();
    expect(findArchivedLegalVersion("nope", "1.0")).toBeUndefined();
  });

  it("every document is effective and last updated 14 October 2026", () => {
    for (const d of LEGAL_DOCUMENTS) {
      expect(d.effectiveDate).toBe("2026-10-14");
      expect(d.lastUpdated).toBe("2026-10-14");
      expect(d.versionId).toBe(`${d.version}-${d.effectiveDate}`);
      expect(d.summary.length).toBeGreaterThan(20);
      expect(d.shortTitle.length).toBeGreaterThan(0);
    }
  });

  it("has unique ids and slugs, and URL-safe slugs", () => {
    expect(new Set(LEGAL_DOCUMENTS.map((d) => d.id)).size).toBe(7);
    expect(new Set(LEGAL_DOCUMENTS.map((d) => d.slug)).size).toBe(7);
    for (const d of LEGAL_DOCUMENTS) expect(d.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("builds /legal/<slug> paths and finds documents by slug", () => {
    expect(legalHref("terms")).toBe("/legal/terms");
    expect(legalHref("billing")).toBe("/legal/billing");
    for (const d of LEGAL_DOCUMENTS) {
      expect(findLegalDocumentBySlug(d.slug)).toBe(d);
      expect(getLegalDocument(d.id)).toBe(d);
    }
    expect(findLegalDocumentBySlug("nope")).toBeUndefined();
  });

  it("has a body with sections for every registered document", () => {
    for (const d of LEGAL_DOCUMENTS) {
      expect(LEGAL_BODIES[d.id]).toBeDefined();
      expect(LEGAL_BODIES[d.id].sections.length).toBeGreaterThan(3);
    }
    expect(Object.keys(LEGAL_BODIES).sort()).toEqual(LEGAL_DOCUMENTS.map((d) => d.id).sort());
  });

  it("aliases /terms and /privacy only, each to a registered document", () => {
    expect(LEGAL_ALIASES).toEqual({ "/terms": "terms", "/privacy": "privacy" });
  });

  it("formats dates in a fixed English form", () => {
    expect(formatLegalDate("2026-10-14")).toBe("14 October 2026");
    expect(formatLegalDate("2027-01-02")).toBe("2 January 2027");
  });

  it("uses the approved contact address", () => {
    expect(LEGAL_CONTACT_EMAIL).toBe("contact@innerdwes.com");
  });
});
