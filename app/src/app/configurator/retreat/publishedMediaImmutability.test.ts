import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "@/lib/media/fakeSupabase.test-util";

/**
 * TASK 023 - published media is an immutable snapshot. Runs the REAL
 * Studio actions, copyDraftToPublished and the post-publish sweep against
 * an in-memory Supabase. "Live" means: referenced by the committed
 * published_spaces snapshot (exactly what /api/media serves).
 */

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.supabase }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/entitlements/availability", () => ({ deriveCommercialAvailability: () => ({ canPublish: true }) }));
// sharp: identity transform - the bytes uploaded are the bytes we passed in.
vi.mock("sharp", () => ({
  default: (input: Buffer) => {
    const chain = { rotate: () => chain, resize: () => chain, webp: () => chain, toBuffer: async () => input };
    return chain;
  },
}));

const actions = await import("./actions");

const PREV = { error: null } as never;
function fd(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const png = (bytes: string) => new File([bytes], "p.png", { type: "image/png" });

async function uploadItem(moduleKey: string, itemId: string, bytes: string, previousRef = "") {
  const r = await actions.uploadModuleItemPhoto(PREV, fd({ tenantId: T, moduleKey, itemId, previousRef, title: "X", sortOrder: "0", file: png(bytes) }));
  expect(r.error).toBeNull();
  return r.imageRef as string;
}
async function uploadCover(module: string, bytes: string) {
  const r = await actions.uploadModuleCoverPhoto(PREV, fd({ tenantId: T, moduleKey: module, file: png(bytes) }));
  expect(r.error).toBeNull();
  return r.imageRef as string;
}
async function uploadBrand(kind: string, bytes: string) {
  const r = await actions.uploadBrandImage(PREV, fd({ tenantId: T, kind, file: png(bytes) }));
  expect(r.error).toBeNull();
  return r.imageRef as string;
}
const publish = () => actions.publishSpace({ error: null, publishedAt: null }, fd({ tenantId: T }));
const pub = (draft: string) => draft.replace("/draft.", "/published.");
const exists = (p: string) => fake.files.has(p);
const bytesOf = (p: string) => fake.files.get(p)?.bytes;
const live = () => fake.snapshotRefs(T);

beforeEach(() => {
  vi.clearAllMocks();
  fake = makeFakeSupabase();
});

describe("list-item media (meals / treatments / facilities / facilitators / custom pages)", () => {
  for (const mod of ["meals", "treatments", "facilities", "facilitators", "customPages"]) {
    describe(mod, () => {
      it("published image survives item delete before republish; disappears only after a successful republish", async () => {
        const A = await uploadItem(mod, "item-1", "A");
        expect((await publish()).error).toBeNull();
        expect(live()).toEqual([pub(A)]);

        await actions.deleteModuleItem({ error: null }, fd({ tenantId: T, itemId: "item-1" }));
        expect(exists(pub(A))).toBe(true);
        expect(bytesOf(pub(A))).toBe("A");
        expect(live()).toEqual([pub(A)]);
        expect(exists(A)).toBe(false); // the DRAFT object is gone

        expect((await publish()).error).toBeNull();
        expect(live()).toEqual([]);
        expect(exists(pub(A))).toBe(false); // cleanup-eligible only now
      });

      it("published image survives Remove photo before republish", async () => {
        const A = await uploadItem(mod, "item-1", "A");
        await publish();
        await actions.removeModuleItemPhoto({ error: null }, fd({ tenantId: T, itemId: "item-1", imageRef: A }));
        expect(exists(pub(A))).toBe(true);
        expect(live()).toEqual([pub(A)]);
        await publish();
        expect(live()).toEqual([]);
        expect(exists(pub(A))).toBe(false);
      });

      it("image A survives replacement with B until republish, then the snapshot switches to B", async () => {
        const A = await uploadItem(mod, "item-1", "A");
        await publish();
        const B = await uploadItem(mod, "item-1", "B", A);
        expect(B).not.toBe(A);
        expect(bytesOf(pub(A))).toBe("A");
        expect(live()).toEqual([pub(A)]);
        expect(exists(A)).toBe(false); // replaced draft is cleaned immediately (draft-only)

        expect((await publish()).error).toBeNull();
        expect(live()).toEqual([pub(B)]);
        expect(bytesOf(pub(B))).toBe("B");
        expect(exists(pub(A))).toBe(false);
      });
    });
  }

  it("Save (list submit) that drops an item removes only its draft; the published copy waits for Publish", async () => {
    const A = await uploadItem("customPages", "page-1", "A");
    await uploadItem("customPages", "page-2", "B");
    await publish();
    const items = [{ id: "page-2", title: "Two", body: null, imageRef: null, enabled: true }];
    const r = await actions.saveCustomPages({ error: null }, fd({ tenantId: T, items: JSON.stringify(items) }));
    expect(r.error).toBeNull();
    expect(exists(A)).toBe(false);
    expect(exists(pub(A))).toBe(true);
    expect(live()).toContain(pub(A));
    await publish();
    expect(live()).not.toContain(pub(A));
    expect(exists(pub(A))).toBe(false);
  });
});

describe("fixed-slot media", () => {
  it("hero: replacement keeps the published hero until republish", async () => {
    const A = await uploadBrand("hero", "hero-A");
    await publish();
    const B = await uploadBrand("hero", "hero-B");
    expect(B).not.toBe(A);
    expect(bytesOf(pub(A))).toBe("hero-A");
    expect(live()).toEqual([pub(A)]);
    await publish();
    expect(live()).toEqual([pub(B)]);
    expect(exists(pub(A))).toBe(false);
  });

  it("hero/logo removal keeps the published image until republish", async () => {
    const H = await uploadBrand("hero", "h");
    const L = await uploadBrand("logo", "l");
    await publish();
    await actions.removeBrandImage({ error: null }, fd({ tenantId: T, kind: "hero", imageRef: H }));
    await actions.removeBrandImage({ error: null }, fd({ tenantId: T, kind: "logo", imageRef: L }));
    expect(live()).toEqual([pub(H), pub(L)].sort());
    expect(exists(pub(H)) && exists(pub(L))).toBe(true);
    await publish();
    expect(live()).toEqual([]);
    expect(exists(pub(H)) || exists(pub(L))).toBe(false);
  });

  it("module cover: replace and remove preserve the published cover until republish", async () => {
    const A = await uploadCover("meals", "cover-A");
    await publish();
    const B = await uploadCover("meals", "cover-B");
    expect(bytesOf(pub(A))).toBe("cover-A");
    expect(live()).toEqual([pub(A)]);
    await actions.removeModuleCoverPhoto({ error: null }, fd({ tenantId: T, moduleKey: "meals", imageRef: B }));
    expect(live()).toEqual([pub(A)]);
    expect(exists(pub(A))).toBe(true);
    await publish();
    expect(live()).toEqual([]);
    expect(exists(pub(A))).toBe(false);
  });
});

describe("publish failure and retry", () => {
  it("RPC failure: previous snapshot and image A intact; B's copy is only an orphan; retry succeeds", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    await publish();
    const B = await uploadItem("meals", "item-1", "B", A);
    fake.setFailure("rpc", "db down");
    const failed = await publish();
    expect(failed.error).toBe("db down");
    expect(live()).toEqual([pub(A)]);
    expect(bytesOf(pub(A))).toBe("A");
    expect(exists(pub(B))).toBe(true);
    fake.setFailure("rpc", null);
    expect((await publish()).error).toBeNull();
    expect(live()).toEqual([pub(B)]);
    expect(exists(pub(A))).toBe(false);
  });

  it("copy failure: no RPC, previous snapshot and A intact", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    await publish();
    await uploadItem("meals", "item-1", "B", A);
    const rpcCalls = fake.rpc.mock.calls.length;
    fake.setFailure("copy", "quota");
    const failed = await publish();
    expect(failed.error).toContain("Could not publish your photos");
    expect(fake.rpc.mock.calls.length).toBe(rpcCalls);
    expect(live()).toEqual([pub(A)]);
    expect(bytesOf(pub(A))).toBe("A");
  });

  it("copy failure on the FIRST image of several leaves earlier live media untouched", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    const H = await uploadBrand("hero", "H");
    await publish();
    fake.setFailure("copy", "network");
    await uploadItem("meals", "item-1", "B", A).catch(() => {});
    expect((await publish()).error).toContain("Could not publish your photos");
    expect(live()).toEqual([pub(A), pub(H)].sort());
  });

  it("cleanup failure after a committed publish: Publish still succeeds, new snapshot works, retry sweeps safely", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    await publish();
    const B = await uploadItem("meals", "item-1", "B", A);
    fake.setFailure("remove", "storage down");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await publish();
    spy.mockRestore();
    expect(r.error).toBeNull();
    expect(live()).toEqual([pub(B)]);
    expect(bytesOf(pub(B))).toBe("B");
    expect(exists(pub(A))).toBe(true); // orphan left behind - acceptable

    fake.setFailure("remove", null);
    // A is an orphan no longer in ANY snapshot; it is reclaimed once it is
    // older than the grace period on a later successful Publish.
    fake.files.get(pub(A))!.updatedAt = "2020-01-01T00:00:00Z";
    expect((await publish()).error).toBeNull();
    expect(exists(pub(A))).toBe(false);
    expect(exists(pub(B))).toBe(true);
    expect(live()).toEqual([pub(B)]);
  });

  it("republishing with nothing changed rewrites identical bytes and removes nothing that is live", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    await publish();
    await publish();
    expect(live()).toEqual([pub(A)]);
    expect(bytesOf(pub(A))).toBe("A");
  });
});

