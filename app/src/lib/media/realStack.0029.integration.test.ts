import { randomUUID, createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageClient } from "@supabase/storage-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import sharp from "sharp";
import { collectMediaRefs } from "./path";

/**
 * REAL local stack integration (TASK 027.5 Phase 4B). Skipped unless a real
 * LOCAL Supabase Storage + PostgREST + Postgres with migrations 0001..0029
 * applied is configured. NEVER point this at a hosted project:
 *
 *   REAL_STACK_STORAGE_URL   e.g. http://127.0.0.1:55399   (storage-api)
 *   REAL_STACK_REST_URL      e.g. http://127.0.0.1:55398   (PostgREST)
 *   REAL_STACK_JWT_SECRET    the local stack's JWT secret (never committed)
 *
 * Seed first with supabase/verification/real-storage/seed.sql (3 users, one
 * Teach tenant for user 1, one Retreat tenant for user 2, complimentary
 * entitlements). Everything runs as real authenticated sessions, so Storage
 * RLS - including 0029's restrictive UPDATE policy - is genuinely enforced,
 * and the app's own server actions run unmodified (only the cookie-bound
 * client factory is swapped for one bound to these sessions).
 */
const STORAGE_URL = process.env.REAL_STACK_STORAGE_URL;
const REST_URL = process.env.REAL_STACK_REST_URL;
const SECRET = process.env.REAL_STACK_JWT_SECRET;
const ENABLED = Boolean(STORAGE_URL && REST_URL && SECRET);
const isLocal = (u?: string) => !u || /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(u);
if (ENABLED && !(isLocal(STORAGE_URL) && isLocal(REST_URL))) throw new Error("realStack integration refuses non-local URLs");

