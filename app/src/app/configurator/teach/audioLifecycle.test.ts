import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Teach audio lifecycle (ownership at upload). Runs the real server actions
 * against a small in-memory fake of module_items + the tenant-media bucket,
 * so each scenario checks the end state of BOTH the rows and the stored
 * objects: no orphans, no row pointing at a deleted file, and published.*
 * copies untouched by draft edits.
 */

const TENANT = "11111111-2222-4333-8444-555555555555";
const ITEM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ITEM = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FOLDER = `${TENANT}/teachAudioFile/${ITEM}`;

type Row = Record<string, unknown> & { id: string; tenant_id: string; module_key: string };
let rows: Row[];
let objects: Set<string>;

function query(table: string) {
  const filters: [string, unknown][] = [];
  const inFilters: [string, unknown[]][] = [];
  let op: { kind: "select" } | { kind: "update"; patch: Record<string, unknown> } | { kind: "delete" } = { kind: "select" };
  const match = (r: Row) => filters.every(([k, v]) => r[k] === v) && inFilters.every(([k, vs]) => vs.includes(r[k]));
  const run = () => {
    if (table === "tenants") return { data: [{ product_type: "teach", timezone: "Asia/Jerusalem" }], error: null };
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
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
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

const storage = {
  from: () => ({
    list: async (folder: string) => ({
      data: [...objects].filter((p) => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes("/")).map((p) => ({ name: p.slice(folder.length + 1) })),
      error: null,
    }),
    remove: async (paths: string[]) => {
      for (const p of paths) objects.delete(p);
      return { error: null };
    },
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/entitlements/getSpaceEntitlement", () => ({ getSpaceEntitlement: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    storage,
    from: (table: string) => query(table),
  }),
}));

async function actions() {
  return import("./actions");
}

/** What the browser does between prepare and attach: put bytes at `path`. */
const browserUpload = (path: string) => objects.add(path);

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

async function uploadNew(mime = "audio/mpeg", item = audioItem()) {
  const a = await actions();
  const prep = await a.prepareTeachAudioUpload(TENANT, item, 0, mime);
  expect(prep.error).toBeNull();
  browserUpload(prep.path!);
  expect(await a.attachTeachAudio(TENANT, ITEM, prep.path!, 312.4)).toEqual({ error: null });
  return prep.path!;
}

describe("Teach audio lifecycle - ownership at upload", () => {
  beforeEach(() => {
    rows = [];
    objects = new Set();
  });

  it("upload for an unsaved item creates its row first, then attaches the file", async () => {
    const path = await uploadNew();
    expect(path).toBe(`${FOLDER}/draft.mp3`);
    expect(row()).toMatchObject({ tenant_id: TENANT, module_key: "teachAudio", title: "Evening body scan" });
    expect(rowMeta()).toMatchObject({ audioRef: path, durationSeconds: 312 });
  });

  it("upload -> save keeps one row and one object", async () => {
    const path = await uploadNew();
    const { saveTeachItems } = await actions();
    const saved = await saveTeachItems(TENANT, "teachAudio", [audioItem({ metadata: { audioRef: path, durationSeconds: 312, category: "Meditation" } })]);
    expect(saved.error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rowMeta()?.audioRef).toBe(path);
    expect([...objects]).toEqual([path]);
  });

  it("upload -> abandon (never saved) leaves no orphan: the file belongs to a real item row", async () => {
    const path = await uploadNew("audio/mpeg", audioItem({ title: "" }));
    // The teacher closes the tab here. Every stored object is still owned:
    for (const obj of objects) {
      const owner = rows.find((r) => obj.startsWith(`${TENANT}/teachAudioFile/${r.id}/`));
      expect(owner, `orphan object ${obj}`).toBeDefined();
    }
    expect(row()?.title).toBe("Untitled audio");
    expect(rowMeta()?.audioRef).toBe(path);
  });

  it("upload -> remove the unsaved item deletes the row and its files", async () => {
    await uploadNew();
    const { deleteTeachItem } = await actions();
    expect(await deleteTeachItem(TENANT, "teachAudio", ITEM)).toEqual({ error: null });
    expect(rows).toHaveLength(0);
    expect(objects.size).toBe(0);
  });

  it("upload -> remove file (detach) clears the ref before the draft object is deleted", async () => {
    await uploadNew();
    const { detachTeachAudio } = await actions();
    expect(await detachTeachAudio(TENANT, ITEM)).toEqual({ error: null });
    expect(rowMeta()).toMatchObject({ audioRef: null, durationSeconds: null });
    expect(objects.size).toBe(0);
  });

  it("replace audio with a different format: row points at the new file, old draft removed", async () => {
    const first = await uploadNew("audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/mp4");
    expect(prep.path).toBe(`${FOLDER}/draft.m4a`);
    // Until the new upload is attached, the saved row still has a valid file.
    expect(objects.has(first)).toBe(true);
    browserUpload(prep.path!);
    expect(await a.attachTeachAudio(TENANT, ITEM, prep.path!, 60)).toEqual({ error: null });
    expect(rowMeta()?.audioRef).toBe(prep.path);
    expect([...objects]).toEqual([prep.path]);
    expect(rows).toHaveLength(1);
  });

  it("a failed upload never detaches or deletes the current file", async () => {
    const first = await uploadNew("audio/mpeg");
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/wav");
    // Browser upload fails - nothing lands, attach is refused.
    expect((await a.attachTeachAudio(TENANT, ITEM, prep.path!, 10)).error).toMatch(/didn't finish/);
    expect(rowMeta()?.audioRef).toBe(first);
    expect(objects.has(first)).toBe(true);
  });

  it("draft edits never touch the published copy", async () => {
    const path = await uploadNew("audio/mpeg");
    const published = `${FOLDER}/published.mp3`;
    objects.add(published); // as copyDraftToPublished leaves it after a Publish
    const a = await actions();
    const prep = await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "audio/ogg");
    browserUpload(prep.path!);
    await a.attachTeachAudio(TENANT, ITEM, prep.path!, 5);
    expect(objects.has(published)).toBe(true);
    expect(objects.has(path)).toBe(false);
    await a.detachTeachAudio(TENANT, ITEM);
    expect([...objects]).toEqual([published]);
  });

  it("deleting a saved audio item removes its row and all of its files (same rule as Time to Flow items)", async () => {
    await uploadNew();
    objects.add(`${FOLDER}/published.mp3`);
    const { saveTeachItems } = await actions();
    expect((await saveTeachItems(TENANT, "teachAudio", [])).error).toBeNull();
    expect(rows).toHaveLength(0);
    expect(objects.size).toBe(0);
  });

  it("refuses refs outside the item's own draft slot and items of another kind", async () => {
    await uploadNew();
    const a = await actions();
    for (const bad of [`${TENANT}/teachAudioFile/${OTHER_ITEM}/draft.mp3`, `${FOLDER}/published.mp3`, `${FOLDER}/draft.exe`, `${FOLDER}/../x/draft.mp3`]) {
      expect((await a.attachTeachAudio(TENANT, ITEM, bad, 1)).error, bad).not.toBeNull();
    }
    rows.push({ id: OTHER_ITEM, tenant_id: TENANT, module_key: "teachReadings", metadata: {} });
    expect((await a.prepareTeachAudioUpload(TENANT, audioItem({ id: OTHER_ITEM }), 0, "audio/mpeg")).error).toBe("Missing item.");
    expect((await a.prepareTeachAudioUpload(TENANT, audioItem(), 0, "video/mp4")).error).toMatch(/MP3/);
  });
});
