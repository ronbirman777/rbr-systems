import { describe, expect, it } from "vitest";
import { inlineToPlainText, isAllowedLegalHref, tokenizeInline } from "./inline";

describe("legal inline markup", () => {
  it("splits text, bold and links", () => {
    expect(tokenizeInline("See **this** and [Privacy Policy](/legal/privacy).")).toEqual([
      { kind: "text", value: "See " },
      { kind: "bold", value: "this" },
      { kind: "text", value: " and " },
      { kind: "link", label: "Privacy Policy", href: "/legal/privacy" },
      { kind: "text", value: "." },
    ]);
  });

  it("allows only internal paths, anchors and mailto", () => {
    expect(isAllowedLegalHref("/legal/terms")).toBe(true);
    expect(isAllowedLegalHref("#liability")).toBe(true);
    expect(isAllowedLegalHref("mailto:contact@innerdwes.com")).toBe(true);
    expect(isAllowedLegalHref("https://example.com")).toBe(false);
    expect(isAllowedLegalHref("//example.com")).toBe(false);
    expect(isAllowedLegalHref("javascript:alert(1)")).toBe(false);
    expect(() => tokenizeInline("[x](https://example.com)")).toThrow(/not allowed/);
  });

  it("strips markup to plain text", () => {
    expect(inlineToPlainText("**A** [b](/legal/dpa) c")).toBe("A b c");
  });
});
