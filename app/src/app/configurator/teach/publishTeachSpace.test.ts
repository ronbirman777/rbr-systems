import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/media/fakeSupabase.test-util";
import { collectMediaRefs } from "@/lib/media/path";

/**
 * TASK 027.5 Phase 4A: publishTeachSpace on the versioned (uploadId) media
 * model, against the shared in-memory Storage fake (create-only upload, copy
 * with 409 on an existing destination). The RPC is emulated here: it builds
 * the Teach payload and rewrites draft refs exactly like build_teach_payload
 * (the real SQL is validated against Postgres by
 * supabase/verification/0028_teach_foundation_verification.sql).
 */

const TENANT = "11111111-2222-4333-8444-555555555555";
const OTHER_TENANT = "99999999-2222-4333-8444-555555555555";
const U = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const GALLERY_DRAFT = `${TENANT}/teachGallery/item-g/${U(1)}/draft.webp`;
const AUDIO_DRAFT = `${TENANT}/teachAudioFile/item-a/${U(2)}/draft.mp3`;
const AUDIO_DRAFT_2 = `${TENANT}/teachAudioFile/item-a/${U(3)}/draft.mp3`;
const SETTINGS_DRAFT = `${TENANT}/teachAbout/profile/${U(4)}/draft.webp`;
const HERO_DRAFT = `${TENANT}/brand/hero/${U(5)}/draft.webp`;
const pub = (p: string) => p.replace("/draft.", "/published.");

let fake: ReturnType<typeof makeFakeSupabase>;
let userId: string | null;
let canPublish: boolean;
let rpcCalls: number;

function seed(productType = "teach") {
  fake.tables.tenants.push({ id: TENANT, product_type: productType, timezone: "UTC" });
  fake.tables.brand_configs.push({ tenant_id: TENANT, hero_image_ref: HERO_DRAFT });
  fake.tables.module_settings.push({
    tenant_id: TENANT,
    module_key: "teachAbout",
    data: { about: "hi", profile: { imageRef: SETTINGS_DRAFT } },
  });
  fake.tables.module_items.push(
    { id: "item-g", tenant_id: TENANT, module_key: "teachGallery", title: "G", image_ref: GALLERY_DRAFT, metadata: {} },
    { id: "item-a", tenant_id: TENANT, module_key: "teachAudio", title: "A", image_ref: null, metadata: { audioRef: AUDIO_DRAFT } }
  );
  for (const p of [GALLERY_DRAFT, AUDIO_DRAFT, AUDIO_DRAFT_2, SETTINGS_DRAFT, HERO_DRAFT]) fake.put(p, `bytes:${p}`);
}

function teachPayload(tenantId: string) {
  const settings = Object.fromEntries(
    fake.tables.module_settings.filter((r) => r.tenant_id === tenantId).map((r) => [r.module_key, r.data])
  );
  const items: Record<string, unknown[]> = {};
  for (const it of fake.tables.module_items.filter((r) => r.tenant_id === tenantId)) {
    (items[it.module_key as string] ??= []).push({ id: it.id, title: it.title, imageRef: it.image_ref, metadata: it.metadata });
  }
  const text = JSON.stringify({ settings, items }).replace(
    new RegExp(`("${tenantId}/[^"]*)/draft\\.([a-zA-Z0-9]+)"`, "g"),
    "$1/published.$2\""
  );
  return JSON.parse(text);
}

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/entitlements/availability", () => ({ deriveCommercialAvailability: () => ({ canPublish }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    storage: fake.supabase.storage,
    from: (t: string) => fake.supabase.from(t),
    rpc: async (name: string, args: { p_tenant_id: string }) => {
      rpcCalls += 1;
      const base = await fake.rpc(name, args);
      if (base.error) return base;
      const t = args.p_tenant_id;
      const row = fake.tables.published_spaces.find((r) => r.tenant_id === t)!;
      const m = row.modules as Record<string, unknown>;
      const isTeach = fake.tables.tenants.find((r) => r.id === t)?.product_type === "teach";
      row.modules = isTeach ? { brand: m.brand, moduleCovers: m.moduleCovers, teach: teachPayload(t) } : { brand: m.brand, moduleCovers: m.moduleCovers };
      return base;
    },
  }),
}));

