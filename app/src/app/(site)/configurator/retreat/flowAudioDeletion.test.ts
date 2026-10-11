import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "@/lib/media/fakeSupabase.test-util";
import { rowDraftRefs } from "@/lib/media/draftRefs";
vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/billing/audioQuota.server", () => ({ loadAudioQuotaPolicy: async () => ({ mode: "unenforced", reason: "legacy" }) }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/entitlements/availability", () => ({ deriveCommercialAvailability: () => ({ canPublish: true }) }));

/**
 * TASK 032.5 W0 - deleting a Flow audio item (Remove button -> deleteModuleItem,
 * or a Save that drops the track -> saveModuleItemsGeneric) used to clean up
 * only image_ref, leaking the draft recording referenced by metadata.audioRef.
 * Mirrors Teach's audioLifecycle "deleting an item removes its own draft" test.
 */

const T = "11111111-1111-4111-8111-111111111111";
const ITEM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UP = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const audio = (item: string, kind: "draft" | "published") => `${T}/audioFile/${item}/${UP}/${kind}.mp3`;
const art = (item: string) => `${T}/audio/${item}/${UP}/draft.webp`;

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.supabase }));
const actions = await import("./actions");

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
function seedItem(id: string) {
  fake.tables.module_items.push({
    id, tenant_id: T, module_key: "audio", title: "Track", sort_order: 0, image_ref: art(id),
    metadata: { audioRef: audio(id, "draft"), durationSeconds: 60 },
  });
  fake.put(audio(id, "draft"), "D");
  fake.put(audio(id, "published"), "P");
  fake.put(art(id), "A");
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeSupabase();
});

describe("rowDraftRefs", () => {
  it("returns image_ref and metadata.audioRef, ignoring non-strings", () => {
    expect(rowDraftRefs({ image_ref: "a", metadata: { audioRef: "b" } })).toEqual(["a", "b"]);
    expect(rowDraftRefs({ image_ref: null, metadata: { audioRef: 5 } })).toEqual([]);
    expect(rowDraftRefs({ image_ref: "a", metadata: null })).toEqual(["a"]);
    expect(rowDraftRefs(null)).toEqual([]);
  });
});

describe("Flow audio item deletion cleans its draft recording", () => {
  it("deleteModuleItem removes the draft audio and artwork, keeps the published copy and other items", async () => {
    seedItem(ITEM);
    seedItem(OTHER);
    const r = await actions.deleteModuleItem({ error: null }, fd({ tenantId: T, itemId: ITEM }));
    expect(r.error).toBeNull();
    expect(fake.files.has(audio(ITEM, "draft"))).toBe(false);
    expect(fake.files.has(art(ITEM))).toBe(false);
    expect(fake.files.has(audio(ITEM, "published"))).toBe(true); // live snapshot may still use it
    expect(fake.files.has(audio(OTHER, "draft"))).toBe(true);
    expect(fake.tables.module_items.map((r) => r.id)).toEqual([OTHER]);
  });

  it("a foreign-tenant audioRef in metadata is never deleted", async () => {
    const foreign = `22222222-2222-4222-8222-222222222222/audioFile/${ITEM}/${UP}/draft.mp3`;
    fake.tables.module_items.push({ id: ITEM, tenant_id: T, module_key: "audio", image_ref: null, metadata: { audioRef: foreign } });
    fake.put(foreign, "X");
    await actions.deleteModuleItem({ error: null }, fd({ tenantId: T, itemId: ITEM }));
    expect(fake.files.has(foreign)).toBe(true);
  });

  it("a Save that drops a track (saveFlowAudio -> saveModuleItemsGeneric) removes that track's draft audio", async () => {
    fake.tables.tenants.push({ id: T, product_type: "retreat" });
    seedItem(ITEM);
    seedItem(OTHER);
    const items = JSON.stringify([{ id: OTHER, title: "Track", sortOrder: 0, metadata: {} }]);
    const r = await actions.saveFlowAudio({ error: null } as never, fd({ tenantId: T, items }));
    expect(r.error).toBeNull();
    expect(fake.tables.module_items.map((x) => x.id)).toEqual([OTHER]);
    expect(fake.files.has(audio(ITEM, "draft"))).toBe(false);
    expect(fake.files.has(audio(ITEM, "published"))).toBe(true);
    expect(fake.files.has(audio(OTHER, "draft"))).toBe(true);
  });
});
