import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "@/lib/media/fakeSupabase.test-util";
import { MAX_AUDIO_BYTES } from "@/lib/media/audio";
import { copyDraftAudioToPublished } from "@/lib/media/publish";
import { parseVersionedMediaPath } from "@/lib/media/path";
import { uploadAudioDraftObject } from "@/lib/media/audioUpload";

/**
 * Teach audio lifecycle on the versioned (uploadId) media model. Runs the
 * real server actions against a small in-memory module_items table plus the
 * shared fake tenant-media bucket (which models upsert:false, copy, info
 * and exists), so each scenario checks the end state of BOTH the rows and
 * the stored objects: no overwrite, no row pointing at a deleted object, no
 * published.* object touched by draft edits.
 */

const TENANT = "11111111-2222-4333-8444-555555555555";
const ITEM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ITEM = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FOLDER = `${TENANT}/teachAudioFile/${ITEM}`;
const UPLOAD_PATH = new RegExp(`^${FOLDER}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/draft\\.[a-z0-9]+$`);

type Row = Record<string, unknown> & { id: string; tenant_id: string; module_key: string };
let rows: Row[];
let fake: ReturnType<typeof makeFakeSupabase>;
let failRowUpdate: string | null;

function query(table: string) {
  const filters: [string, unknown][] = [];
  const inFilters: [string, unknown[]][] = [];
  let op: { kind: "select" } | { kind: "update"; patch: Record<string, unknown> } | { kind: "delete" } = { kind: "select" };
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && inFilters.every(([k, vs]) => vs.includes(r[k]));
  const run = () => {
    if (table === "tenants") return { data: [{ product_type: "teach", timezone: "Asia/Jerusalem" }], error: null };
    if (table !== "module_items") return { data: [], error: null };
    if (op.kind === "update" && failRowUpdate) return { data: null, error: { message: failRowUpdate } };
    const hit = rows.filter(match);
    if (op.kind === "update") for (const r of hit) Object.assign(r, (op as { patch: Record<string, unknown> }).patch);
    if (op.kind === "delete") rows = rows.filter((r) => !match(r));
    return { data: hit.map((r) => ({ ...r })), error: null };
  };
  const builder = {
    select: () => builder,
    update: (patch: Record<string, unknown>) => ((op = { kind: "update", patch }), builder),
    delete: () => ((op = { kind: "delete" }), builder),
    eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
    in: (k: string, vs: unknown[]) => (inFilters.push([k, vs]), builder),
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    insert: async (row: Row) => {
      if (rows.some((r) => r.id === row.id)) return { error: { message: "duplicate key" } };
      rows.push({ ...row });
      return { error: null };
    },
    upsert: async (list: Row[]) => {
      for (const row of list) {
        const i = rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows[i] = { ...rows[i], ...row };
        else rows.push({ ...row });
      }
      return { error: null };
    },
    then: (resolve: (v: unknown) => void) => resolve(run()),
  };
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/entitlements/availability", () => ({ deriveCommercialAvailability: () => ({ canPublish: true }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    storage: fake.supabase.storage,
    from: (table: string) => query(table),
    rpc: async () => ({ data: "2026-09-29T12:00:00Z", error: null }),
  }),
}));

async function actions() {
  return import("./actions");
}

/** What the browser does between prepare and attach: the real client upload helper (upsert:false). */
async function browserUpload(path: string, opts: { bytes?: string; type?: string } = {}) {
  const file = new Blob([opts.bytes ?? `bytes-of-${path}`], { type: opts.type ?? "audio/mpeg" });
  return uploadAudioDraftObject(fake.supabase, path, file);
}

const audioItem = (overrides: Record<string, unknown> = {}) => ({
  id: ITEM,
  title: "Evening body scan",
  subtitle: null,
  description: null,
  externalLink: null,
  metadata: { audioRef: null, durationSeconds: null, category: "Meditation" },
  ...overrides,
});
const row = () => rows.find((r) => r.id === ITEM);
const rowMeta = () => row()?.metadata as { audioRef: string | null; durationSeconds: number | null } | undefined;
const objects = () => [...fake.files.keys()].sort();

