import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectElements } from "@/lib/spaceTypes/elementTree.test-util";

/** TASK 031 W2: the card image is chosen from batched reads and signed in ONE call. */

const state = vi.hoisted(() => ({
  tenants: [] as unknown[],
  brand: [] as unknown[],
  settings: [] as unknown[],
  queries: [] as { table: string; inIds?: unknown }[],
  signedBatches: [] as string[][],
  singleSigns: 0,
  failPaths: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("next/link", () => ({ default: function Link() { return null; } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const resolveTo = (table: string, data: unknown) => {
      const rec = { table } as { table: string; inIds?: unknown };
      state.queries.push(rec);
      const p: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data }).then(ok) };
      p.order = () => p;
      p.eq = () => p;
      p.in = (col: string, ids: unknown) => {
        if (col === "tenant_id") rec.inIds = ids;
        return p;
      };
      return p;
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      storage: {
        from: () => ({
          createSignedUrl: async () => (state.singleSigns++, { data: null }),
          createSignedUrls: async (paths: string[]) => (state.signedBatches.push(paths), { data: paths.map((p) => (state.failPaths.includes(p) ? { path: p, signedUrl: null, error: "Object not found" } : { path: p, signedUrl: `https://signed.test/${p}`, error: null })) }),
        }),
      },
      from: (table: string) => ({
        select: () => {
          if (table === "tenants") return resolveTo(table, state.tenants);
          if (table === "brand_configs") return resolveTo(table, state.brand);
          if (table === "module_settings") return resolveTo(table, state.settings);
          return resolveTo(table, []);
        },
      }),
    };
  },
}));
vi.mock("@/app/(site)/configurator/retreat/lifecycleActions", () => ({ getSpaceSlotSummary: async () => ({ slotsUsed: 1, slotsAllowed: 5, slotsAvailable: 4 }) }));
vi.mock("@/components/brand/wordmark", () => ({ InnerDweSMark: function Mark() { return null; } }));
vi.mock("@/components/publish-space-button", () => ({ PublishSpaceButton: function Publish() { return null; } }));
vi.mock("@/components/space-thumbnail", () => ({ SpaceThumbnail: function Thumb() { return null; } }));
vi.mock("@/components/space-lifecycle-controls", () => ({ SpaceLifecycleControls: function Lifecycle() { return null; } }));
vi.mock("@/components/space-open-link", () => ({ SpaceOpenLink: function OpenLink() { return null; } }));
vi.mock("@/app/(site)/(auth)/actions", () => ({ signOut: async () => {} }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: function Logout() { return null; } }));
vi.mock("@/components/delete-space-control", () => ({ DeleteSpaceControl: function DeleteSpace() { return null; } }));
vi.mock("@/components/delete-account-control", () => ({ DeleteAccountControl: function DeleteAccount() { return null; } }));

import { SpaceThumbnail } from "@/components/space-thumbnail";
import MySpacePage from "./page";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const U = "22222222-2222-4222-8222-222222222222";
const draft = (t: string, area: string) => `${t}/${area}/${U}/draft.webp`;
const tenant = (id: string, product_type: string, name: string) => ({ id, name, product_type, status: "active", slug: null, content_updated_at: "2027-01-01T00:00:00Z", published_spaces: null });

async function thumbs() {
  const tree = await MySpacePage();
  return collectElements(tree).filter((e) => e.type === SpaceThumbnail).map((e) => e.props as { imageUrl: string | null; focal: unknown; size: number; alt: string });
}

beforeEach(() => {
  state.tenants = [];
  state.brand = [];
  state.settings = [];
  state.queries = [];
  state.signedBatches = [];
  state.singleSigns = 0;
  state.failPaths = [];
});

