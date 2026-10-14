import { describe, expect, it } from "vitest";
import {
  LEGAL_ALIASES,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  findLegalDocumentBySlug,
  formatLegalDate,
  getLegalDocument,
  legalHref,
} from "./documents";
import { LEGAL_BODIES } from "./content";

/**
 * The registry is the single source every page, link and acceptance record
 * reads. These tests pin the v1.0 publication exactly: seven documents, one
 * version, one effective date, stable slugs.
 */
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

  it("publishes every document as Version 1.0, effective and last updated 14 October 2026", () => {
    for (const d of LEGAL_DOCUMENTS) {
      expect(d.version).toBe("1.0");
      expect(d.versionId).toBe("1.0-2026-10-14");
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
