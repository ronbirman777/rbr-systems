import { describe, expect, it } from "vitest";
import { LEGAL_VERSIONS } from "./legal";
import { getLegalDocument } from "@/lib/legal/documents";

describe("checkout acceptance versions", () => {
  it("point at the currently published documents of the legal registry (v1.1 for Terms, Privacy, Billing)", () => {
    expect(LEGAL_VERSIONS).toEqual({
      terms: "1.1-2026-10-14",
      privacy: "1.1-2026-10-14",
      billingTerms: "1.1-2026-10-14",
      consentText: "checkout-consent-1.0-2026-10-14",
    });
    expect(LEGAL_VERSIONS.terms).toBe(getLegalDocument("terms").versionId);
    expect(LEGAL_VERSIONS.privacy).toBe(getLegalDocument("privacy").versionId);
    expect(LEGAL_VERSIONS.billingTerms).toBe(getLegalDocument("billing").versionId);
  });

  it("no draft identifier can reach a paying customer", () => {
    for (const v of Object.values(LEGAL_VERSIONS)) expect(v).not.toMatch(/draft/i);
  });
});
