import { describe, expect, it, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { makeFakeSupabase, type FakeSupabase } from "@/lib/media/fakeSupabase.test-util";
import type { AudioQuotaPolicy } from "@/lib/billing/audioQuota";
import { isCanonicalStoredImage } from "@/lib/media/imageSignature";

/**
 * TASK 032 (0045) - no audio (or any non-image bytes) behind an image
 * reference. Runs the REAL Studio upload and publish actions with the REAL
 * sharp against the in-memory Supabase. The service-role client is a view of
 * the same fake whose Storage calls are recorded, so each test can tell WHICH
 * client wrote an object (on a paid Space it must be the service role, after
 * validation; on legacy/exempt Spaces the member session, as before).
 */

let fake: FakeSupabase;
let policy: AudioQuotaPolicy;
const adminCalls: string[] = [];

function adminView(f: FakeSupabase) {
  const storage = new Proxy(f.storageApi, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        adminCalls.push(`${String(prop)}:${String(args[0])}`);
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { ...(f.supabase as unknown as Record<string, unknown>), storage: { from: () => storage } };
}

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/entitlements/availability", () => ({ deriveCommercialAvailability: () => ({ canPublish: true }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.supabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminView(fake) }));
vi.mock("@/lib/billing/audioQuota.server", () => ({ loadAudioQuotaPolicy: async () => policy }));
vi.mock("@/lib/billing/audioFinalize.server", () => ({ deriveStoredAudioSeconds: async () => null, writeEnforcedAudioFile: async () => ({ ok: false, reason: "failed" }) }));

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const UP = "33333333-3333-4333-8333-333333333333";
const ENFORCED: AudioQuotaPolicy = { mode: "enforced", limits: { libraryMinutes: 240, maxRecordingMinutes: 60, listeningMinutesPerMonth: 100_000 } };
const LEGACY: AudioQuotaPolicy = { mode: "unenforced", reason: "legacy" };
const EXEMPT: AudioQuotaPolicy = { mode: "unenforced", reason: "exempt" };

const retreat = await import("./retreat/actions");
const teach = await import("./teach/actions");
const media = await import("@/lib/media/publish");

const realPng = () => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();
const realJpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 120, b: 40 } } }).jpeg().toBuffer();
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.alloc(64), Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><script>fetch("//x")</script></svg>');
const HTML = Buffer.from("<!doctype html><html><script>alert(1)</script></html>");