async function uploadNew(mime = "audio/mpeg", item = audioItem(), size = 1000) {
  const a = await actions();
  const prep = await a.prepareTeachAudioUpload(TENANT, item, 0, mime, size);
  expect(prep.error).toBeNull();
  expect((await browserUpload(prep.path!, { type: mime })).error).toBeNull();
  expect(await a.attachTeachAudio(TENANT, ITEM, prep.path!, 312.4)).toEqual({ error: null });
  return prep.path!;
}

beforeEach(() => {
  rows = [];
  failRowUpdate = null;
  fake = makeFakeSupabase();
});

describe("versioned audio upload path", () => {
  it("every upload gets its own uploadId folder under the item", async () => {
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    expect(prep.path).toMatch(UPLOAD_PATH);
    expect(parseVersionedMediaPath(prep.path!)).toMatchObject({ tenantId: TENANT, moduleKey: "teachAudioFile", itemId: ITEM, kind: "draft", ext: "mp3" });
  });

  it("two uploads for the same item never share a path", async () => {
    const a = await actions();
    const one = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    const two = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    expect(one.path).not.toBe(two.path);
  });

  it("the browser upload uses upsert:false and refuses to overwrite an existing object", async () => {
    const path = `${FOLDER}/11111111-1111-4111-8111-111111111111/draft.mp3`;
    expect((await browserUpload(path, { bytes: "first" })).error).toBeNull();
    expect(fake.storageApi.upload).toHaveBeenLastCalledWith(path, expect.anything(), { upsert: false, contentType: "audio/mpeg" });
    expect((await browserUpload(path, { bytes: "second" })).error).toMatch(/already exists/);
    expect(fake.files.get(path)?.bytes).toBe("first");
  });
});

