/**
 * One-shot hardening for pre-TASK-023 media: legacy single-path objects
 * (`{tenant}/{module}/{item}/draft.ext` and `.../published.ext`) are COPIED
 * into immutable versioned folders (`.../{uploadId}/draft.ext|published.ext`)
 * and every ref that pointed at the legacy key is repointed. Nothing is
 * deleted by migration; the legacy objects are only removed by the separate
 * cleanup step, once nothing references them and a byte-identical migrated
 * copy exists.
 *
 * Ordering is the safety model: (A) copy + verify every object, (B) CAS the
 * draft DB refs (`where col = old`), (C) one CAS of the published snapshot
 * (`where published_at = <read>`). A failure at any step leaves the old refs
 * and old objects valid; a half-committed asset is a valid mixed state and a
 * rerun converges. The upload folder id is derived from the content, so a
 * retry targets the same destination instead of leaving orphans.
 *
 * Self-contained on purpose (type-only imports + node:crypto): the CLI in
 * scripts/ runs this file directly under Node.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export const BUCKET = "tenant-media";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CLEANUP_MIN_AGE_MS = 10 * 60 * 1000;

const MIME: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export type PathShape = "legacy-draft" | "legacy-published" | "versioned-draft" | "versioned-published" | "other";
export type ParsedPath = {
  shape: PathShape;
  tenantId?: string;
  moduleKey?: string;
  itemId?: string;
  uploadId?: string;
  ext?: string;
};

export function parseMediaPath(path: string): ParsedPath {
  const seg = path.split("/");
  if (seg.some((s) => s.length === 0 || s === "." || s === "..")) return { shape: "other" };
  const file = seg[seg.length - 1].match(/^(draft|published)\.([a-zA-Z0-9]+)$/);
  if (!file || !UUID_RE.test(seg[0])) return { shape: "other" };
  if (seg.length === 4) {
    return { shape: file[1] === "draft" ? "legacy-draft" : "legacy-published", tenantId: seg[0], moduleKey: seg[1], itemId: seg[2], ext: file[2] };
  }
  if (seg.length === 5 && UUID_RE.test(seg[3])) {
    return {
      shape: file[1] === "draft" ? "versioned-draft" : "versioned-published",
      tenantId: seg[0],
      moduleKey: seg[1],
      itemId: seg[2],
      uploadId: seg[3],
      ext: file[2],
    };
  }
  return { shape: "other" };
}

/** Same key walk as collectImageRefs in path.ts. */
export function collectSnapshotRefs(modules: unknown): Set<string> {
  const refs = new Set<string>();
  (function walk(node: unknown) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "imageRef" && typeof v === "string") refs.add(v);
        else walk(v);
      }
    }
  })(modules);
  return refs;
}

/** Rewrites only string values under an `imageRef` key that exactly match a
 * map entry. Returns a new tree and how many refs changed. */
export function rewriteSnapshotRefs(modules: unknown, map: ReadonlyMap<string, string>): { modules: unknown; changed: number } {
  let changed = 0;
  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "imageRef" && typeof v === "string") {
          const next = map.get(v);
          if (next !== undefined) changed++;
          out[k] = next ?? v;
        } else out[k] = walk(v);
      }
      return out;
    }
    return node;
  }
  return { modules: walk(modules), changed };
}

