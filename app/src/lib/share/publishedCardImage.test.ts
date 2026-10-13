import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildPublishedShareCard,
  isPublishedTenantRef,
  publishedCardColors,
  resolvePublishedCardImage,
  resolvePublishedLogoRef,
  selectPublishedCard,
  shareCardCtaLocale,
  shareCardImageUrl,
  withPublishedSpaceImage,
  type PublishedShareCard,
} from "./publishedCardImage";
import type { SpaceSocialIdentity } from "./spaceSocial";
import { ShareCardPanel } from "@/components/studio/share-card-panel";
import { translate } from "@/lib/i18n";
import { PALETTES } from "@/lib/theme/tokens";

/**
 * TASK 033 P1 (owner decisions A3/A4): the Share Card shows the latest
 * PUBLISHED state only. The environment is `node` with no DOM (see
 * vitest.config.ts), so the browser-drawn card is covered through its pure
 * inputs and structural wiring checks; drawing itself still needs browser QA.
 */

const TENANT = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";
const UP1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const UP2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const UP3 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3";

const pub = (tenant: string, item: string, up: string) => `${tenant}/brand/${item}/${up}/published.webp`;
const SPACE = pub(TENANT, "space", UP1);
const HERO = pub(TENANT, "hero", UP2);
const LOGO = pub(TENANT, "logo", UP3);

function modules(brand: { space?: string | null; hero?: string | null; logo?: string | null }, extra: Record<string, unknown> = {}) {
  return {
    brand: {
      hero: { imageRef: brand.hero ?? null },
      space: { imageRef: brand.space ?? null },
      logo: { imageRef: brand.logo ?? null },
    },
    ...extra,
  };
}

describe("resolvePublishedCardImage (A3 source order)", () => {
  it("the published Space image wins over the Hero", () => {
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ space: SPACE, hero: HERO }) })).toEqual({
      ref: SPACE,
      source: "space",
    });
  });

  it("falls back to the published Hero when there is no Space image", () => {
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ hero: HERO }) })).toEqual({ ref: HERO, source: "hero" });
  });

  it("is null (gradient fallback) when neither is published", () => {
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({}) })).toBeNull();
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: {} })).toBeNull();
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: null })).toBeNull();
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: { brand: "garbage" } })).toBeNull();
  });

  it("rejects a foreign-tenant ref and falls through to the next source", () => {
    const foreign = pub(OTHER, "space", UP1);
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ space: foreign, hero: HERO }) })).toEqual({
      ref: HERO,
      source: "hero",
    });
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ space: foreign }) })).toBeNull();
  });

  it("rejects a ref that the published snapshot does not reference", () => {
    // The Space ref is a well-formed object of this tenant, but it is not in
    // the snapshot passed in: membership is checked against THIS payload.
    expect(isPublishedTenantRef(TENANT, SPACE, new Set([HERO]))).toBe(false);
    expect(isPublishedTenantRef(TENANT, SPACE, new Set([SPACE]))).toBe(true);
  });

  it("never returns a draft path, even one present in the snapshot", () => {
    const draft = `${TENANT}/brand/space/${UP1}/draft.webp`;
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ space: draft }) })).toBeNull();
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ space: draft, hero: HERO }) })?.ref).toBe(HERO);
  });

  it("rejects traversal and malformed refs", () => {
    for (const bad of [`${TENANT}/../x/published.webp`, `${TENANT}/published.webp`, "", "published.webp", `${TENANT}/a/b/published.webp/x`]) {
      expect(isPublishedTenantRef(TENANT, bad, new Set([bad]))).toBe(false);
    }
    expect(isPublishedTenantRef(TENANT, 42, new Set())).toBe(false);
  });

  it("accepts the legacy unversioned published shape of this tenant", () => {
    const legacy = `${TENANT}/brand/hero/published.webp`;
    expect(resolvePublishedCardImage({ tenantId: TENANT, modules: modules({ hero: legacy }) })).toEqual({ ref: legacy, source: "hero" });
  });
});

