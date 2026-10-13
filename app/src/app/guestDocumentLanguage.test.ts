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
 * TASK 033: the layout no longer awaits the whole published row to learn
 * the language - it reads only `modules->spaceSettings` (guestDocument.ts)
 * and starts the heavy loader without awaiting it. The fake public client
 * below serves that light read from the same fixture snapshot, so this is
 * still snapshot in, document attributes out.
 */
const lightReads: { column: string; value: string; select: string }[] = [];
let snapshot: { modules: unknown } | null = null;

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    from: (table: string) => {
      if (table !== "published_spaces") throw new Error(`unexpected table ${table}`);
      return {
        select: (select: string) => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => {
              lightReads.push({ column, value, select });
              if (!snapshot) return { data: null, error: null };
              const modules = (snapshot.modules ?? {}) as { spaceSettings?: unknown };
              return { data: { spaceSettings: modules.spaceSettings ?? null }, error: null };
            },
          }),
        }),
      };
    },
  }),
}));

const bySlug = vi.fn<(slug: string) => Promise<null>>(async () => null);
const byTenantId = vi.fn<(id: string) => Promise<null>>(async () => null);

vi.mock("@/lib/share/publishedSocialSpace", () => ({
  socialSpaceBySlug: (slug: string) => bySlug(slug),
  socialSpaceByTenantId: (id: string) => byTenantId(id),
}));

const htmlTag = (markup: string) => /<html[^>]*>/.exec(markup)?.[0] ?? "";
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

async function renderSlugLayout(modules: unknown) {
  snapshot = modules === undefined ? null : { modules };
  const { default: Layout } = await import("./(guest)/s/[slug]/layout");
  const tree = await Layout({ children: null, params: Promise.resolve({ slug: "qa" }) });
  return renderToStaticMarkup(tree);
}

async function renderTenantLayout(modules: unknown) {
  snapshot = modules === undefined ? null : { modules };
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

  it("learns the language from one light read of spaceSettings only, never the whole row", async () => {
    lightReads.length = 0;
    await renderSlugLayout({ spaceSettings: { locale: "de" } });
    expect(lightReads).toEqual([{ column: "slug", value: "qa", select: "spaceSettings:modules->spaceSettings" }]);
  });

  it("starts the heavy published-row chain in parallel instead of awaiting it", async () => {
    bySlug.mockClear();
    byTenantId.mockClear();
    await renderSlugLayout({ spaceSettings: { locale: "en" } });
    await renderTenantLayout({ spaceSettings: { locale: "en" } });
    expect(bySlug).toHaveBeenCalledWith("qa");
    expect(byTenantId).toHaveBeenCalledWith("t");
  });

  it("streams a published Space behind the branded loading screen, in the Space's language", async () => {
    snapshot = { modules: { spaceSettings: { locale: "de" } } };
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
    snapshot = null;
    for (const path of ["./(guest)/s/[slug]/layout", "./(guest)/g/[tenantId]/layout"] as const) {
      const { default: Layout } = await import(path);
      const child = createElement("i", null, "page");
      const tree = await Layout({ children: child, params: Promise.resolve({ slug: "nope", tenantId: "nope" }) } as never);
      expect((tree.props as { children: unknown }).children, path).toBe(child);
    }
  });
});
