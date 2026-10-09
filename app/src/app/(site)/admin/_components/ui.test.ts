import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { qrImageSrc } from "@/lib/billing/admin/ui/labels";
import { Badge, Dl, EmptyRow, RBody, RCell, RHead, RRow, RTable, Stat } from "./ui";

describe("admin presentational components (SSR)", () => {
  it("renders a Stat with its definition caption", () => {
    const html = renderToStaticMarkup(h(Stat, { label: "Paid Spaces", value: 3, caption: "Distinct Spaces." }));
    expect(html).toContain("Paid Spaces");
    expect(html).toContain("Distinct Spaces.");
  });
  it("renders a responsive table with data-labels for stacked cards", () => {
    const html = renderToStaticMarkup(
      h(RTable, {
        caption: "Test",
        children: [h(RHead, { key: "h", cols: ["A"] }), h(RBody, { key: "b", children: h(RRow, { children: h(RCell, { label: "A", children: "x" }) }) })],
      })
    );
    expect(html).toContain('data-label="A"');
    expect(html).toContain("<caption");
    expect(html).toContain("md:table");
  });
  it("renders badges, definition lists and empty states", () => {
    expect(renderToStaticMarkup(h(Badge, { tone: "bad", children: "x" }))).toContain("bg-red-100");
    expect(renderToStaticMarkup(h(Dl, { items: [["K", "V"]] }))).toContain("<dt");
    expect(renderToStaticMarkup(h(EmptyRow, { children: "none" }))).toContain("none");
  });
  it("only ever turns the QR into an <img> source, never markup", () => {
    expect(qrImageSrc("data:image/svg+xml;utf8,<svg/>")).toMatch(/^data:image\/svg\+xml/);
    expect(qrImageSrc("<svg xmlns='http://www.w3.org/2000/svg'><script>x</script></svg>")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(qrImageSrc("javascript:alert(1)")).toBeNull();
    expect(qrImageSrc("https://evil.test/x.svg")).toBeNull();
  });
});