/** A uuid-shaped folder id derived from the content, so reruns converge. */
export function deterministicUploadId(tenantId: string, legacyPath: string, sha: string): string {
  const h = createHash("sha256").update(`${tenantId}|${legacyPath}|${sha}`).digest("hex");
  const variant = (8 + (parseInt(h[16], 16) % 4)).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type DraftColumn = { table: "module_items" | "module_configs" | "brand_configs"; column: string };
const DRAFT_COLUMNS: DraftColumn[] = [
  { table: "module_items", column: "image_ref" },
  { table: "module_configs", column: "image_ref" },
  { table: "brand_configs", column: "hero_image_ref" },
  { table: "brand_configs", column: "space_image_ref" },
  { table: "brand_configs", column: "logo_ref" },
];
export const DRAFT_REF_COLUMNS = DRAFT_COLUMNS;

type DraftSlot = DraftColumn & { count: number };
type Blob_ = { sha: string; size: number };

type Sb = SupabaseClient;
type Skip = { ref: string; where: "draft" | "published"; reason: "already-versioned" | "foreign-or-unrecognised" | "object-missing" };
export type AssetPlan = {
  moduleKey: string;
  itemId: string;
  ext: string;
  uploadId: string;
  outcome: "migrate" | "conflict";
  draft?: { old: string; new: string; slots: DraftSlot[] } & Blob_;
  published?: { old: string; new: string } & Blob_;
  notes: string[];
};
export type TenantPlan = { tenantId: string; assets: AssetPlan[]; skips: Skip[]; snapshotPresent: boolean };

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

function isNotFound(error: { message?: string; statusCode?: string | number; status?: number } | null): boolean {
  if (!error) return false;
  const code = String(error.statusCode ?? error.status ?? "");
  return /not.?found/i.test(error.message ?? "") || code === "404";
}

/** Returns null only when the object genuinely does not exist; any other
 * failure throws so a transient error can never be read as "missing". */
async function fetchObject(sb: Sb, path: string): Promise<(Blob_ & { bytes: Buffer }) | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(path, undefined, { cache: "no-store" });
  if (error) {
    if (isNotFound(error as never)) return null;
    throw new Error(`download failed: ${error.message}`);
  }
  if (!data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, sha: sha256(bytes), size: bytes.length };
}