describe("guards on client-supplied refs", () => {
  it("removeModuleItemPhoto never deletes a published object or another tenant's file, even when asked to", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    await publish();
    fake.put(`${OTHER}/meals/x/u/draft.webp`, "victim");
    for (const bad of [pub(A), `${OTHER}/meals/x/u/draft.webp`, `${T}/../${OTHER}/meals/x/u/draft.webp`]) {
      await actions.removeModuleItemPhoto({ error: null }, fd({ tenantId: T, itemId: "item-1", imageRef: bad }));
    }
    expect(exists(pub(A))).toBe(true);
    expect(exists(`${OTHER}/meals/x/u/draft.webp`)).toBe(true);
  });

  it("brand and cover removal are guarded the same way", async () => {
    const H = await uploadBrand("hero", "h");
    const C = await uploadCover("meals", "c");
    await publish();
    await actions.removeBrandImage({ error: null }, fd({ tenantId: T, kind: "hero", imageRef: pub(H) }));
    await actions.removeModuleCoverPhoto({ error: null }, fd({ tenantId: T, moduleKey: "meals", imageRef: pub(C) }));
    expect(exists(pub(H)) && exists(pub(C))).toBe(true);
  });

  it("a crafted item row whose image_ref points at another tenant's draft is never copied at publish", async () => {
    fake.put(`${OTHER}/meals/x/u/draft.webp`, "victim");
    fake.tables.module_items.push({ id: "evil", tenant_id: T, module_key: "meals", image_ref: `${OTHER}/meals/x/u/draft.webp` });
    await publish();
    expect(exists(`${OTHER}/meals/x/u/published.webp`)).toBe(false);
  });
});