const U = (i: number) => `00000000-0000-4000-8000-00000000000${i}`;
const T = (i: number) => `00000000-0000-4000-9000-00000000000${i}`;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function mint(sub: string) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac("sha256", SECRET ?? "").update(`${h}.${p}`).digest("base64url")}`;
}
const storageFor = (i: number) => new StorageClient(STORAGE_URL!, { Authorization: `Bearer ${mint(U(i))}`, apikey: mint(U(i)) });
const restFor = (i: number) => new PostgrestClient(REST_URL!, { headers: { Authorization: `Bearer ${mint(U(i))}`, apikey: mint(U(i)) } });

const h = vi.hoisted(() => ({ make: null as null | (() => Promise<unknown>) }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.make!() }));

const writerCalls: string[] = [];
function sessionClient(i: number) {
  const rest = restFor(i);
  const sc = storageFor(i);
  return {
    auth: { getUser: async () => ({ data: { user: { id: U(i) } } }) },
    from: (t: string) => rest.from(t),
    rpc: (n: string, a: Record<string, unknown>) => rest.rpc(n, a),
    storage: {
      from: (bucket: string) => {
        const real = sc.from(bucket);
        return new Proxy(real, {
          get(target, prop, recv) {
            const v = Reflect.get(target, prop, recv);
            if (typeof v !== "function") return v;
            return (...args: unknown[]) => {
              if (prop === "update" || prop === "move") writerCalls.push(`${String(prop)}:${String(args[0])}`);
              if (prop === "upload" && (args[2] as { upsert?: boolean } | undefined)?.upsert) writerCalls.push(`upsert:${String(args[0])}`);
              return (v as (...a: unknown[]) => unknown).apply(target, args);
            };
          },
        });
      },
    },
  };
}

const E = (r: { error: { statusCode?: string; status?: number; message: string } | null }) =>
  r.error ? `${r.error.statusCode ?? r.error.status}:${r.error.message}` : null;
const blob = (s: string, type = "image/webp") => new Blob([Buffer.from(s)], { type });
const text = async (b: ReturnType<StorageClient["from"]>, p: string) => {
  const r = await b.download(p);
  return r.error ? null : await r.data.text();
};
const png = async (red: number) =>
  new File([new Uint8Array(await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: red, g: 10, b: 10 } } }).png().toBuffer())], "p.png", { type: "image/png" });
const fd = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const pub = (d: string) => d.replace("/draft.", "/published.");

// ---------------------------------------------------------------------------
describe.skipIf(!ENABLED)("0029 Storage policy - real authenticated sessions", () => {
  const a = () => storageFor(1).from("tenant-media");
  const x = () => storageFor(2).from("tenant-media");
  const created: string[] = [];
  afterAll(async () => {
    await a().remove(created);
  });
  const keep = (p: string) => (created.push(p), p);

  it("own tenant: versioned insert + create-only copy allowed; overwrite/update/move of versioned draft, published and Teach audio DENIED with bytes unchanged", async () => {
    const up = randomUUID();
    const d = keep(`${T(1)}/teachGallery/g1/${up}/draft.webp`);
    const p = keep(`${T(1)}/teachGallery/g1/${up}/published.webp`);
    const ad = keep(`${T(1)}/teachAudioFile/a1/${up}/draft.mp3`);
    const ap = keep(`${T(1)}/teachAudioFile/a1/${up}/published.mp3`);
    expect(E(await a().upload(d, blob("V1"), { contentType: "image/webp", upsert: false }))).toBeNull();
    expect(E(await a().copy(d, p))).toBeNull();
    expect(E(await a().upload(ad, blob("A1", "audio/mpeg"), { contentType: "audio/mpeg", upsert: false }))).toBeNull();
    expect(E(await a().copy(ad, ap))).toBeNull();

    for (const [path, type] of [[d, "image/webp"], [p, "image/webp"], [ad, "audio/mpeg"], [ap, "audio/mpeg"]] as const) {
      expect((await a().upload(path, blob("EVIL", type), { contentType: type, upsert: true })).error).not.toBeNull();
      expect((await a().update(path, blob("EVIL", type), { contentType: type })).error).not.toBeNull();
      expect((await a().move(path, `${T(1)}/teachGallery/g1/${up}/moved.webp`)).error).not.toBeNull();
    }
    expect(await text(a(), d)).toBe("V1");
    expect(await text(a(), p)).toBe("V1");
    expect(await text(a(), ad)).toBe("A1");
    expect(await text(a(), ap)).toBe("A1");
    // Create-only copy still reports 409 on an existing destination, never overwrites.
    expect(E(await a().copy(d, p))).toMatch(/^409/);
  });

  it("legacy stable path keeps its overwrite rights; legacy <-> versioned moves are denied both ways", async () => {
    const legacy = keep(`${T(1)}/teachGallery/g1/draft.webp`);
    expect(E(await a().upload(legacy, blob("L1"), { contentType: "image/webp", upsert: true }))).toBeNull();
    expect(E(await a().upload(legacy, blob("L2"), { contentType: "image/webp", upsert: true }))).toBeNull();
    expect(E(await a().update(legacy, blob("L3"), { contentType: "image/webp" }))).toBeNull();
    expect(await text(a(), legacy)).toBe("L3");
    const versioned = `${T(1)}/teachGallery/g1/${randomUUID()}/draft.webp`;
    expect((await a().move(legacy, versioned)).error).not.toBeNull();
    expect(await text(a(), legacy)).toBe("L3");
  });

  it("own tenant: delete of versioned draft/published and legacy is allowed", async () => {
    const up = randomUUID();
    const d = `${T(1)}/teachGallery/g2/${up}/draft.webp`;
    const p = pub(d);
    const legacy = `${T(1)}/teachGallery/g2/draft.webp`;
    await a().upload(d, blob("D"), { contentType: "image/webp", upsert: false });
    await a().copy(d, p);
    await a().upload(legacy, blob("L"), { contentType: "image/webp", upsert: true });
    const r = await a().remove([d, p, legacy]);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(3);
  });

  it("cross tenant: insert, overwrite, update, move, copy and delete all denied; read and sign denied; victim intact", async () => {
    const up = randomUUID();
    const cd = keep(`${T(1)}/teachGallery/g3/${up}/draft.webp`);
    const cp = pub(cd);
    const legacy = keep(`${T(1)}/teachGallery/g3/draft.webp`);
    await a().upload(cd, blob("MINE"), { contentType: "image/webp", upsert: false });
    await a().copy(cd, cp);
    await a().upload(legacy, blob("MINE-L"), { contentType: "image/webp", upsert: true });
    const foreignNew = `${T(1)}/teachGallery/g3/${randomUUID()}/draft.webp`;
    expect((await x().upload(foreignNew, blob("X"), { contentType: "image/webp", upsert: false })).error).not.toBeNull();
    expect((await x().upload(cd, blob("X"), { contentType: "image/webp", upsert: true })).error).not.toBeNull();
    expect((await x().upload(legacy, blob("X"), { contentType: "image/webp", upsert: true })).error).not.toBeNull();
    expect((await x().update(legacy, blob("X"), { contentType: "image/webp" })).error).not.toBeNull();
    expect((await x().move(cd, `${T(2)}/teachGallery/g3/${randomUUID()}/draft.webp`)).error).not.toBeNull();
    expect((await x().copy(cd, `${T(2)}/teachGallery/g3/${randomUUID()}/draft.webp`)).error).not.toBeNull();
    expect((await a().copy(cd, `${T(2)}/teachGallery/g3/${randomUUID()}/draft.webp`)).error).not.toBeNull();
    const del = await x().remove([cd, cp, legacy]);
    expect(del.data ?? []).toHaveLength(0);
    expect((await x().download(cd)).error).not.toBeNull();
    expect((await x().createSignedUrl(cd, 60)).error).not.toBeNull();
    expect(await text(a(), cd)).toBe("MINE");
    expect(await text(a(), cp)).toBe("MINE");
    expect(await text(a(), legacy)).toBe("MINE-L");
    expect((await a().createSignedUrl(cd, 60)).error).toBeNull();
    const own = `${T(2)}/teachGallery/g3/${randomUUID()}/draft.webp`;
    expect(E(await x().upload(own, blob("X2"), { contentType: "image/webp", upsert: false }))).toBeNull();
    await x().remove([own]);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(!ENABLED)("application publish flows under 0029 (zero Storage UPDATE dependency)", () => {
  type Actions = typeof import("@/app/configurator/retreat/actions");
  type TeachActions = typeof import("@/app/configurator/teach/actions");
  let retreat: Actions;
  let teach: TeachActions;
  const PREV = { error: null, imageRef: null, imageUrl: null } as never;
  const owned = (i: number) => storageFor(i).from("tenant-media");
  const snapshot = async (i: number, t: string) => {
    const r = await restFor(i).from("published_spaces").select("modules").eq("tenant_id", t).maybeSingle();
    return (r.data?.modules ?? null) as Record<string, unknown> | null;
  };
  const liveRefs = async (i: number, t: string) => [...collectMediaRefs(await snapshot(i, t))];
  const exists = async (i: number, p: string) => (await owned(i).exists(p)).data === true;
  const sweep = async (i: number, t: string) => {
    const root = owned(i);
    const walk = async (prefix: string): Promise<string[]> => {
      const { data } = await root.list(prefix, { limit: 1000 });
      const out: string[] = [];
      for (const e of data ?? []) {
        const path = `${prefix}/${e.name}`;
        if (e.id) out.push(path);
        else out.push(...(await walk(path)));
      }
      return out;
    };
    const all = await walk(t);
    if (all.length) await root.remove(all);
  };

  // Draft state + objects are reset around the run so leftovers from an
  // earlier (possibly aborted) run can never leak into these assertions.
  const reset = async (i: number, t: string) => {
    const rest = restFor(i);
    await rest.from("module_items").delete().eq("tenant_id", t);
    await rest.from("module_settings").delete().eq("tenant_id", t);
    await rest.from("brand_configs").update({ hero_image_ref: null, space_image_ref: null, logo_ref: null }).eq("tenant_id", t);
    await rest.from("module_configs").update({ image_ref: null }).eq("tenant_id", t);
    await sweep(i, t);
  };

  beforeAll(async () => {
    retreat = await import("@/app/configurator/retreat/actions");
    teach = await import("@/app/configurator/teach/actions");
    await reset(1, T(1));
    await reset(2, T(2));
    // Normalise both live snapshots to "no media" so exact-set assertions hold on a reused database.
    h.make = async () => sessionClient(2);
    await retreat.publishSpace({ error: null, publishedAt: null }, fd({ tenantId: T(2) }));
    h.make = async () => sessionClient(1);
    await teach.publishTeachSpace(T(1));
  });
  beforeEach(() => {
    writerCalls.length = 0;
  });
  afterAll(async () => {
    await reset(1, T(1));
    await reset(2, T(2));
  });

  it("RETREAT: upload, publish, republish unchanged, republish changed - all through real Storage RLS", async () => {
    h.make = async () => sessionClient(2);
    const t = T(2);
    const enable = await restFor(2).from("module_configs").upsert({ tenant_id: t, module_key: "meals", enabled: true }, { onConflict: "tenant_id,module_key" });
    expect(enable.error).toBeNull();
    const heroA = await retreat.uploadBrandImage(PREV, fd({ tenantId: t, kind: "hero", file: await png(200) }));
    expect(heroA.error).toBeNull();
    const itemId = randomUUID();
    const photoA = await retreat.uploadModuleItemPhoto(
      PREV,
      fd({ tenantId: t, moduleKey: "meals", itemId, previousRef: "", title: "Lunch", sortOrder: "0", file: await png(120) })
    );
    expect(photoA.error).toBeNull();
    const refs0 = [heroA.imageRef as string, photoA.imageRef as string];

    const publish = () => retreat.publishSpace({ error: null, publishedAt: null }, fd({ tenantId: t }));
    expect((await publish()).error).toBeNull();
    for (const d of refs0) {
      expect(await exists(2, pub(d))).toBe(true);
      const di = await owned(2).info(d);
      const pi = await owned(2).info(pub(d));
      expect(pi.data?.etag).toBe(di.data?.etag);
      expect(pi.data?.contentType).toBe(di.data?.contentType);
    }
    expect((await liveRefs(2, t)).sort()).toEqual(refs0.map(pub).sort());

    // Republish with unchanged media: idempotent, snapshot stable, nothing lost.
    expect((await publish()).error).toBeNull();
    expect((await liveRefs(2, t)).sort()).toEqual(refs0.map(pub).sort());
    for (const d of refs0) expect(await exists(2, pub(d))).toBe(true);

    // Republish with changed media: new draft (new uploadId), old published removed only after commit.
    const heroB = await retreat.uploadBrandImage(PREV, fd({ tenantId: t, kind: "hero", file: await png(30) }));
    expect(heroB.error).toBeNull();
    expect(heroB.imageRef).not.toBe(heroA.imageRef);
    expect(await exists(2, pub(heroA.imageRef as string))).toBe(true); // live until republish
    expect((await publish()).error).toBeNull();
    expect((await liveRefs(2, t)).sort()).toEqual([pub(heroB.imageRef as string), pub(photoA.imageRef as string)].sort());
    expect(await exists(2, pub(heroA.imageRef as string))).toBe(false);
    expect(await exists(2, pub(heroB.imageRef as string))).toBe(true);

    expect(writerCalls).toEqual([]);
  });

  it("TEACH: image upload, audio upload/replace/remove, settings-image removal, publish and republish under 0029; Guest parser reads the snapshot", async () => {
    h.make = async () => sessionClient(1);
    const t = T(1);
    const bucket = owned(1);
    expect((await teach.saveTeachModules(t, ["teachAudio"])).error).toBeNull();
    const { parsePublishedTeachSpace } = await import("@/lib/teach/guestData");

    // images: brand hero, gallery item, settings (About profile)
    const hero = (await retreat.uploadBrandImage(PREV, fd({ tenantId: t, kind: "hero", file: await png(180) }))).imageRef as string;
    const galleryId = randomUUID();
    const gallery = (
      await retreat.uploadModuleItemPhoto(
        PREV,
        fd({ tenantId: t, moduleKey: "teachGallery", itemId: galleryId, previousRef: "", title: "Shala", sortOrder: "0", file: await png(90) })
      )
    ).imageRef as string;
    expect(gallery).toBeTruthy();
    const settingsUp = await teach.uploadTeachSettingsImage(fd({ tenantId: t, settingsKey: "teachAbout", slot: "profile", file: await png(60) }));
    expect(settingsUp.error).toBeNull();
    const profile = settingsUp.imageRef as string;
    expect((await teach.saveTeachSettings(t, "teachAbout", { profile: { imageRef: profile, imagePosition: { x: 20, y: 30 } } })).error).toBeNull();

    // audio: prepare -> browser-style direct upload -> attach
    const audioId = randomUUID();
    const addAudio = async (bytes: string) => {
      const prep = await teach.prepareTeachAudioUpload(t, { id: audioId, title: "Nidra", metadata: {} }, 0, "audio/mpeg", bytes.length);
      expect(prep.error).toBeNull();
      const path = prep.path as string;
      const up = await bucket.upload(path, blob(bytes, "audio/mpeg"), { upsert: false, contentType: "audio/mpeg" });
      expect(up.error).toBeNull();
      expect((await teach.attachTeachAudio(t, audioId, path, 12)).error).toBeNull();
      return path;
    };
    const audio1 = await addAudio("AUDIO-ONE");

    const publish = () => teach.publishTeachSpace(t);
    expect((await publish()).error).toBeNull();
    for (const d of [hero, gallery, profile, audio1]) {
      expect(await exists(1, pub(d))).toBe(true);
      const [di, pi] = await Promise.all([bucket.info(d), bucket.info(pub(d))]);
      expect(pi.data?.etag).toBe(di.data?.etag);
      expect(pi.data?.contentType).toBe(di.data?.contentType);
    }
    const snap = await snapshot(1, t);
    expect(snap).toHaveProperty("teach");
    expect(snap).not.toHaveProperty("customPages");
    const live1 = [...collectMediaRefs(snap)].sort();
    expect(live1).toEqual([hero, gallery, profile, audio1].map(pub).sort());
    const guest = parsePublishedTeachSpace({ modules: snap } as never);
    expect(guest.settings.teachAbout.profile.imageRef).toBe(pub(profile));

    // republish unchanged
    expect((await publish()).error).toBeNull();
    expect([...collectMediaRefs(await snapshot(1, t))].sort()).toEqual(live1);

    // replace audio: replaced DRAFT goes at once, the live published copy only after republish
    const audio2 = await addAudio("AUDIO-TWO-LONGER");
    expect(await exists(1, audio1)).toBe(false);
    expect(await exists(1, pub(audio1))).toBe(true);
    expect((await publish()).error).toBeNull();
    expect(await exists(1, pub(audio2))).toBe(true);
    expect(await exists(1, pub(audio1))).toBe(false);
    expect(await text(bucket, pub(audio2))).toBe("AUDIO-TWO-LONGER");

    // remove audio draft: reference cleared first, then the draft; published waits for republish
    expect((await teach.detachTeachAudio(t, audioId)).error).toBeNull();
    expect(await exists(1, audio2)).toBe(false);
    expect(await exists(1, pub(audio2))).toBe(true);
    expect((await publish()).error).toBeNull();
    expect(await exists(1, pub(audio2))).toBe(false);

    // settings image removal: nothing is deleted until Save commits; then only the unreferenced draft
    expect(await exists(1, profile)).toBe(true);
    expect((await teach.saveTeachSettings(t, "teachAbout", { profile: { imageRef: null, imagePosition: null } })).error).toBeNull();
    expect(await exists(1, profile)).toBe(false);
    expect(await exists(1, pub(profile))).toBe(true); // live snapshot untouched
    expect((await publish()).error).toBeNull();
    expect(await exists(1, pub(profile))).toBe(false);
    expect([...collectMediaRefs(await snapshot(1, t))].sort()).toEqual([hero, gallery].map(pub).sort());

    // nothing in any normal flow needed a Storage UPDATE (policy would have denied it)
    expect(writerCalls).toEqual([]);
  });
});
