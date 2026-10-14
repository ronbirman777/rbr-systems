import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LegalDocumentPage, { dynamicParams, generateMetadata, generateStaticParams } from "@/app/(site)/legal/[slug]/page";
import LegalIndexPage from "@/app/(site)/legal/page";
import { LEGAL_DOCUMENTS, legalHref } from "./documents";
import { LEGAL_BODIES } from "./content";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

describe("/legal pages", () => {
  it("prerenders exactly the seven registered slugs and nothing else", () => {
    expect(generateStaticParams()).toEqual(LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug })));
    expect(dynamicParams).toBe(false);
  });

  for (const doc of LEGAL_DOCUMENTS) {
    it(`/legal/${doc.slug} renders the title, version line, contents and every section heading`, async () => {
      const el = await LegalDocumentPage({ params: Promise.resolve({ slug: doc.slug }) });
      const html = renderToStaticMarkup(el);
      expect(html).toContain(`<h1 id="legal-title"`);
      expect(html).toContain(esc(doc.title));
      expect(html).toContain("Version</dt>");
      expect(html).toContain(">1.0<");
      expect(html).toContain('dateTime="2026-10-14">14 October 2026</time>');
      expect(html).toContain("Last updated");
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
      for (const s of LEGAL_BODIES[doc.id].sections) {
        expect(html).toContain(`id="${s.id}"`);
        expect(html).toContain(`href="#${s.id}"`);
        expect(html).toContain(esc(s.heading));
      }
      const meta = await generateMetadata({ params: Promise.resolve({ slug: doc.slug }) });
      expect(meta.title).toBe(`${doc.title} · InnerDweS`);
      expect(meta.alternates?.canonical).toBe(legalHref(doc.id));
      expect(meta.robots).toBeUndefined(); // indexable: normal robots
    });
  }

  it("an unknown slug is a 404", async () => {
    await expect(LegalDocumentPage({ params: Promise.resolve({ slug: "nope" }) })).rejects.toThrow();
  });

  it("the index lists all seven documents with version and effective date", () => {
    const html = renderToStaticMarkup(LegalIndexPage());
    for (const d of LEGAL_DOCUMENTS) {
      expect(html).toContain(`href="${legalHref(d.id)}"`);
      expect(html).toContain(esc(d.title));
    }
    expect((html.match(/Version 1\.0/g) ?? []).length).toBe(7);
  });
});