const file = (b: Buffer, name: string, type: string) => new File([new Uint8Array(b)], name, { type });
function fd(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const PREV = { error: null } as never;
const uploadItem = (f: File) =>
  retreat.uploadModuleItemPhoto(PREV, fd({ tenantId: T, moduleKey: "meals", itemId: "item-1", title: "Lunch", sortOrder: "0", file: f }));
const uploadBrand = (f: File) => retreat.uploadBrandImage(PREV, fd({ tenantId: T, kind: "hero", file: f }));
const uploadCover = (f: File) => retreat.uploadModuleCoverPhoto(PREV, fd({ tenantId: T, moduleKey: "meals", file: f }));
const publish = () => retreat.publishSpace({ error: null, publishedAt: null }, fd({ tenantId: T }));
const rawOf = (p: string) => fake.files.get(p)?.raw;
const tenantFiles = () => [...fake.files.keys()].sort();
const NOT_PROCESSED = "That image could not be processed. Try a different file.";

beforeEach(async () => {
  fake = makeFakeSupabase();
  policy = LEGACY;
  adminCalls.length = 0;
});

describe("upload content check (every Space): bytes decide, never the name or declared type", () => {
  for (const [label, p] of [["legacy", LEGACY], ["exempt", EXEMPT], ["paid", ENFORCED]] as const) {
    describe(label, () => {
      beforeEach(() => {
        policy = p;
      });

      it("audio bytes renamed photo.jpg (image/jpeg) are refused; nothing is stored and no row points anywhere", async () => {
        const r = await uploadItem(file(MP3, "photo.jpg", "image/jpeg"));
        expect(r).toEqual({ error: NOT_PROCESSED, imageRef: null, imageUrl: null });
        expect(tenantFiles()).toEqual([]);
        expect(fake.tables.module_items).toEqual([]);
      });

      it("SVG / HTML with script declared as image/png or image/webp are refused (never reach the decoder)", async () => {
        expect((await uploadBrand(file(SVG, "logo.png", "image/png"))).error).toBe(NOT_PROCESSED);
        expect((await uploadCover(file(HTML, "cover.webp", "image/webp"))).error).toBe(NOT_PROCESSED);
        expect(tenantFiles()).toEqual([]);
      });

      it("a truncated image is refused (header cut before the frame; header intact but data cut)", async () => {
        const jpeg = await realJpeg();
        expect((await uploadItem(file(jpeg.subarray(0, 20), "a.jpg", "image/jpeg"))).error).toBe(NOT_PROCESSED);
        const png = await realPng();
        expect((await uploadItem(file(png.subarray(0, 40), "a.png", "image/png"))).error).toBe(NOT_PROCESSED);
        expect(tenantFiles()).toEqual([]);
      });

      it("a real PNG declared as image/jpeg is accepted and stored re-encoded as a canonical WebP", async () => {
        const r = await uploadItem(file(await realPng(), "photo.jpg", "image/jpeg"));
        expect(r.error).toBeNull();
        expect(r.imageRef).toMatch(new RegExp(`^${T}/meals/item-1/[0-9a-f-]{36}/draft\\.webp$`));
        expect(isCanonicalStoredImage(rawOf(r.imageRef!)!)).toBe(true);
      });
    });
  }
});

describe("who writes the image object", () => {
  it("legacy / exempt: the member session writes it (unchanged); the service role is never used", async () => {
    for (const p of [LEGACY, EXEMPT]) {
      policy = p;
      const r = await uploadItem(file(await realPng(), "a.png", "image/png"));
      expect(r.error).toBeNull();
      expect(adminCalls).toEqual([]);
    }
  });

  it("paid: the service role writes the validated WebP (the member session never uploads an image)", async () => {
    policy = ENFORCED;
    const memberUploadsBefore = fake.storageApi.upload.mock.calls.length;
    const r = await uploadBrand(file(await realJpeg(), "hero.jpg", "image/jpeg"));
    expect(r.error).toBeNull();
    expect(adminCalls).toEqual([`upload:${r.imageRef}`]);
    expect(fake.storageApi.upload.mock.calls.length - memberUploadsBefore).toBe(1); // that one call is the admin view's
    expect(fake.tables.brand_configs[0]?.hero_image_ref).toBe(r.imageRef);
  });

  it("paid: a caller who is not a member of the tenant gets nothing written", async () => {
    policy = ENFORCED;
    fake.setRpcAnswer("is_tenant_member", false);
    const r = await uploadItem(file(await realPng(), "a.png", "image/png"));
    expect(r.error).toBe(NOT_PROCESSED);
    expect(tenantFiles()).toEqual([]);
    expect(adminCalls).toEqual([]);
  });

  it("paid but Studio suspended by billing: refused with the access message, nothing written", async () => {
    policy = ENFORCED;
    fake.setRpcAnswer("space_studio_writable", false);
    const r = await uploadItem(file(await realPng(), "a.png", "image/png"));
    expect(r.error).toBe("This Space needs active access before it can be published.");
    expect(tenantFiles()).toEqual([]);
  });

  it("billing policy unreadable: fails closed, nothing written", async () => {
    policy = { mode: "unavailable" };
    expect((await uploadItem(file(await realPng(), "a.png", "image/png"))).error).toBe(NOT_PROCESSED);
    expect(tenantFiles()).toEqual([]);
  });

  it("Teach settings image on a paid Space: audio bytes refused; a real image written by the service role", async () => {
    policy = ENFORCED;
    fake.tables.tenants.push({ id: T, product_type: "teach", timezone: "UTC" });
    const bad = await teach.uploadTeachSettingsImage(fd({ tenantId: T, settingsKey: "teachAbout", slot: "profile", file: file(MP3, "me.jpg", "image/jpeg") }));
    expect(bad.error).toBe(NOT_PROCESSED);
    const good = await teach.uploadTeachSettingsImage(fd({ tenantId: T, settingsKey: "teachAbout", slot: "profile", file: file(await realPng(), "me.png", "image/png") }));
    expect(good.error).toBeNull();
    expect(adminCalls).toEqual([`upload:${good.imageRef}`]);
    expect(isCanonicalStoredImage(rawOf(good.imageRef!)!)).toBe(true);
  });
});

describe("publish copy cannot launder bytes (paid Spaces: service-role copy + stored-byte validation)", () => {
  beforeEach(() => {
    policy = ENFORCED;
  });

  it("a validated draft is copied by the service role and the published copy re-checked", async () => {
    const r = await uploadItem(file(await realPng(), "a.png", "image/png"));
    adminCalls.length = 0;
    expect((await publish()).error).toBeNull();
    const pub = r.imageRef!.replace("/draft.", "/published.");
    expect(adminCalls).toContain(`copy:${r.imageRef}`);
    expect(adminCalls).toContain(`download:${pub}`);
    expect(isCanonicalStoredImage(rawOf(pub)!)).toBe(true);
    expect(fake.snapshotRefs(T)).toEqual([pub]);
  });

  it("audio bytes sitting at a draft.webp path (planted outside the Studio) fail the publish; copy and draft are deleted; no snapshot", async () => {
    const planted = `${T}/brand/hero/${UP}/draft.webp`;
    fake.putRaw(planted, new Uint8Array(MP3), "image/webp");
    fake.tables.brand_configs.push({ tenant_id: T, hero_image_ref: planted });
    const res = await publish();
    expect(res.error).toMatch(/not a valid image/);
    expect(fake.files.has(planted)).toBe(false);
    expect(fake.files.has(planted.replace("/draft.", "/published."))).toBe(false);
    expect(fake.rpc).not.toHaveBeenCalledWith("publish_space", expect.anything());
    expect(fake.tables.published_spaces).toEqual([]);
  });

  it("a real WebP with an MP3 appended (polyglot) is refused the same way", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } }).webp().toBuffer();
    const planted = `${T}/meals/item-9/${UP}/draft.webp`;
    fake.putRaw(planted, new Uint8Array(Buffer.concat([webp, MP3])), "image/webp");
    fake.tables.module_items.push({ id: "item-9", tenant_id: T, module_key: "meals", title: "x", image_ref: planted });
    expect((await publish()).error).toMatch(/not a valid image/);
    expect(fake.files.has(planted)).toBe(false);
  });

  it("an image ref that names an audio object, another tenant's file or a non-webp path is never copied by the service role", async () => {
    await expect(media.copyDraftToPublished(adminView(fake) as never, `${T}/audioFile/i/${UP}/draft.mp3`, { trustedTenantId: T })).rejects.toThrow(/not an image/);
    fake.putRaw(`${OTHER}/brand/hero/${UP}/draft.webp`, new Uint8Array([1]), "image/webp");
    await expect(media.copyDraftToPublished(adminView(fake) as never, `${OTHER}/brand/hero/${UP}/draft.webp`, { trustedTenantId: T })).rejects.toThrow(/not an image/);
    await expect(media.copyDraftToPublished(adminView(fake) as never, `${T}/brand/hero/${UP}/draft.svg`, { trustedTenantId: T })).rejects.toThrow(/not an image/);
    expect(adminCalls.filter((c) => c.startsWith("copy:"))).toEqual([]);
    await expect(media.copyDraftAudioToPublished(adminView(fake) as never, `${OTHER}/audioFile/i/${UP}/draft.mp3`, { trustedTenantId: T })).rejects.toThrow(/does not belong/);
  });

  it("a legacy-shaped (unversioned) draft is validated before the service-role re-upload", async () => {
    const legacy = `${T}/brand/hero/draft.webp`;
    fake.putRaw(legacy, new Uint8Array(MP3), "image/webp");
    await expect(media.copyDraftToPublished(adminView(fake) as never, legacy, { trustedTenantId: T })).rejects.toThrow(/not a valid image/);
    expect(fake.files.has(legacy)).toBe(false);
    expect(fake.files.has(`${T}/brand/hero/published.webp`)).toBe(false);
  });

  it("legacy Spaces keep the member-session copy with no content step (unchanged)", async () => {
    policy = LEGACY;
    const planted = `${T}/brand/hero/${UP}/draft.webp`;
    fake.putRaw(planted, new Uint8Array(MP3), "image/webp");
    fake.tables.brand_configs.push({ tenant_id: T, hero_image_ref: planted });
    expect((await publish()).error).toBeNull();
    expect(adminCalls).toEqual([]);
  });
});
