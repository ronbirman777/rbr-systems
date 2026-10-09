import { describe, expect, it } from "vitest";
import { resolveSpaceCardImage } from "./cardImage";

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const ref = (tenant: string, area: string, name = "a1") => `${tenant}/${area}/${name}/22222222-2222-4222-8222-222222222222/draft.webp`;

const teach = (brand: { space_image_ref?: string | null; hero_image_ref?: string | null } | null, settings: Record<string, unknown> = {}) =>
  resolveSpaceCardImage({ tenantId: T, productType: "teach", brand: brand ? { space_image_ref: null, hero_image_ref: null, ...brand } : null, settings });

describe("Teach card image: a fixed, deterministic order", () => {
  const settings = {
    teachProfile: { heroImagePosition: { x: 30, y: 20 } },
    teachAbout: { profile: { imageRef: ref(T, "teachAbout", "profile"), imagePosition: { x: 50, y: 10 } } },
    teachContact: { cover: { imageRef: ref(T, "teachContact", "cover"), imagePosition: { x: 5, y: 6 } } },
    teachExplore: { cards: { teachReadings: { imageRef: ref(T, "teachExplore", "r"), imagePosition: { x: 1, y: 2 } }, teachAudio: { imageRef: ref(T, "teachExplore", "a") }, teachContact: { imageRef: ref(T, "teachExplore", "c") } } },
  };
  const space = ref(T, "brand", "space");
  const hero = ref(T, "brand", "hero");

  it("1. an explicit Space image wins over everything", () => {
    expect(teach({ space_image_ref: space, hero_image_ref: hero }, settings)).toMatchObject({ ref: space, source: "space" });
  });
  it("2. then the hero image, carrying the hero's own focal point", () => {
    expect(teach({ hero_image_ref: hero }, settings)).toEqual({ ref: hero, position: { x: 30, y: 20 }, source: "hero" });
  });
  it("3. then the teacher's profile photo, with the PHOTO's focal point (not the hero's)", () => {
    expect(teach({}, settings)).toEqual({ ref: ref(T, "teachAbout", "profile"), position: { x: 50, y: 10 }, source: "profile" });
  });
  it("4. then the Contact cover, then Explore covers in the fixed order Readings, Audio, Contact", () => {
    const { teachAbout, ...rest } = settings;
    void teachAbout;
    expect(teach({}, rest)).toMatchObject({ ref: ref(T, "teachContact", "cover"), source: "cover", position: { x: 5, y: 6 } });
    const { teachContact, ...cards } = rest;
    void teachContact;
    expect(teach({}, cards)).toMatchObject({ ref: ref(T, "teachExplore", "r"), position: { x: 1, y: 2 } });
    const noReadings = { teachExplore: { cards: { teachAudio: settings.teachExplore.cards.teachAudio, teachContact: settings.teachExplore.cards.teachContact } } };
    expect(teach({}, noReadings)).toMatchObject({ ref: ref(T, "teachExplore", "a") });
  });
  it("5. nothing at all -> null, so the caller shows the generic InnerDweS fallback", () => {
    expect(teach({}, {})).toBeNull();
    expect(teach(null, {})).toBeNull();
    expect(teach(undefined as never, undefined)).toBeNull();
  });
  it("never consults module items: the signature has no way to receive them", () => {
    expect(resolveSpaceCardImage.length).toBe(1);
  });
  it("ignores malformed settings rather than throwing", () => {
    expect(teach({}, { teachAbout: "junk", teachProfile: 5, teachContact: [], teachExplore: { cards: "x" } })).toBeNull();
    expect(teach({ hero_image_ref: hero }, { teachProfile: { heroImagePosition: "bad" } })).toMatchObject({ ref: hero, position: null });
  });
});

describe("tenant isolation: a card can only ever sign its own Space's objects", () => {
  it("a ref under another tenant, a path traversal, or a non-draft object is ignored", () => {
    expect(teach({ space_image_ref: ref(OTHER, "brand", "space") })).toBeNull();
    expect(teach({ hero_image_ref: `${T}/../${OTHER}/brand/hero/h/22222222-2222-4222-8222-222222222222/draft.webp` })).toBeNull();
    expect(teach({ hero_image_ref: `${T}/brand/hero/h/22222222-2222-4222-8222-222222222222/published.webp` })).toBeNull();
    expect(teach({}, { teachAbout: { profile: { imageRef: ref(OTHER, "teachAbout", "profile") } } })).toBeNull();
  });
  it("falls through to the next valid source when an earlier one is foreign", () => {
    const hero = ref(T, "brand", "hero");
    expect(teach({ space_image_ref: ref(OTHER, "brand", "space"), hero_image_ref: hero })).toMatchObject({ ref: hero, source: "hero" });
  });
});

describe("Flow card image: existing behaviour preserved", () => {
  const flow = (brand: { space_image_ref?: string | null; hero_image_ref?: string | null }) =>
    resolveSpaceCardImage({ tenantId: T, productType: "retreat", brand: { space_image_ref: null, hero_image_ref: null, ...brand } });
  const space = ref(T, "brand", "space");
  const hero = ref(T, "brand", "hero");

  it("a Flow Space with a Space image still shows exactly that (Return to Balance)", () => {
    expect(flow({ space_image_ref: space, hero_image_ref: hero })).toEqual({ ref: space, position: null, source: "space" });
  });
  it("the hero only appears where the card used to show the generic placeholder", () => {
    expect(flow({ hero_image_ref: hero })).toMatchObject({ ref: hero, source: "hero" });
  });
  it("neither: generic fallback", () => {
    expect(flow({})).toBeNull();
  });
  it("Flow never reads Teach-only settings, even if a row exists", () => {
    const out = resolveSpaceCardImage({ tenantId: T, productType: "retreat", brand: { space_image_ref: null, hero_image_ref: null }, settings: { teachAbout: { profile: { imageRef: ref(T, "teachAbout", "profile") } } } });
    expect(out).toBeNull();
  });
  it("an unknown product type is treated like Flow, never like Teach", () => {
    expect(resolveSpaceCardImage({ tenantId: T, productType: "mystery", brand: { space_image_ref: null, hero_image_ref: hero } })).toMatchObject({ source: "hero" });
  });
});