describe("upload failure ordering", () => {
  it("DB failure after upload removes the new draft object and leaves the row and old draft alone", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    const before = fake.files.size;
    fake.setFailure("upsert:module_items", "constraint");
    const r = await actions.uploadModuleItemPhoto(PREV, fd({ tenantId: T, moduleKey: "meals", itemId: "item-1", title: "X", sortOrder: "0", file: png("B") }));
    expect(r.error).toBe("constraint");
    expect(fake.files.size).toBe(before);
    expect(exists(A)).toBe(true);
    expect(fake.tables.module_items[0].image_ref).toBe(A);
  });
});

describe("legacy single-path media (not migrated, not made less safe)", () => {
  it("a legacy draft/published pair keeps working: republish rewrites in place, snapshot keeps pointing at it", async () => {
    fake.put(`${T}/meals/item-1/draft.webp`, "legacy");
    fake.put(`${T}/meals/item-1/published.webp`, "legacy-old");
    fake.tables.module_items.push({ id: "item-1", tenant_id: T, module_key: "meals", image_ref: `${T}/meals/item-1/draft.webp` });
    expect((await publish()).error).toBeNull();
    expect(live()).toEqual([`${T}/meals/item-1/published.webp`]);
    expect(exists(`${T}/meals/item-1/published.webp`)).toBe(true);
  });

  it("replacing a legacy photo moves to a versioned key and the legacy published copy survives until republish", async () => {
    fake.put(`${T}/meals/item-1/draft.webp`, "legacy");
    fake.tables.module_items.push({ id: "item-1", tenant_id: T, module_key: "meals", image_ref: `${T}/meals/item-1/draft.webp` });
    await publish();
    const legacyPub = `${T}/meals/item-1/published.webp`;
    const B = await uploadItem("meals", "item-1", "B", `${T}/meals/item-1/draft.webp`);
    expect(exists(legacyPub)).toBe(true);
    expect(live()).toEqual([legacyPub]);
    await publish();
    expect(live()).toEqual([pub(B)]);
    expect(exists(legacyPub)).toBe(false);
  });
});

describe("Phase 3C - versioned image lifecycle needs no Storage UPDATE", () => {
  it("upload, replace and publish of items, covers and brand images never upsert, overwrite or re-upload a published object", async () => {
    const A = await uploadItem("meals", "item-1", "A");
    const C = await uploadCover("meals", "cover");
    const H = await uploadBrand("hero", "H");
    expect((await publish()).error).toBeNull();
    const B = await uploadItem("meals", "item-1", "B", A);
    expect((await publish()).error).toBeNull();
    // retry of an already-published snapshot is idempotent
    expect((await publish()).error).toBeNull();

    const uploadCalls = fake.storageApi.upload.mock.calls as unknown as [string, unknown, { upsert?: boolean }][];
    expect(uploadCalls.length).toBeGreaterThanOrEqual(4);
    for (const [path, , opts] of uploadCalls) {
      expect(opts.upsert).toBe(false);
      expect(path).toMatch(/\/draft\./);
    }
    const copies = fake.storageApi.copy.mock.calls as unknown as [string, string][];
    // every publish re-copies each live draft; re-copies are idempotent no-ops
    expect([...new Set(copies.map(([, to]) => to))].sort()).toEqual([pub(A), pub(B), pub(C), pub(H)].sort());
    expect(live()).toEqual([pub(B), pub(C), pub(H)].sort());
    expect(bytesOf(pub(B))).toBe("B");
  });

  it("module covers and brand images still publish and keep their focal-point bytes", async () => {
    const C = await uploadCover("meals", "cover");
    const L = await uploadBrand("logo", "L");
    expect((await publish()).error).toBeNull();
    expect(live()).toEqual([pub(C), pub(L)].sort());
    expect(bytesOf(pub(C))).toBe("cover");
    expect(bytesOf(pub(L))).toBe("L");
  });
});