describe("buildPublishedShareCard - name, logo, colours, image from ONE published snapshot", () => {
  const row = {
    name: "Return to Balance",
    published_at: "2026-10-13T09:00:00.000000+00:00",
    theme: { palette: "warm-earth", atmosphere: "calm-organic", customPrimary: "#112233", customSecondary: null },
    modules: modules({ space: SPACE, hero: HERO, logo: LOGO }, { spaceSettings: { locale: "de" } }),
  };

  it("is null before the first publish", () => {
    expect(buildPublishedShareCard(TENANT, null)).toBeNull();
    expect(buildPublishedShareCard(TENANT, { ...row, published_at: null })).toBeNull();
  });

  it("builds every card field from the published row", () => {
    expect(buildPublishedShareCard(TENANT, row)).toEqual({
      publishedAt: row.published_at,
      name: "Return to Balance",
      publishedCardImageUrl: `/api/media/${SPACE}`,
      imageSource: "space",
      logoUrl: `/api/media/${LOGO}`,
      primaryHex: "#112233",
      secondaryHex: PALETTES["warm-earth"].secondary,
      locale: "de",
    });
  });

  it("draft changes without a republish leave the card unchanged", () => {
    const before = buildPublishedShareCard(TENANT, row);
    // The organizer replaces the Space image, logo, name and colours in the
    // Studio (brand_configs / tenants / useState) but does not republish:
    // the published row is unchanged, and it is the ONLY input.
    const after = buildPublishedShareCard(TENANT, structuredClone(row));
    expect(after).toEqual(before);
    // The page passes the same published card, and with the same publish
    // time the step keeps it - no refetch, no draft source.
    expect(selectPublishedCard(before, null, row.published_at)).toEqual({ card: before, stale: false });
  });

  it("a foreign or unpublished logo is dropped rather than shown", () => {
    const foreignLogo = modules({ hero: HERO, logo: pub(OTHER, "logo", UP3) });
    expect(resolvePublishedLogoRef({ tenantId: TENANT, modules: foreignLogo })).toBeNull();
    expect(buildPublishedShareCard(TENANT, { ...row, modules: foreignLogo })?.logoUrl).toBeNull();
  });

  it("falls back to the default palette for an unreadable theme", () => {
    expect(publishedCardColors(undefined)).toEqual({
      primaryHex: PALETTES["forest-sage"].primary,
      secondaryHex: PALETTES["forest-sage"].secondary,
    });
  });
});

describe("selectPublishedCard - refresh after an in-session Publish/Republish", () => {
  const card = (publishedAt: string, url: string | null): PublishedShareCard => ({
    publishedAt,
    name: "R",
    publishedCardImageUrl: url,
    imageSource: url ? "space" : null,
    logoUrl: null,
    primaryHex: "#000000",
    secondaryHex: "#ffffff",
    locale: "en",
  });
  const T1 = "2026-10-13T09:00:00+00:00";
  const T2 = "2026-10-13T10:00:00+00:00";

  it("nothing to draw before any publish", () => {
    expect(selectPublishedCard(null, null, null)).toEqual({ card: null, stale: false });
  });

  it("a republish marks the held card stale (triggers the re-read) and keeps showing it meanwhile", () => {
    const old = card(T1, "/api/media/old");
    expect(selectPublishedCard(old, null, T2)).toEqual({ card: old, stale: true });
  });

  it("the re-read card for the new publish replaces the old one", () => {
    const old = card(T1, "/api/media/old");
    const fresh = card(T2, "/api/media/new");
    expect(selectPublishedCard(old, fresh, T2)).toEqual({ card: fresh, stale: false });
  });

  it("a first publish in this session re-reads (nothing was held)", () => {
    expect(selectPublishedCard(null, null, T1)).toEqual({ card: null, stale: true });
  });

  it("matches the same instant across serialisations (RPC result vs row select)", () => {
    const held = card("2026-10-13T09:00:00.5+00:00", null);
    expect(selectPublishedCard(held, null, "2026-10-13T09:00:00.500Z").stale).toBe(false);
  });
});

describe("Flow Share Card wiring (structural)", () => {
  const dir = path.join(process.cwd(), "src/app/(site)/configurator/retreat");
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

  it("the configurator passes only the published card - no draft image, logo or colour", () => {
    const src = read("retreat-configurator.tsx");
    const block = src.slice(src.indexOf("<ShareSpaceStep"), src.indexOf("/>", src.indexOf("<ShareSpaceStep")));
    expect(block).toContain("publishedCard={publishedShareCard}");
    expect(block).toContain("publishedAt={currentPublishedAt}");
    for (const draft of ["spaceImageUrl", "logoUrl", "heroImageUrl", "effectivePrimary", "effectiveSecondary"]) {
      expect(block).not.toContain(draft);
    }
    expect(src).not.toContain("publishedHeroImageUrl");
  });

  it("the page builds the card from the published_spaces row", () => {
    const src = read("[tenantId]/page.tsx");
    expect(src).toContain('select("published_at, name, theme, modules")');
    expect(src).toContain("buildPublishedShareCard(tenant.id, published)");
    expect(src).toContain("publishedShareCard={publishedShareCard}");
  });

  it("the step re-reads after a publish and redraws on publishedAt; the thumbnail uses the card image", () => {
    const src = read("share-space-step.tsx");
    expect(src).toContain("loadPublishedShareCard(tenantId)");
    expect(src).toMatch(/\}, \[cardPublishedAt,[^\]]*cardImageUrl[^\]]*\]\);/);
    expect(src).toContain("<img src={cardImageUrl}");
    expect(src).not.toMatch(/spaceImageUrl|heroImageUrl/);
  });

  it("the drawing keeps the gradient fallback, overlay, QR and fetch->blob path", () => {
    const src = read("shareCard.ts");
    expect(src).toContain("publishedCardImageUrl: string | null;");
    expect(src).toContain("createImageBitmap(blob)");
    expect(src).toContain("const heroGrad = ctx.createLinearGradient");
    expect(src).toContain("const overlay = ctx.createLinearGradient");
    expect(src).toContain("loadBitmap(options.qrUrl)");
  });
});

