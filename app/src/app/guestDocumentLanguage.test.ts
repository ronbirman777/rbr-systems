import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Suspense } from "react";

/**
 * The Guest document must declare the published Space's own language.
 *
 * THE BUG THIS CATCHES. `app/layout.tsx` hardcoded `lang="en"` for every
 * route in the product, so a fully mirrored, fully Hebrew Guest App was
 * served inside `<html lang="en">` with no `dir` at all. The layout was
 * right - the screen sets `dir` on its own container - but the DOCUMENT
 * lied about itself to screen readers, to translation prompts and to
 * every `lang`-dependent typography rule. Production QA, TASK 029.
 *
 * Only a root layout can write those attributes, so the app now has one
 * root per route branch and the guest roots resolve the locale from the
 * published snapshot. This asserts the whole chain end to end - snapshot
 * in, document attributes out - rather than any single step of it,
 * because every step of it was individually correct while the result was
 * wrong.
 *
 * `next/font/google` is mocked because it is a build-time transform with
 * no runtime implementation under vitest. Nothing it returns is part of
 * what this test asserts.
 */

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-mock", className: "font-mock", style: {} });
  return { Geist: font, Geist_Mono: font, Fraunces: font, DM_Serif_Display: font, DM_Sans: font };
});
vi.mock("server-only", () => ({}));

/*
 * TASK 033 (fix): the layout awaits the per-request cached loader - the
 * published row AND the access decision - before rendering anything, so a
 * denied Space keeps its real 404 (guestStatusGate.test.ts). The language
 * comes from that same snapshot. The loader is mocked here; `access` and
 * `row.product_type` feed the gate, which decides the loading boundary.
 */
type Loaded = { modules: unknown; access: "granted" | "code-required" | "unavailable"; row: { product_type: string } };
let snapshot: Loaded | null = null;
const bySlug = vi.fn<(slug: string) => Promise<Loaded | null>>(async () => snapshot);
const byTenantId = vi.fn<(id: string) => Promise<Loaded | null>>(async () => snapshot);

vi.mock("@/lib/share/publishedSocialSpace", () => ({
  socialSpaceBySlug: (slug: string) => bySlug(slug),
  socialSpaceByTenantId: (id: string) => byTenantId(id),
}));
vi.mock("@/components/guest/published-space-screen", () => ({ PublishedSpaceScreen: () => null }));
vi.mock("@/components/teach/teach-published-screen", () => ({ TeachPublishedSpaceScreen: () => null }));

const htmlTag = (markup: string) => /<html[^>]*>/.exec(markup)?.[0] ?? "";
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

function setSnapshot(modules: unknown, access: Loaded["access"] = "granted") {
  snapshot = modules === undefined ? null : { modules, access, row: { product_type: "retreat" } };
}

async function renderSlugLayout(modules: unknown) {
  setSnapshot(modules);
  const { default: Layout } = await import("./(guest)/s/[slug]/layout");
  const tree = await Layout({ children: null, params: Promise.resolve({ slug: "qa" }) });
  return renderToStaticMarkup(tree);
}

async function renderTenantLayout(modules: unknown) {
  setSnapshot(modules);
  const { default: Layout } = await import("./(guest)/g/[tenantId]/layout");
  const tree = await Layout({ children: null, params: Promise.resolve({ tenantId: "t" }) });
  return renderToStaticMarkup(tree);
}

describe("the Guest document declares the published Space's language", () => {
  const cases = [
    { locale: "en", dir: null },
    { locale: "de", dir: null },
    { locale: "es", dir: null },
    { locale: "fr", dir: null },
    { locale: "he", dir: "rtl" },
  ] as const;

  for (const { locale, dir } of cases) {
    it(`serves lang="${locale}" and ${dir ? `dir="${dir}"` : "no dir"} for a ${locale} snapshot`, async () => {
      const tag = htmlTag(await renderSlugLayout({ spaceSettings: { locale } }));
      expect(attr(tag, "lang")).toBe(locale);
      expect(attr(tag, "dir")).toBe(dir);
    });
  }

  it("mirrors the same contract on the tenant-id address", async () => {
    const tag = htmlTag(await renderTenantLayout({ spaceSettings: { locale: "he" } }));
    expect(attr(tag, "lang")).toBe("he");
    expect(attr(tag, "dir")).toBe("rtl");
  });

  it("falls back to English for a Space with no language set", async () => {
    // Every Space published before 0031 has no spaceSettings at all, and
    // they render English today. The document must agree with that
    // rather than invent a language.
    const tag = htmlTag(await renderSlugLayout({}));
    expect(attr(tag, "lang")).toBe("en");
    expect(attr(tag, "dir")).toBeNull();
  });

  it("falls back to English for an unknown slug instead of throwing", async () => {
    // The 404 is the page's decision, not the document's. A layout that
    // threw here would turn a missing Space into a 500.
    const tag = htmlTag(await renderSlugLayout(undefined));
    expect(attr(tag, "lang")).toBe("en");
  });

  it("learns the language from the same cached loader the page uses (no extra read)", async () => {
    bySlug.mockClear();
    byTenantId.mockClear();
    await renderSlugLayout({ spaceSettings: { locale: "en" } });
    await renderTenantLayout({ spaceSettings: { locale: "en" } });
    expect(bySlug).toHaveBeenCalledWith("qa");
    expect(byTenantId).toHaveBeenCalledWith("t");
  });

  it("a denied Space still declares its own language (as before TASK 033) - without a loading boundary", async () => {
    setSnapshot({ spaceSettings: { locale: "he" } }, "unavailable");
    const { default: Layout } = await import("./(guest)/s/[slug]/layout");
    const child = createElement("i", null, "page");
    const tree = await Layout({ children: child, params: Promise.resolve({ slug: "qa" }) });
    expect((tree.props as { children: unknown }).children).toBe(child);
    expect(attr(htmlTag(renderToStaticMarkup(tree)), "lang")).toBe("he");
  });

  it("streams a published, granted Space behind the branded loading screen, in the Space's language", async () => {
    setSnapshot({ spaceSettings: { locale: "de" } });
    const { default: Layout } = await import("./(guest)/s/[slug]/layout");
    const never = new Promise(() => {});
    function StillLoading(): never {
      throw never;
    }
    const tree = await Layout({ children: createElement(StillLoading), params: Promise.resolve({ slug: "qa" }) });
    expect((tree.props as { children: { type: unknown } }).children.type).toBe(Suspense);
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('data-testid="guest-loading-stream"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Wird geladen");
  });

  it("an unknown address gets no loading boundary, so its 404 is decided before anything streams", async () => {
    setSnapshot(undefined);
    for (const path of ["./(guest)/s/[slug]/layout", "./(guest)/g/[tenantId]/layout"] as const) {
      const { default: Layout } = await import(path);
      const child = createElement("i", null, "page");
      const tree = await Layout({ children: child, params: Promise.resolve({ slug: "nope", tenantId: "nope" }) } as never);
      expect((tree.props as { children: unknown }).children, path).toBe(child);
    }
  });
});
