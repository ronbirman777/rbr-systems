import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { BRAND_URL, CreatedWithFooter } from "./created-with-footer";

describe("Guest App attribution", () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`renders a safe, untranslated brand link in ${locale}`, () => {
      const html = renderToStaticMarkup(createElement(CreatedWithFooter, { locale, source: "teach" }));
      expect(html).toContain(`href="${BRAND_URL}/?ref=guest_app&amp;src=teach"`);
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain(">InnerDweS</a>");
      expect(html).not.toContain("{brand}");
      expect(html).not.toContain("\u0000");
    });
  }
  it("English copy is exactly 'Created with InnerDweS'", () => {
    const html = renderToStaticMarkup(createElement(CreatedWithFooter, { locale: "en", source: "flow" }));
    expect(html.replace(/<[^>]+>/g, "")).toBe("Created with InnerDweS");
  });
  it("uses the canonical domain", () => expect(BRAND_URL).toBe("https://innerdwes.com"));
});