describe("Teach Share Card (A4)", () => {
  const identity = (imageRef: string | null): SpaceSocialIdentity =>
    ({ name: "Lena", role: null, location: null, description: "", imageRef, imagePosition: { x: 10, y: 20 }, brand: {}, version: "v" }) as unknown as SpaceSocialIdentity;
  const PORTRAIT = pub(TENANT, "teachAbout", UP1);

  it("prefers the published Space image over the portrait/hero chain", () => {
    const out = withPublishedSpaceImage(TENANT, modules({ space: SPACE, hero: HERO }), identity(PORTRAIT));
    expect(out.imageRef).toBe(SPACE);
    expect(out.imagePosition).toBeNull();
  });

  it("keeps the existing portrait -> hero choice when no valid Space image is published", () => {
    const base = identity(PORTRAIT);
    expect(withPublishedSpaceImage(TENANT, modules({ hero: HERO }), base)).toBe(base);
    expect(withPublishedSpaceImage(TENANT, modules({ space: pub(OTHER, "space", UP1) }), base)).toBe(base);
    expect(withPublishedSpaceImage(TENANT, modules({ space: `${TENANT}/brand/space/${UP1}/draft.webp` }), base)).toBe(base);
  });

  it("the Studio's card URL carries the publish version", () => {
    expect(shareCardImageUrl(TENANT, "2026-10-13T09:00:00+00:00")).toBe(
      `/api/share-card/${TENANT}?v=2026-10-13T09%3A00%3A00%2B00%3A00`
    );
    expect(shareCardImageUrl(TENANT, null)).toBe(`/api/share-card/${TENANT}`);
  });

  it("the panel's preview and download both use the versioned URL, which changes on republish", () => {
    const render = (publishedAt: string) =>
      renderToStaticMarkup(createElement(ShareCardPanel, { tenantId: TENANT, slug: "lena", published: true, publishedAt }));
    const a = render("2026-10-13T09:00:00Z");
    const b = render("2026-10-13T10:00:00Z");
    const v1 = `/api/share-card/${TENANT}?v=2026-10-13T09%3A00%3A00Z`;
    expect(a).toContain(`src="${v1}"`);
    expect(a).toContain(`href="${v1}"`);
    expect(b).not.toContain(v1);
  });

  it("the Teach Studio mounts the panel with publishedAt", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/(site)/configurator/teach/teach-studio-sections.tsx"), "utf8");
    expect(src).toMatch(/<ShareCardPanel[^>]*publishedAt=\{api\.publishedAt\}/);
  });

  it("the CTA is a localized dictionary key, not hardcoded English", () => {
    expect(translate("en", "teach", "shareCardCta")).toBe("Scan to explore classes & connect");
    for (const locale of ["de", "es", "fr", "he"] as const) {
      expect(translate(locale, "teach", "shareCardCta")).not.toBe(translate("en", "teach", "shareCardCta"));
    }
    const route = readFileSync(path.join(process.cwd(), "src/app/api/share-card/[tenantId]/route.tsx"), "utf8");
    expect(route).toContain('cta: translate(locale, "teach", "shareCardCta")');
    expect(route).toContain("localeFromPublishedModules(space.modules)");
    expect(route).toContain("withPublishedSpaceImage(tenant.id, space.modules, space.identity)");
  });

  it("Hebrew falls back to English on the card only (Satori has no bidi)", () => {
    expect(shareCardCtaLocale("he")).toBe("en");
    expect(shareCardCtaLocale("de")).toBe("de");
  });
});