describe("My Spaces card images", () => {
  it("Teach with only a hero, Teach with only a profile photo, Flow with a Space image: each shows its own, signed in ONE batched call", async () => {
    state.tenants = [tenant(A, "teach", "Lena"), tenant(B, "teach", "Maya"), tenant(C, "retreat", "Return to Balance")];
    state.brand = [
      { tenant_id: A, space_image_ref: null, hero_image_ref: draft(A, "brand/hero") },
      { tenant_id: B, space_image_ref: null, hero_image_ref: null },
      { tenant_id: C, space_image_ref: draft(C, "brand/space"), hero_image_ref: draft(C, "brand/hero") },
    ];
    state.settings = [
      { tenant_id: A, module_key: "teachProfile", data: { heroImagePosition: { x: 40, y: 15 } } },
      { tenant_id: B, module_key: "teachAbout", data: { profile: { imageRef: draft(B, "teachAbout/profile"), imagePosition: { x: 55, y: 5 } } } },
    ];
    const out = await thumbs();
    expect(out.map((t) => t.imageUrl)).toEqual([
      `https://signed.test/${draft(A, "brand/hero")}`,
      `https://signed.test/${draft(B, "teachAbout/profile")}`,
      `https://signed.test/${draft(C, "brand/space")}`,
    ]);
    expect(out[0].focal).toEqual({ x: 40, y: 15 });
    expect(out[1].focal).toEqual({ x: 55, y: 5 });
    expect(out[2].focal).toBeNull();
    expect(out.every((t) => t.size === 80)).toBe(true);
    expect(state.signedBatches).toHaveLength(1);
    expect(state.singleSigns).toBe(0);
  });

  it("only the CHOSEN image per card is signed - never every candidate", async () => {
    state.tenants = [tenant(A, "teach", "Lena")];
    state.brand = [{ tenant_id: A, space_image_ref: null, hero_image_ref: draft(A, "brand/hero") }];
    state.settings = [
      { tenant_id: A, module_key: "teachAbout", data: { profile: { imageRef: draft(A, "teachAbout/profile") } } },
      { tenant_id: A, module_key: "teachContact", data: { cover: { imageRef: draft(A, "teachContact/cover") } } },
    ];
    await thumbs();
    expect(state.signedBatches).toEqual([[draft(A, "brand/hero")]]);
  });

  it("no N+1: one settings query for ALL Teach Spaces, none at all for a Flow-only account", async () => {
    state.tenants = [tenant(A, "teach", "One"), tenant(B, "teach", "Two"), tenant(C, "teach", "Three")];
    await thumbs();
    const settingQueries = state.queries.filter((q) => q.table === "module_settings");
    expect(settingQueries).toHaveLength(1);
    expect(settingQueries[0].inIds).toEqual([A, B, C]);
    expect(state.queries.filter((q) => q.table === "brand_configs")).toHaveLength(1);

    state.queries = [];
    state.tenants = [tenant(C, "retreat", "Flow only")];
    await thumbs();
    expect(state.queries.filter((q) => q.table === "module_settings")).toHaveLength(0);
  });

  it("generic fallback: no image anywhere means no URL and nothing is signed", async () => {
    state.tenants = [tenant(A, "teach", "Empty"), tenant(C, "retreat", "Empty flow")];
    state.brand = [{ tenant_id: A, space_image_ref: null, hero_image_ref: null }];
    const out = await thumbs();
    expect(out.map((t) => t.imageUrl)).toEqual([null, null]);
    expect(state.signedBatches).toHaveLength(0);
  });

  it("a signing failure for one object degrades ONLY that card to the fallback, and never throws", async () => {
    state.tenants = [tenant(A, "teach", "Lena"), tenant(C, "retreat", "Flow")];
    state.brand = [
      { tenant_id: A, space_image_ref: null, hero_image_ref: draft(A, "brand/hero") },
      { tenant_id: C, space_image_ref: draft(C, "brand/space"), hero_image_ref: null },
    ];
    state.failPaths = [draft(A, "brand/hero")];
    const out = await thumbs();
    expect(out.map((t) => t.imageUrl)).toEqual([null, `https://signed.test/${draft(C, "brand/space")}`]);
  });

  it("a foreign or tampered ref is never signed", async () => {
    state.tenants = [tenant(A, "teach", "Lena")];
    state.brand = [{ tenant_id: A, space_image_ref: draft(B, "brand/space"), hero_image_ref: null }];
    const out = await thumbs();
    expect(out[0].imageUrl).toBeNull();
    expect(state.signedBatches).toHaveLength(0);
  });

  it("never builds a public or direct-storage URL itself", async () => {
    state.tenants = [tenant(A, "teach", "Lena")];
    state.brand = [{ tenant_id: A, space_image_ref: null, hero_image_ref: draft(A, "brand/hero") }];
    const out = await thumbs();
    expect(out[0].imageUrl).toMatch(/^https:\/\/signed\.test\//);
    expect(JSON.stringify(out)).not.toContain("/api/media");
  });
});