describe("Teach audio lifecycle - upload, attach, replace, remove", () => {
  it("upload for an unsaved item creates its row first, then attaches the exact new draft ref", async () => {
    const path = await uploadNew();
    expect(row()).toMatchObject({ tenant_id: TENANT, module_key: "teachAudio", title: "Evening body scan" });
    expect(rowMeta()).toMatchObject({ audioRef: path, durationSeconds: 312 });
    expect(objects()).toEqual([path]);
  });

  it("upload -> save keeps one row and one object", async () => {
    const path = await uploadNew();
    const { saveTeachItems } = await actions();
    const saved = await saveTeachItems(TENANT, "teachAudio", [audioItem({ metadata: { audioRef: path, durationSeconds: 312, category: "Meditation" } })]);
    expect(saved.error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(objects()).toEqual([path]);
  });

  it("a failed browser upload leaves the saved ref and its file untouched", async () => {
    const first = await uploadNew("audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/wav", 1000);
    fake.setFailure("upload", "network down");
    expect((await browserUpload(prep.path!, { type: "audio/wav" })).error).toBe("network down");
    fake.setFailure("upload", null);
    expect((await a.attachTeachAudio(TENANT, ITEM, prep.path!, 10)).error).toMatch(/didn't finish/);
    expect(rowMeta()?.audioRef).toBe(first);
    expect(objects()).toEqual([first]);
  });

  it("a failed DB update keeps the prior audio and removes only the newly orphaned upload", async () => {
    const first = await uploadNew("audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    await browserUpload(prep.path!);
    const live = `${FOLDER}/99999999-9999-4999-8999-999999999999/published.mp3`;
    fake.put(live, "live", undefined, "audio/mpeg");
    failRowUpdate = "db unavailable";
    expect((await a.attachTeachAudio(TENANT, ITEM, prep.path!, 10)).error).toBe("db unavailable");
    failRowUpdate = null;
    expect(rowMeta()?.audioRef).toBe(first);
    expect(objects()).toEqual([first, live].sort());
  });

  it("replacing audio: DB switches to the new draft, then only the stale draft version is removed", async () => {
    const first = await uploadNew("audio/mpeg");
    const sibling = `${TENANT}/teachAudioFile/${OTHER_ITEM}/22222222-2222-4222-8222-222222222222/draft.mp3`;
    fake.put(sibling, "other-item", undefined, "audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mp4", 1000);
    // Until the new upload is attached, the saved row still has a valid file.
    expect(fake.files.has(first)).toBe(true);
    await browserUpload(prep.path!, { type: "audio/mp4" });
    expect(await a.attachTeachAudio(TENANT, ITEM, prep.path!, 60)).toEqual({ error: null });
    expect(rowMeta()?.audioRef).toBe(prep.path);
    expect(objects()).toEqual([prep.path!, sibling].sort());
  });

  it("published audio survives draft replacement and removal", async () => {
    const first = await uploadNew("audio/mpeg");
    const published = (await copyDraftAudioToPublished(fake.supabase, first))!;
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/ogg", 1000);
    await browserUpload(prep.path!, { type: "audio/ogg" });
    await a.attachTeachAudio(TENANT, ITEM, prep.path!, 5);
    expect(fake.files.has(first)).toBe(false);
    expect(fake.files.has(published)).toBe(true);
    await a.detachTeachAudio(TENANT, ITEM);
    expect(objects()).toEqual([published]);
    expect(fake.storageApi.remove.mock.calls.flat(2).filter((p: string) => p.includes("/published."))).toEqual([]);
  });

  it("removing draft audio clears the ref first and deletes only that draft", async () => {
    const path = await uploadNew();
    const keep = `${FOLDER}/33333333-3333-4333-8333-333333333333/draft.mp3`;
    fake.put(keep, "unrelated-unreferenced", undefined, "audio/mpeg");
    const { detachTeachAudio } = await actions();
    expect(await detachTeachAudio(TENANT, ITEM)).toEqual({ error: null });
    expect(rowMeta()).toMatchObject({ audioRef: null, durationSeconds: null });
    expect(fake.files.has(path)).toBe(false);
    expect(fake.files.has(keep)).toBe(true);
    expect(fake.storageApi.list).not.toHaveBeenCalled();
  });

  it("deleting an item removes its own draft but never its published copy or other items' files", async () => {
    const path = await uploadNew();
    const published = (await copyDraftAudioToPublished(fake.supabase, path))!;
    const sibling = `${TENANT}/teachAudioFile/${OTHER_ITEM}/22222222-2222-4222-8222-222222222222/draft.mp3`;
    fake.put(sibling, "other", undefined, "audio/mpeg");
    const { deleteTeachItem } = await actions();
    expect(await deleteTeachItem(TENANT, "teachAudio", ITEM)).toEqual({ error: null });
    expect(rows).toHaveLength(0);
    expect(objects()).toEqual([published, sibling].sort());
  });

  it("save refuses audio refs that are not this item's own versioned draft", async () => {
    await uploadNew();
    const { saveTeachItems } = await actions();
    const U = "44444444-4444-4444-8444-444444444444";
    for (const bad of [
      `${TENANT}/teachAudioFile/${OTHER_ITEM}/${U}/draft.mp3`,
      `${FOLDER}/${U}/published.mp3`,
      `${FOLDER}/draft.mp3`,
      `${FOLDER}/${U}/draft.exe`,
      `${FOLDER}/${U}/../x/draft.mp3`,
      `99999999-2222-4333-8444-555555555555/teachAudioFile/${ITEM}/${U}/draft.mp3`,
    ]) {
      const res = await saveTeachItems(TENANT, "teachAudio", [audioItem({ metadata: { audioRef: bad, durationSeconds: 1, category: "Meditation" } })]);
      expect(res.error, bad).not.toBeNull();
    }
  });
});

describe("Teach audio - server-side validation", () => {
  it.each([
    ["audio/mpeg", "mp3"],
    ["audio/mp3", "mp3"],
    ["audio/mp4", "m4a"],
    ["audio/x-m4a", "m4a"],
    ["audio/aac", "aac"],
    ["audio/wav", "wav"],
    ["audio/x-wav", "wav"],
    ["audio/wave", "wav"],
    ["audio/ogg", "ogg"],
  ])("prepare accepts %s as .%s", async (mime, ext) => {
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, mime, 5000);
    expect(prep.error).toBeNull();
    expect(prep.path).toMatch(new RegExp(`/draft\\.${ext}$`));
  });

  it("prepare rejects other types and other kinds of item, creating nothing", async () => {
    const a = await actions();
    for (const mime of ["video/mp4", "audio/flac", "application/octet-stream", "image/png", ""]) {
      expect((await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, mime, 1000)).error, mime).toMatch(/MP3/);
    }
    expect(rows).toHaveLength(0);
    rows.push({ id: OTHER_ITEM, tenant_id: TENANT, module_key: "teachReadings", metadata: {} });
    expect((await a.prepareTeachAudioUpload(TENANT, audioItem({ id: OTHER_ITEM }), 0, "audio/mpeg", 1000)).error).toBe("Missing item.");
  });

  it("prepare enforces the 100 MB cap server-side (and rejects empty/invalid sizes)", async () => {
    const a = await actions();
    expect((await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", MAX_AUDIO_BYTES)).error).toBeNull();
    for (const size of [MAX_AUDIO_BYTES + 1, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect((await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", size)).error, String(size)).toMatch(/100MB/);
    }
  });

  it("attach verifies the stored object: an oversized upload is rejected and only the new object is removed", async () => {
    const first = await uploadNew("audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    await browserUpload(prep.path!);
    fake.setReportedSize(prep.path!, MAX_AUDIO_BYTES + 1);
    expect((await a.attachTeachAudio(TENANT, ITEM, prep.path!, 10)).error).toMatch(/100MB/);
    expect(rowMeta()?.audioRef).toBe(first);
    expect(objects()).toEqual([first]);
  });

  it("attach rejects an object whose stored content type is not the audio type for its extension", async () => {
    const first = await uploadNew("audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    await browserUpload(prep.path!, { type: "application/octet-stream" });
    expect((await a.attachTeachAudio(TENANT, ITEM, prep.path!, 10)).error).toMatch(/MP3/);
    expect(rowMeta()?.audioRef).toBe(first);
    expect(objects()).toEqual([first]);
  });

  it("attach refuses to adopt an upload folder that already holds a published object", async () => {
    const a = await actions();
    const folder = `${FOLDER}/55555555-5555-4555-8555-555555555555`;
    fake.put(`${folder}/draft.mp3`, "new-draft", undefined, "audio/mpeg");
    fake.put(`${folder}/published.mp3`, "live", undefined, "audio/mpeg");
    await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    expect((await a.attachTeachAudio(TENANT, ITEM, `${folder}/draft.mp3`, 1)).error).toMatch(/wasn't valid/);
    expect(fake.files.get(`${folder}/published.mp3`)?.bytes).toBe("live");
  });

  it("attach refuses refs outside the item's own versioned draft slot", async () => {
    await uploadNew();
    const a = await actions();
    const U = "44444444-4444-4444-8444-444444444444";
    for (const bad of [
      `${TENANT}/teachAudioFile/${OTHER_ITEM}/${U}/draft.mp3`,
      `${FOLDER}/${U}/published.mp3`,
      `${FOLDER}/draft.mp3`,
      `${FOLDER}/${U}/draft.exe`,
      `${FOLDER}/${U}/../x/draft.mp3`,
    ]) {
      expect((await a.attachTeachAudio(TENANT, ITEM, bad, 1)).error, bad).toMatch(/wasn't valid/);
    }
  });
});

describe("published audio is immutable", () => {
  it("shares the draft's uploadId and is not overwritten by a later draft upload", async () => {
    const first = await uploadNew("audio/mpeg");
    const published = (await copyDraftAudioToPublished(fake.supabase, first))!;
    expect(published).toBe(first.replace("/draft.", "/published."));
    const liveBytes = fake.files.get(published)!.bytes;

    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mpeg", 1000);
    expect(prep.path!.split("/")[3]).not.toBe(first.split("/")[3]);
    await browserUpload(prep.path!, { bytes: "a different recording" });
    await a.attachTeachAudio(TENANT, ITEM, prep.path!, 1);
    expect(fake.files.get(published)?.bytes).toBe(liveBytes);
  });
});