async function readDraftRefs(sb: Sb, tenantId: string): Promise<Map<string, DraftSlot[]>> {
  const byRef = new Map<string, Map<string, DraftSlot>>();
  const add = (ref: string, c: DraftColumn) => {
    const slots = byRef.get(ref) ?? new Map<string, DraftSlot>();
    const k = `${c.table}.${c.column}`;
    const cur = slots.get(k) ?? { ...c, count: 0 };
    cur.count++;
    slots.set(k, cur);
    byRef.set(ref, slots);
  };
  for (const table of ["module_items", "module_configs", "brand_configs"] as const) {
    const cols = DRAFT_COLUMNS.filter((c) => c.table === table);
    const { data, error } = await sb.from(table).select(cols.map((c) => c.column).join(",")).eq("tenant_id", tenantId);
    if (error) throw new Error(`read ${table} failed: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      for (const c of cols) {
        const v = row[c.column];
        if (typeof v === "string" && v.length > 0) add(v, c);
      }
    }
  }
  return new Map([...byRef].map(([ref, slots]) => [ref, [...slots.values()]]));
}

async function readSnapshot(sb: Sb, tenantId: string): Promise<{ modules: unknown; publishedAt: string } | null> {
  const { data, error } = await sb.from("published_spaces").select("modules, published_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`read published_spaces failed: ${error.message}`);
  return data ? { modules: data.modules, publishedAt: data.published_at as string } : null;
}

export async function planTenant(sb: Sb, tenantId: string): Promise<TenantPlan> {
  const drafts = await readDraftRefs(sb, tenantId);
  const snap = await readSnapshot(sb, tenantId);
  const snapRefs = snap ? collectSnapshotRefs(snap.modules) : new Set<string>();
  const skips: Skip[] = [];

  const legacyDrafts: string[] = [];
  for (const ref of drafts.keys()) {
    const p = parseMediaPath(ref);
    if (p.shape === "legacy-draft" && p.tenantId === tenantId) legacyDrafts.push(ref);
    else if (p.shape === "versioned-draft" && p.tenantId === tenantId) skips.push({ ref, where: "draft", reason: "already-versioned" });
    else skips.push({ ref, where: "draft", reason: "foreign-or-unrecognised" });
  }
  const legacyPublished = new Set<string>();
  for (const ref of snapRefs) {
    const p = parseMediaPath(ref);
    if (p.shape === "legacy-published" && p.tenantId === tenantId) legacyPublished.add(ref);
    else if (p.shape === "versioned-published" && p.tenantId === tenantId) skips.push({ ref, where: "published", reason: "already-versioned" });
    else skips.push({ ref, where: "published", reason: "foreign-or-unrecognised" });
  }

  const assets: AssetPlan[] = [];
  const pairedPublished = new Set<string>();
  const folderOf = (p: string) => p.slice(0, p.lastIndexOf("/"));

  const build = async (dOld: string | null, pOld: string | null): Promise<void> => {
    const anchor = (dOld ?? pOld) as string;
    const parsed = parseMediaPath(anchor);
    const moduleKey = parsed.moduleKey as string;
    const itemId = parsed.itemId as string;
    const ext = parsed.ext as string;
    const notes: string[] = [];
    const d = dOld ? await fetchObject(sb, dOld) : null;
    const p = pOld ? await fetchObject(sb, pOld) : null;
    if (dOld && !d) {
      skips.push({ ref: dOld, where: "draft", reason: "object-missing" });
      notes.push("draft object missing: draft ref left unchanged");
    }
    if (pOld && !p) {
      skips.push({ ref: pOld, where: "published", reason: "object-missing" });
      notes.push("published ref points at a missing object: snapshot ref left unchanged");
    }
    if (!d && !p) return;

    const sourceForId = d ? { path: dOld as string, sha: d.sha } : { path: pOld as string, sha: (p as Blob_).sha };
    let uploadId = deterministicUploadId(tenantId, sourceForId.path, sourceForId.sha);
    if (!d && p) {
      // Retry after a half-committed run: the draft ref is already versioned and
      // its published twin already holds these exact bytes - reuse that folder.
      for (const ref of drafts.keys()) {
        const dp = parseMediaPath(ref);
        if (dp.shape !== "versioned-draft" || dp.tenantId !== tenantId || dp.moduleKey !== moduleKey || dp.itemId !== itemId || dp.ext !== ext) continue;
        const twin = await fetchObject(sb, publishedOf(ref) as string);
        if (twin && twin.sha === p.sha) {
          uploadId = dp.uploadId as string;
          break;
        }
      }
    }
    const newFolder = `${folderOf(anchor)}/${uploadId}`;
    const asset: AssetPlan = { moduleKey, itemId, ext, uploadId, outcome: "migrate", notes };
    if (d) asset.draft = { old: dOld as string, new: `${newFolder}/draft.${ext}`, sha: d.sha, size: d.size, slots: drafts.get(dOld as string) ?? [] };
    if (p) asset.published = { old: pOld as string, new: `${newFolder}/published.${ext}`, sha: p.sha, size: p.size };
    if (d && p && d.sha !== p.sha) {
      asset.outcome = "conflict";
      notes.push("draft and published bytes differ: not migrated, needs a decision");
    }
    assets.push(asset);
  };

  for (const dOld of legacyDrafts) {
    const pOld = publishedOf(dOld);
    const paired = pOld !== null && legacyPublished.has(pOld);
    if (paired) pairedPublished.add(pOld as string);
    await build(dOld, paired ? pOld : null);
  }
  for (const pOld of legacyPublished) {
    if (!pairedPublished.has(pOld)) await build(null, pOld);
  }
  return { tenantId, assets, skips, snapshotPresent: snap !== null };
}

function publishedOf(draftPath: string): string | null {
  const m = draftPath.match(/^(.*)\/draft\.([a-zA-Z0-9]+)$/);
  return m ? `${m[1]}/published.${m[2]}` : null;
}

export type AssetStatus = "migrated" | "already-done" | "cas-lost" | "source-changed" | "failed" | "snapshot-failed" | "conflict";
export type AssetResult = { moduleKey: string; itemId: string; status: AssetStatus; error?: string };
export type TenantResult = {
  tenantId: string;
  assets: AssetResult[];
  snapshotRefsRewritten: number;
  contentUpdatedAtRestored: boolean;
  errors: string[];
};

async function copyVerified(sb: Sb, src: string, dst: string, expect: Blob_, ext: string): Promise<void> {
  const source = await fetchObject(sb, src);
  if (!source) throw new SourceChanged(`source disappeared`);
  if (source.sha !== expect.sha) throw new SourceChanged(`source bytes changed since planning`);
  const { error } = await sb.storage.from(BUCKET).upload(dst, source.bytes, { contentType: MIME[ext.toLowerCase()] ?? "application/octet-stream", upsert: false });
  if (error && !/already exists|duplicate|exists/i.test(error.message) && String((error as { statusCode?: string }).statusCode) !== "409") {
    throw new Error(`upload failed: ${error.message}`);
  }
  const copy = await fetchObject(sb, dst);
  if (!copy) throw new Error("copy not readable after upload");
  if (copy.sha !== expect.sha || copy.size !== expect.size) throw new Error("copy bytes differ from source");
}

class SourceChanged extends Error {}

async function casDraftRef(sb: Sb, tenantId: string, slot: DraftColumn, from: string, to: string): Promise<"updated" | "already" | "lost"> {
  const { data, error } = await sb.from(slot.table).update({ [slot.column]: to }).eq("tenant_id", tenantId).eq(slot.column, from).select(slot.column);
  if (error) throw new Error(`update ${slot.table}.${slot.column} failed: ${error.message}`);
  if ((data ?? []).length > 0) return "updated";
  const { data: now, error: e2 } = await sb.from(slot.table).select(slot.column).eq("tenant_id", tenantId).eq(slot.column, to);
  if (e2) throw new Error(`re-read ${slot.table}.${slot.column} failed: ${e2.message}`);
  return (now ?? []).length > 0 ? "already" : "lost";
}

async function rewriteSnapshot(sb: Sb, tenantId: string, map: ReadonlyMap<string, string>): Promise<number> {
  const snap = await readSnapshot(sb, tenantId);
  if (!snap) return 0;
  const { modules, changed } = rewriteSnapshotRefs(snap.modules, map);
  if (changed === 0) return 0;
  const { data, error } = await sb.from("published_spaces").update({ modules }).eq("tenant_id", tenantId).eq("published_at", snap.publishedAt).select("tenant_id");
  if (error) throw new Error(`snapshot update failed: ${error.message}`);
  if ((data ?? []).length === 0) throw new Error("snapshot changed concurrently (a Publish ran): left as is");
  return changed;
}

async function readContentUpdatedAt(sb: Sb, tenantId: string): Promise<string | null> {
  const { data, error } = await sb.from("tenants").select("content_updated_at").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`read tenants failed: ${error.message}`);
  return (data?.content_updated_at as string | undefined) ?? null;
}

/** Executes one tenant's plan. Never throws for per-asset problems; those
 * are returned in the result. Conflict assets are never touched. */
export async function applyTenantPlan(sb: Sb, plan: TenantPlan): Promise<TenantResult> {
  const result: TenantResult = { tenantId: plan.tenantId, assets: [], snapshotRefsRewritten: 0, contentUpdatedAtRestored: false, errors: [] };
  const work = plan.assets.filter((a) => a.outcome === "migrate");
  for (const a of plan.assets.filter((x) => x.outcome === "conflict")) result.assets.push({ moduleKey: a.moduleKey, itemId: a.itemId, status: "conflict" });
  if (work.length === 0) return result;

  const t0 = await readContentUpdatedAt(sb, plan.tenantId);
  let dbTouched = false;
  const snapshotMap = new Map<string, string>();
  const snapshotAssets: AssetResult[] = [];
  try {
    for (const a of work) {
      const res: AssetResult = { moduleKey: a.moduleKey, itemId: a.itemId, status: "migrated" };
      result.assets.push(res);
      try {
        if (a.draft) await copyVerified(sb, a.draft.old, a.draft.new, a.draft, a.ext);
        if (a.published) await copyVerified(sb, a.published.old, a.published.new, a.published, a.ext);
        let lost = false;
        let changedAny = false;
        for (const slot of a.draft?.slots ?? []) {
          const r = await casDraftRef(sb, plan.tenantId, slot, (a.draft as { old: string }).old, (a.draft as { new: string }).new);
          if (r === "updated") {
            dbTouched = true;
            changedAny = true;
          }
          if (r === "lost") {
            lost = true;
            break;
          }
        }
        if (lost) {
          res.status = "cas-lost";
          continue;
        }
        if (a.published) {
          snapshotMap.set(a.published.old, a.published.new);
          snapshotAssets.push(res);
        }
        if (!changedAny && !a.published) res.status = "already-done";
      } catch (e) {
        res.status = e instanceof SourceChanged ? "source-changed" : "failed";
        res.error = (e as Error).message;
      }
    }
    if (snapshotMap.size > 0) {
      try {
        result.snapshotRefsRewritten = await rewriteSnapshot(sb, plan.tenantId, snapshotMap);
      } catch (e) {
        for (const r of snapshotAssets) {
          r.status = "snapshot-failed";
          r.error = (e as Error).message;
        }
        result.errors.push((e as Error).message);
      }
    }
  } finally {
    if (dbTouched && t0) {
      const { data, error } = await sb.from("tenants").update({ content_updated_at: t0 }).eq("id", plan.tenantId).gt("content_updated_at", t0).select("id");
      if (error) result.errors.push(`could not restore content_updated_at: ${error.message}`);
      else result.contentUpdatedAtRestored = (data ?? []).length > 0;
    }
  }
  return result;
}

/** After a commit: every ref the DB and the snapshot now hold must resolve. */
export async function verifyTenantRefs(sb: Sb, tenantId: string): Promise<{ checked: number; missing: string[] }> {
  const drafts = await readDraftRefs(sb, tenantId);
  const snap = await readSnapshot(sb, tenantId);
  const refs = new Set<string>([...drafts.keys(), ...(snap ? collectSnapshotRefs(snap.modules) : [])]);
  const missing: string[] = [];
  for (const ref of refs) if (!(await fetchObject(sb, ref))) missing.push(ref);
  return { checked: refs.size, missing };
}

type Listed = { path: string; createdAt: number };
async function listAll(sb: Sb, prefix: string): Promise<Listed[]> {
  const out: Listed[] = [];
  const folders: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list failed: ${error.message}`);
    for (const e of data ?? []) {
      const full = `${prefix}/${e.name}`;
      if (e.id === null) folders.push(full);
      else {
        const stamp = Date.parse(e.created_at ?? e.updated_at ?? "");
        out.push({ path: full, createdAt: Number.isNaN(stamp) ? Date.now() : stamp });
      }
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  for (const f of folders) out.push(...(await listAll(sb, f)));
  return out;
}

export type CleanupReport = {
  tenantId: string;
  removed: string[];
  kept: { path: string; reason: "still-referenced" | "no-verified-copy" | "copy-too-recent" }[];
  failed: string[];
};

/** Removes legacy objects that nothing references AND that have a
 * byte-identical migrated copy in the same item folder. Dry run by default. */
export async function cleanupTenantLegacy(sb: Sb, tenantId: string, opts: { apply: boolean; minAgeMs?: number; now?: number }): Promise<CleanupReport> {
  const minAge = opts.minAgeMs ?? CLEANUP_MIN_AGE_MS;
  const now = opts.now ?? Date.now();
  const report: CleanupReport = { tenantId, removed: [], kept: [], failed: [] };
  const referenced = async () => {
    const drafts = await readDraftRefs(sb, tenantId);
    const snap = await readSnapshot(sb, tenantId);
    return new Set<string>([...drafts.keys(), ...(snap ? collectSnapshotRefs(snap.modules) : [])]);
  };
  const refs = await referenced();
  const objects = await listAll(sb, tenantId);
  const removable: string[] = [];
  for (const o of objects) {
    const p = parseMediaPath(o.path);
    if (p.shape !== "legacy-draft" && p.shape !== "legacy-published") continue;
    if (refs.has(o.path)) {
      report.kept.push({ path: o.path, reason: "still-referenced" });
      continue;
    }
    const folder = o.path.slice(0, o.path.lastIndexOf("/"));
    const base = o.path.slice(o.path.lastIndexOf("/") + 1);
    const legacy = await fetchObject(sb, o.path);
    if (!legacy) continue;
    const siblings = objects.filter((s) => {
      const sp = parseMediaPath(s.path);
      return (sp.shape === "versioned-draft" || sp.shape === "versioned-published") && s.path.startsWith(`${folder}/`) && s.path.endsWith(`/${base}`);
    });
    let verified = false;
    let tooRecent = false;
    for (const s of siblings) {
      const copy = await fetchObject(sb, s.path);
      if (copy && copy.sha === legacy.sha) {
        if (now - s.createdAt >= minAge) verified = true;
        else tooRecent = true;
      }
    }
    if (verified) removable.push(o.path);
    else report.kept.push({ path: o.path, reason: tooRecent ? "copy-too-recent" : "no-verified-copy" });
  }
  if (!opts.apply || removable.length === 0) {
    report.removed = opts.apply ? [] : removable;
    return report;
  }
  const still = await referenced();
  const safe = removable.filter((p) => !still.has(p));
  for (let i = 0; i < safe.length; i += 100) {
    const batch = safe.slice(i, i + 100);
    const { error } = await sb.storage.from(BUCKET).remove(batch);
    if (error) report.failed.push(...batch);
    else report.removed.push(...batch);
  }
  return report;
}

/** Plans every tenant that has any ref or snapshot. */
export async function listTenantIds(sb: Sb): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("tenants").select("id").order("id").range(from, from + 999);
    if (error) throw new Error(`list tenants failed: ${error.message}`);
    ids.push(...(data ?? []).map((r) => r.id as string));
    if ((data?.length ?? 0) < 1000) break;
  }
  return ids;
}