const run = async () => (await import("./actions")).publishTeachSpace(TENANT);
const objects = () => [...fake.files.keys()].sort();
const snapshotRefs = () => collectMediaRefs(fake.tables.published_spaces.find((r) => r.tenant_id === TENANT)?.modules ?? null);

beforeEach(() => {
  fake = makeFakeSupabase();
  userId = "user-1";
  canPublish = true;
  rpcCalls = 0;
  seed();
});

describe("publishTeachSpace - success path", () => {
  it("copies image, audio, settings and brand drafts to published keys in the SAME uploadId folder, then commits one snapshot", async () => {
    const res = await run();
    expect(res.error).toBeNull();
    expect(res.publishedAt).toBeTruthy();
    for (const d of [GALLERY_DRAFT, AUDIO_DRAFT, SETTINGS_DRAFT, HERO_DRAFT]) {
      expect(fake.files.has(pub(d))).toBe(true);
      expect(fake.files.has(d)).toBe(true);
      expect(fake.files.get(pub(d))?.bytes).toBe(fake.files.get(d)?.bytes);
    }
    expect(fake.files.has(pub(AUDIO_DRAFT_2))).toBe(false);
    expect(rpcCalls).toBe(1);
  });

  it("the committed payload is a non-empty Teach payload whose media refs are exactly the published copies", async () => {
    await run();
    const snap = fake.tables.published_spaces.find((r) => r.tenant_id === TENANT)!.modules as { teach: { settings: unknown; items: Record<string, unknown[]> } };
    expect(Object.keys(snap.teach.items).sort()).toEqual(["teachAudio", "teachGallery"]);
    expect([...snapshotRefs()].sort()).toEqual([pub(AUDIO_DRAFT), pub(GALLERY_DRAFT), pub(HERO_DRAFT), pub(SETTINGS_DRAFT)].sort());
  });

  it("never writes with upsert:true and never uploads - versioned media only uses server-side copy", async () => {
    await run();
    expect(fake.storageApi.copy).toHaveBeenCalled();
    expect(fake.storageApi.upload.mock.calls.filter(([, , o]) => (o as { upsert?: boolean } | undefined)?.upsert === true)).toHaveLength(0);
    expect(fake.storageApi.upload).not.toHaveBeenCalled();
  });

  it("all media copies finish before the publish RPC", async () => {
    await run();
    const lastCopy = Math.max(...fake.storageApi.copy.mock.invocationCallOrder);
    expect(fake.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(lastCopy);
  });
});

describe("publishTeachSpace - immutability and retry", () => {
  it("an identical retry is idempotent: success again, published bytes untouched", async () => {
    await run();
    const before = objects();
    const bytes = fake.files.get(pub(AUDIO_DRAFT))?.bytes;
    const again = await run();
    expect(again.error).toBeNull();
    expect(objects()).toEqual(before);
    expect(fake.files.get(pub(AUDIO_DRAFT))?.bytes).toBe(bytes);
  });

  it("a destination collision with DIFFERENT content fails closed: no RPC, nothing overwritten", async () => {
    fake.put(pub(AUDIO_DRAFT), "someone-elses-bytes");
    const res = await run();
    expect(res.error).toMatch(/Could not publish your media/);
    expect(res.publishedAt).toBeNull();
    expect(rpcCalls).toBe(0);
    expect(fake.files.get(pub(AUDIO_DRAFT))?.bytes).toBe("someone-elses-bytes");
  });

  it("a media copy failure never reaches the RPC", async () => {
    fake.setFailure("copy", "storage down");
    const res = await run();
    expect(res.error).toMatch(/Could not publish your media/);
    expect(rpcCalls).toBe(0);
    expect(fake.tables.published_spaces).toHaveLength(0);
  });

  it("a settings ref pointing at ANOTHER tenant is never copied", async () => {
    const foreign = `${OTHER_TENANT}/teachAbout/profile/${U(6)}/draft.webp`;
    fake.put(foreign, "foreign");
    fake.tables.module_settings[0].data = { profile: { imageRef: foreign } };
    await run();
    expect(fake.files.has(pub(foreign))).toBe(false);
  });
});

describe("publishTeachSpace - audio replacement and stale cleanup", () => {
  const replaceAudio = () => {
    (fake.tables.module_items.find((r) => r.id === "item-a") as { metadata: unknown }).metadata = { audioRef: AUDIO_DRAFT_2 };
  };

  it("the old published audio is retained until a successful republish; then only the stale object is removed", async () => {
    await run();
    replaceAudio();
    expect(fake.files.has(pub(AUDIO_DRAFT))).toBe(true);
    expect(fake.files.has(pub(AUDIO_DRAFT_2))).toBe(false);

    const res = await run();
    expect(res.error).toBeNull();
    expect(fake.files.has(pub(AUDIO_DRAFT_2))).toBe(true);
    expect(fake.files.has(pub(AUDIO_DRAFT))).toBe(false);
    expect(fake.files.has(AUDIO_DRAFT)).toBe(true);
    expect(fake.files.has(AUDIO_DRAFT_2)).toBe(true);
    expect(snapshotRefs().has(pub(AUDIO_DRAFT_2))).toBe(true);
  });

  it("a failed republish (RPC error) keeps the previous snapshot AND its media; no cleanup runs", async () => {
    await run();
    replaceAudio();
    const snapshotBefore = JSON.stringify(fake.tables.published_spaces);
    fake.setFailure("rpc", "boom");
    fake.storageApi.remove.mockClear();
    const res = await run();
    expect(res.error).toBe("boom");
    expect(fake.storageApi.remove).not.toHaveBeenCalled();
    expect(fake.files.has(pub(AUDIO_DRAFT))).toBe(true);
    expect(JSON.stringify(fake.tables.published_spaces)).toBe(snapshotBefore);
  });

  it("a failed republish (media collision) leaves the live audio untouched", async () => {
    await run();
    replaceAudio();
    fake.put(pub(AUDIO_DRAFT_2), "collision");
    fake.storageApi.remove.mockClear();
    const res = await run();
    expect(res.error).toBeTruthy();
    expect(fake.storageApi.remove).not.toHaveBeenCalled();
    expect(fake.files.has(pub(AUDIO_DRAFT))).toBe(true);
  });

  it("a cleanup failure after a committed publish is logged, never surfaced as a failed publish", async () => {
    await run();
    replaceAudio();
    fake.setFailure("remove", "cannot remove");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await run();
    expect(res.error).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("publishTeachSpace - guards", () => {
  it("requires a signed-in user", async () => {
    userId = null;
    expect((await run()).error).toBe("You need to be logged in.");
    expect(rpcCalls).toBe(0);
  });

  it("missing tenant / no membership (RLS hides the row): Space not found, nothing touched", async () => {
    fake.tables.tenants.length = 0;
    const before = objects();
    expect((await run()).error).toBe("Space not found.");
    expect(objects()).toEqual(before);
    expect(rpcCalls).toBe(0);
  });

  it("a non-Teach Space (unsupported product for this action) is refused before any media work", async () => {
    fake.tables.tenants[0].product_type = "retreat";
    const before = objects();
    expect((await run()).error).toBe("Space not found.");
    expect(objects()).toEqual(before);
    expect(rpcCalls).toBe(0);
  });

  it("needs active access before publishing", async () => {
    canPublish = false;
    const before = objects();
    expect((await run()).error).toMatch(/needs active access/);
    expect(objects()).toEqual(before);
    expect(rpcCalls).toBe(0);
  });
});
