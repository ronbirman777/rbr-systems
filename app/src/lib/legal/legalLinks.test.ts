import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LEGAL_DOCUMENTS, findLegalDocumentBySlug } from "./documents";

// The sign-up page imports Server Actions; only its markup is under test here.
vi.mock("@/app/(site)/(auth)/actions", () => ({
  signUp: vi.fn(),
  resendConfirmationEmail: vi.fn(),
}));

import { MarketingFooter } from "@/components/marketing/footer";
import { PricingSection } from "@/components/marketing/pricing-section";
import SignUpPage from "@/app/(site)/(auth)/sign-up/page";
import { GET as termsAlias } from "@/app/(site)/terms/route";
import { GET as privacyAlias } from "@/app/(site)/privacy/route";

function legalHrefs(html: string): string[] {
  return [...html.matchAll(/href="(\/legal[^"]*)"/g)].map((m) => m[1]);
}

/** Every /legal link must be the index or a registered document's slug. */
function expectResolvable(hrefs: string[]) {
  for (const href of hrefs) {
    if (href === "/legal") continue;
    const m = /^\/legal\/([a-z0-9-]+)$/.exec(href);
    expect(m, href).not.toBeNull();
    expect(findLegalDocumentBySlug(m![1]), href).toBeDefined();
  }
}

describe("legal links across the site", () => {
  it("the footer links all seven documents (and the index), every link resolving to the registry", () => {
    const html = renderToStaticMarkup(createElement(MarketingFooter));
    const hrefs = legalHrefs(html);
    expectResolvable(hrefs);
    for (const d of LEGAL_DOCUMENTS) {
      expect(hrefs).toContain(`/legal/${d.slug}`);
      expect(html).toContain(d.title.replace(/&/g, "&amp;"));
    }
    expect(hrefs).toContain("/legal");
    expect(html).toContain('aria-label="Legal"');
  });

  it("sign-up shows the informational Terms/Privacy notice with working links and the 18+ note - no checkbox", () => {
    const html = renderToStaticMarkup(createElement(SignUpPage));
    expect(html).toContain('data-testid="signup-legal-notice"');
    expect(html).toContain("By creating an account you agree to the");
    expect(html).toContain("and acknowledge the");
    expect(html).toContain("18 and older");
    const hrefs = legalHrefs(html);
    expect(hrefs).toEqual(["/legal/terms", "/legal/privacy"]);
    expectResolvable(hrefs);
    // Text and links only: no acceptance checkbox, no new form field.
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toMatch(/name="(accept|terms|privacy|consent)[^"]*"/i);
  });

  it("the pricing section links the Billing, Cancellation & Refund Policy", () => {
    const html = renderToStaticMarkup(createElement(PricingSection));
    expect(legalHrefs(html)).toEqual(["/legal/billing"]);
    // Matches the Billing Policy v1.1 cancellation rule (no open-ended retention promise).
    expect(html).toContain("your content stays saved for 30 days after that, ready to reactivate");
    expect(html).not.toContain("whenever you return");
  });

  it("My Spaces' account area links only registered documents", () => {
    const src = readFileSync(path.resolve(__dirname, "../../app/(site)/space/page.tsx"), "utf8");
    const m = /\(\[("[a-z-]+"(?:, "[a-z-]+")*)\] as const\)\.map\(\(id\) =>/.exec(src);
    expect(m).not.toBeNull();
    const ids = m![1].split(", ").map((s) => s.replace(/"/g, ""));
    expect(ids).toEqual(["terms", "privacy", "dpa", "billing"]);
    for (const id of ids) expect(LEGAL_DOCUMENTS.some((d) => d.id === id)).toBe(true);
  });
});

describe("short legal aliases", () => {
  it("/terms permanently redirects to /legal/terms on the same origin", async () => {
    const res = termsAlias(new Request("https://innerdwes.com/terms?x=1"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://innerdwes.com/legal/terms");
  });

  it("/privacy permanently redirects to /legal/privacy on the same origin", async () => {
    const res = privacyAlias(new Request("http://localhost:3000/privacy"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost:3000/legal/privacy");
  });
});
