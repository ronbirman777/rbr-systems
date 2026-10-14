import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LegalDocumentPage, { dynamicParams, generateMetadata, generateStaticParams } from "@/app/(site)/legal/[slug]/page";
import LegalIndexPage from "@/app/(site)/legal/page";
import ArchivedLegalDocumentPage, {
  dynamicParams as archiveDynamicParams,
  generateMetadata as archiveMetadata,
  generateStaticParams as archiveStaticParams,
} from "@/app/(site)/legal/[slug]/v/[version]/page";
import { LEGAL_DOCUMENTS, legalHref, legalVersionHref } from "./documents";
import { LEGAL_BODIES } from "./content";
import { LEGAL_ARCHIVED_BODIES } from "./content/archive";

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
      expect(html).toContain(`>${doc.version}<`);
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
      expect(html).not.toContain("legal-superseded-banner");
      if (doc.history.length > 1) {
        expect(html).toContain('id="version-history"');
        expect(html).toContain('href="#version-history"');
        expect(html).toContain("Version 1.1 (current)");
        expect(html).toContain("Version 1.0 (superseded)");
        expect(html).toContain("Initial publication.");
        expect(html).toContain(`href="${legalVersionHref(doc.id, "1.0")}"`);
        expect(html).toContain("You are reading this version.");
      } else {
        expect(html).not.toContain("version-history");
      }
    });
  }

  it("prerenders exactly the superseded versions under /legal/<slug>/v/<version>", () => {
    expect(archiveStaticParams()).toEqual([
      { slug: "terms", version: "1.0" },
      { slug: "privacy", version: "1.0" },
      { slug: "dpa", version: "1.0" },
      { slug: "billing", version: "1.0" },
    ]);
    expect(archiveDynamicParams).toBe(false);
  });

  for (const slug of ["terms", "privacy", "dpa", "billing"]) {
    it(`/legal/${slug}/v/1.0 renders the superseded 1.0 text, labelled, noindex, linking back to the current version`, async () => {
      const doc = LEGAL_DOCUMENTS.find((d) => d.slug === slug)!;
      const el = await ArchivedLegalDocumentPage({ params: Promise.resolve({ slug, version: "1.0" }) });
      const html = renderToStaticMarkup(el);
      expect(html).toContain('data-testid="legal-superseded-banner"');
      expect(html).toContain("Superseded version");
      expect(html).toContain("Version</dt>");
      expect(html).toContain(">1.0<");
      expect(html).toContain(`href="${legalHref(doc.id)}"`);
      expect(html).toContain("Read the current version (1.1)");
      expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
      for (const s of LEGAL_ARCHIVED_BODIES[doc.id]!["1.0"].sections) expect(html).toContain(esc(s.heading));
      const meta = await archiveMetadata({ params: Promise.resolve({ slug, version: "1.0" }) });
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(String(meta.title)).toContain("superseded");
    });
  }

  it("the billing archive shows the 1.0 wording, the current page the 1.1 wording", async () => {
    const old = renderToStaticMarkup(await ArchivedLegalDocumentPage({ params: Promise.resolve({ slug: "billing", version: "1.0" }) }));
    const cur = renderToStaticMarkup(await LegalDocumentPage({ params: Promise.resolve({ slug: "billing" }) }));
    expect(old).toContain("remains in your account so that you can reactivate the Space");
    expect(cur).not.toContain("remains in your account so that you can reactivate the Space");
    expect(cur).toContain("Cancellation timeline");
  });

  it("an unknown or current version under /v/ is a 404", async () => {
    for (const [slug, version] of [["billing", "1.1"], ["billing", "2.0"], ["copyright", "1.0"], ["nope", "1.0"]]) {
      await expect(ArchivedLegalDocumentPage({ params: Promise.resolve({ slug, version }) }), `${slug}/${version}`).rejects.toThrow();
    }
  });

  it("an unknown slug is a 404", async () => {
    await expect(LegalDocumentPage({ params: Promise.resolve({ slug: "nope" }) })).rejects.toThrow();
  });

  it("the index lists all seven documents with version and effective date", () => {
    const html = renderToStaticMarkup(LegalIndexPage());
    for (const d of LEGAL_DOCUMENTS) {
      expect(html).toContain(`href="${legalHref(d.id)}"`);
      expect(html).toContain(esc(d.title));
    }
    expect((html.match(/Version 1\.1 · /g) ?? []).length).toBe(4);
    expect((html.match(/Version 1\.0 · /g) ?? []).length).toBe(3);
  });
});
