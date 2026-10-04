import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { previewableIdentity, type SocialSpace } from "./publishedSocialSpace";
import { buildSpaceSocialIdentity, type SocialSpaceRow } from "./spaceSocial";

/**
 * What a link preview is allowed to reveal, per guest-access state. This is
 * the boundary that keeps a generated OG card from becoming a way to read a
 * Space you are not allowed to open.
 */

const TENANT = "b0000000-1111-4222-8333-444444444444";
const HERO = `${TENANT}/brand/hero/h1/published.webp`;
const PORTRAIT = `${TENANT}/teachAbout/profile/p1/published.webp`;

const ROW: SocialSpaceRow = {
  product_type: "teach",
  name: "Lena Hoffmann",
  slug: "teacherexample",
  published_at: "2026-10-04T11:19:16Z",
  theme: null,
  modules: {
    brand: { hero: { imageRef: HERO } },
    teach: {
      settings: {
        teachProfile: { teacherType: "Yoga & Breathwork Educator", locationLine: "Ubud, Bali" },
        teachAbout: { about: "A private bio that guests behind a code have not been shown.", profile: { imageRef: PORTRAIT } },
      },
      items: {},
    },
  },
};

const space = (access: SocialSpace["access"]): SocialSpace => ({
  tenantId: TENANT,
  slug: ROW.slug,
  identity: buildSpaceSocialIdentity(ROW),
  access,
  modules: ROW.modules,
  row: ROW as never,
});

describe("link preview respects guest access", () => {
  it("shows the full identity only when the Space is openly available", () => {
    const id = previewableIdentity(space("granted"))!;
    expect(id.role).toBe("Yoga & Breathwork Educator");
    expect(id.description).toContain("A private bio");
    expect(id.imageRef).toBe(PORTRAIT);
  });

  it("reveals nothing at all for a lapsed or unavailable Space", () => {
    expect(previewableIdentity(space("unavailable"))).toBeNull();
  });

  it("reduces a code-protected Space to exactly what its code screen already shows", () => {
    const id = previewableIdentity(space("code-required"))!;
    expect(id.name).toBe("Lena Hoffmann");
    // The hero is public pre-gate (the code screen renders it); the bio,
    // role and location are not.
    expect(id.imageRef).toBe(HERO);
    expect(id.role).toBeNull();
    expect(id.location).toBeNull();
    expect(id.description).toBe("");
    expect(JSON.stringify(id)).not.toContain("private bio");
    expect(JSON.stringify(id)).not.toContain("Breathwork");
  });

  it("never falls back to a non-pre-gate image for a code-protected Space", () => {
    const id = previewableIdentity(space("code-required"))!;
    expect(id.imageRef).not.toBe(PORTRAIT);
  });

  it("reveals nothing for a product that has no guest app", () => {
    const noGuest = { ...space("granted"), identity: buildSpaceSocialIdentity({ ...ROW, product_type: "client_hub" }) };
    expect(previewableIdentity(noGuest)).toBeNull();
  });
});
