/**
 * Hosted-apply scope enforcement for the TASK 027 legacy media migration.
 *
 * The infra recovery gate derives a per-tenant scope file from the verified
 * recovery snapshot. The CLI refuses to touch anything the scope does not
 * name: every pending plan entry must map to exactly one scope object (same
 * source key, role, size, sha and the deterministic destination), and every
 * scope object the live plan no longer contains must be PROVEN migrated
 * (destination bytes verified, and the DB draft ref / snapshot ref points at
 * the exact destination). A surviving legacy source is never proof.
 *
 * Self-contained on purpose (type-only imports + node:crypto): the CLI under
 * scripts/ runs this file directly under Node's type stripping, so it cannot
 * value-import legacyMigration.ts; the migration engine is injected instead.
 * Failure messages are short reason codes - never keys, paths or content.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantPlan, TenantResult } from "./legacyMigration";

const BUCKET = "tenant-media";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const DIGITS_RE = /^[0-9]{1,12}$/;
const ATTEMPT_RE = /^[0-9]{1,4}$/;
const ASSET_RE = /^a[0-9]{2,4}$/;
const SNAPSHOT_PREFIX_RE = /^migrations\/task-027\/20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\/([0-9]{1,12})-([0-9]{1,4})$/;

export const SCOPE_SCHEMA = "task-027-scope/1";
export const SCOPE_TASK_ID = "TASK-027";

export type ScopeRole = "draft" | "published";
export type ScopeObject = { role: ScopeRole; source_key: string; destination_key: string; size: number; sha256: string };
export type ScopeAsset = { asset: string; objects: ScopeObject[] };
export type Scope = {
  schema: string;
  task_id: string;
  approved_manifest_sha256: string;
  recovery_manifest_sha256: string;
  snapshot_prefix: string;
  snapshot_run_id: string;
  snapshot_attempt: string;
  snapshot_infra_commit_sha: string;
  gate_commit_sha: string;
  gate_run_id: string;
  gate_run_attempt: string;
  tenant_id: string;
  assets: ScopeAsset[];
};

export class ScopeViolation extends Error {
  code: string;
  phase: "pre-write" | "post-write";
  statuses: Record<string, number>;
  constructor(code: string, phase: "pre-write" | "post-write" = "pre-write", statuses: Record<string, number> = {}) {
    super(code);
    this.name = "ScopeViolation";
    this.code = code;
    this.phase = phase;
    this.statuses = statuses;
  }
}
const need = (cond: unknown, code: string): void => {
  if (!cond) throw new ScopeViolation(code);
};

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

/** Mirrors deterministicUploadId in legacyMigration.ts; a test pins the two together. */
export function scopeUploadId(tenantId: string, legacyPath: string, sha: string): string {
  const h = createHash("sha256").update(`${tenantId}|${legacyPath}|${sha}`).digest("hex");
  const variant = (8 + (parseInt(h[16], 16) % 4)).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type Legacy = { tenant: string; module: string; item: string; role: ScopeRole; ext: string; dir: string };
function parseLegacy(key: unknown): Legacy | null {
  if (typeof key !== "string") return null;
  const seg = key.split("/");
  if (seg.length !== 4 || seg.some((s) => s.length === 0 || s === "." || s === "..")) return null;
  const file = seg[3].match(/^(draft|published)\.([a-zA-Z0-9]+)$/);
  if (!file || !UUID_RE.test(seg[0])) return null;
  return { tenant: seg[0], module: seg[1], item: seg[2], role: file[1] as ScopeRole, ext: file[2], dir: seg.slice(0, 3).join("/") };
}

/** The one deterministic destination for an asset's object: anchored on the DRAFT source + sha. */
export function destinationFor(tenantId: string, draftSourceKey: string, draftSha: string, role: ScopeRole): string {
  const p = parseLegacy(draftSourceKey) as Legacy;
  return `${p.dir}/${scopeUploadId(tenantId, draftSourceKey, draftSha)}/${role}.${p.ext}`;
}

function exactKeys(o: unknown, keys: string[], code: string): Record<string, unknown> {
  need(o !== null && typeof o === "object" && !Array.isArray(o), code);
  const rec = o as Record<string, unknown>;
  const have = Object.keys(rec).sort();
  need(have.length === keys.length && [...keys].sort().every((k, i) => k === have[i]), code);
  return rec;
}

export type ScopeExpect = { scopeSha256: string; manifestSha256: string; tenantId: string; snapshotPrefix?: string };

/** Parses and independently validates a scope file. The sha256 is over the raw bytes. */
export function parseScope(raw: Buffer, expect: ScopeExpect): Scope {
  need(SHA_RE.test(expect.scopeSha256), "bad-expected-scope-sha256");
  need(SHA_RE.test(expect.manifestSha256), "bad-expected-manifest-sha256");
  need(UUID_RE.test(expect.tenantId.toLowerCase()), "bad-expected-tenant");
  need(sha256(raw) === expect.scopeSha256, "scope-sha256-mismatch");
  let doc: unknown;
  try {
    doc = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ScopeViolation("scope-malformed");
  }
  const s = exactKeys(
    doc,
    ["schema", "task_id", "approved_manifest_sha256", "recovery_manifest_sha256", "snapshot_prefix", "snapshot_run_id", "snapshot_attempt", "snapshot_infra_commit_sha", "gate_commit_sha", "gate_run_id", "gate_run_attempt", "tenant_id", "assets"],
    "scope-fields",
  ) as Record<keyof Scope, unknown>;
  need(s.schema === SCOPE_SCHEMA, "scope-schema");
  need(s.task_id === SCOPE_TASK_ID, "scope-task-id");
  need(typeof s.approved_manifest_sha256 === "string" && SHA_RE.test(s.approved_manifest_sha256), "scope-manifest-digest-format");
  need(s.approved_manifest_sha256 === expect.manifestSha256, "scope-wrong-manifest-digest");
  need(typeof s.recovery_manifest_sha256 === "string" && SHA_RE.test(s.recovery_manifest_sha256), "scope-recovery-digest-format");
  need(typeof s.snapshot_prefix === "string", "scope-snapshot-prefix");
  const m = (s.snapshot_prefix as string).match(SNAPSHOT_PREFIX_RE);
  need(m !== null, "scope-snapshot-prefix");
  need(typeof s.snapshot_run_id === "string" && DIGITS_RE.test(s.snapshot_run_id) && s.snapshot_run_id === (m as RegExpMatchArray)[3], "scope-snapshot-run");
  need(typeof s.snapshot_attempt === "string" && ATTEMPT_RE.test(s.snapshot_attempt) && s.snapshot_attempt === (m as RegExpMatchArray)[4], "scope-snapshot-attempt");
  if (expect.snapshotPrefix !== undefined) need(s.snapshot_prefix === expect.snapshotPrefix, "scope-wrong-snapshot");
  need(typeof s.snapshot_infra_commit_sha === "string" && COMMIT_RE.test(s.snapshot_infra_commit_sha), "scope-snapshot-commit");
  need(typeof s.gate_commit_sha === "string" && COMMIT_RE.test(s.gate_commit_sha), "scope-gate-commit");
  need(typeof s.gate_run_id === "string" && DIGITS_RE.test(s.gate_run_id), "scope-gate-run");
  need(typeof s.gate_run_attempt === "string" && ATTEMPT_RE.test(s.gate_run_attempt), "scope-gate-attempt");
  need(typeof s.tenant_id === "string" && UUID_RE.test(s.tenant_id), "scope-tenant-format");
  need(s.tenant_id === expect.tenantId.toLowerCase(), "scope-wrong-tenant");
  const tenant = s.tenant_id as string;

  need(Array.isArray(s.assets) && s.assets.length > 0, "scope-assets");
  const sources = new Set<string>();
  const dests = new Set<string>();
  const assetIds = new Set<string>();
  const assets: ScopeAsset[] = [];
  for (const rawAsset of s.assets as unknown[]) {
    const a = exactKeys(rawAsset, ["asset", "objects"], "scope-asset-fields");
    need(typeof a.asset === "string" && ASSET_RE.test(a.asset) && !assetIds.has(a.asset), "scope-asset-id");
    assetIds.add(a.asset as string);
    need(Array.isArray(a.objects) && a.objects.length >= 1 && a.objects.length <= 2, "scope-asset-objects");
    const objs: ScopeObject[] = [];
    for (const rawObj of a.objects as unknown[]) {
      const o = exactKeys(rawObj, ["role", "source_key", "destination_key", "size", "sha256"], "scope-object-fields");
      need(o.role === "draft" || o.role === "published", "scope-object-role");
      need(typeof o.sha256 === "string" && SHA_RE.test(o.sha256), "scope-object-sha");
      need(typeof o.size === "number" && Number.isSafeInteger(o.size) && o.size > 0, "scope-object-size");
      const src = parseLegacy(o.source_key);
      need(src !== null && src.tenant === tenant && src.role === o.role, "scope-unexpected-source-key");
      need(typeof o.destination_key === "string", "scope-object-destination");
      need(!sources.has(o.source_key as string) && !dests.has(o.destination_key as string), "scope-duplicate-record");
      sources.add(o.source_key as string);
      dests.add(o.destination_key as string);
      objs.push(o as unknown as ScopeObject);
    }
    const draft = objs.find((o) => o.role === "draft");
    need(draft !== undefined && new Set(objs.map((o) => o.role)).size === objs.length, "scope-asset-roles");
    const d = draft as ScopeObject;
    const dp = parseLegacy(d.source_key) as Legacy;
    for (const o of objs) {
      const p = parseLegacy(o.source_key) as Legacy;
      need(p.dir === dp.dir && p.ext === dp.ext && o.sha256 === d.sha256 && o.size === d.size, "scope-asset-pair-mismatch");
      need(o.destination_key === destinationFor(tenant, d.source_key, d.sha256, o.role), "scope-wrong-destination");
    }
    assets.push({ asset: a.asset as string, objects: objs });
  }
  return { ...(s as unknown as Scope), assets };
}

export function scopeObjects(scope: Scope): ScopeObject[] {
  return scope.assets.flatMap((a) => a.objects);
}

/**
 * Pre-write anti-widening. Every pending plan entry must map to exactly one
 * scope object; anything else throws before a single write. Scope objects the
 * plan no longer contains are returned as `absent` and must be proven done.
 */
export function planVsScope(plan: TenantPlan, scope: Scope): { pending: ScopeObject[]; absent: ScopeObject[] } {
  need(plan.tenantId.toLowerCase() === scope.tenant_id, "plan-wrong-tenant");
  const byKey = new Map<string, { obj: ScopeObject; asset: string }>();
  for (const a of scope.assets) for (const obj of a.objects) byKey.set(obj.source_key, { obj, asset: a.asset });
  const mapped = new Set<string>();
  for (const a of plan.assets) {
    need(a.outcome !== "conflict", "plan-conflict");
    let owner: string | undefined;
    const parts = [
      a.draft ? { role: "draft" as const, ...a.draft } : null,
      a.published ? { role: "published" as const, ...a.published } : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null);
    need(parts.length > 0, "plan-empty-asset");
    for (const part of parts) {
      const hit = byKey.get(part.old);
      need(hit !== undefined, "unexpected-asset");
      const { obj, asset } = hit as { obj: ScopeObject; asset: string };
      need(!mapped.has(part.old), "duplicate-plan-entry");
      need(obj.role === part.role, "role-mismatch");
      const src = parseLegacy(obj.source_key) as Legacy;
      need(src.module === a.moduleKey && src.item === a.itemId && src.ext === a.ext, "slot-mismatch");
      need(obj.size === part.size, "size-mismatch");
      need(obj.sha256 === part.sha, "sha-mismatch");
      need(obj.destination_key === part.new, "destination-mismatch");
      need(owner === undefined || owner === asset, "asset-mismatch");
      owner = asset;
      mapped.add(part.old);
    }
  }
  const all = scopeObjects(scope);
  return { pending: all.filter((o) => mapped.has(o.source_key)), absent: all.filter((o) => !mapped.has(o.source_key)) };
}

type Fetched = { size: number; sha: string };
function isNotFound(error: { message?: string; statusCode?: string | number; status?: number } | null): boolean {
  if (!error) return false;
  const code = String(error.statusCode ?? error.status ?? "");
  return /not.?found/i.test(error.message ?? "") || code === "404";
}
/** null only when the object genuinely does not exist; anything else throws. */
async function fetchObject(sb: SupabaseClient, path: string): Promise<Fetched | null> {
  const { data, error } = await sb.storage.from(BUCKET).download(path, undefined, { cache: "no-store" });
  if (error) {
    if (isNotFound(error as never)) return null;
    throw new Error("download failed");
  }
  if (!data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return { size: bytes.length, sha: sha256(bytes) };
}

type DraftRow = { table: "module_items" | "module_configs" | "brand_configs"; column: string; id?: string; moduleKey?: string; ref: string };
async function readDraftRows(sb: SupabaseClient, tenantId: string): Promise<DraftRow[]> {
  const out: DraftRow[] = [];
  const read = async (table: DraftRow["table"], cols: string[]) => {
    const { data, error } = await sb.from(table).select(cols.join(",")).eq("tenant_id", tenantId);
    if (error) throw new Error(`read ${table} failed`);
    return (data ?? []) as unknown as Record<string, unknown>[];
  };
  for (const r of await read("module_items", ["id", "module_key", "image_ref"])) {
    if (typeof r.image_ref === "string" && r.image_ref) out.push({ table: "module_items", column: "image_ref", id: String(r.id), moduleKey: String(r.module_key), ref: r.image_ref });
  }
  for (const r of await read("module_configs", ["module_key", "image_ref"])) {
    if (typeof r.image_ref === "string" && r.image_ref) out.push({ table: "module_configs", column: "image_ref", moduleKey: String(r.module_key), ref: r.image_ref });
  }
  for (const r of await read("brand_configs", ["hero_image_ref", "space_image_ref", "logo_ref"])) {
    for (const column of ["hero_image_ref", "space_image_ref", "logo_ref"]) {
      const v = r[column];
      if (typeof v === "string" && v) out.push({ table: "brand_configs", column, ref: v });
    }
  }
  return out;
}

const BRAND_COLUMN: Record<string, string> = { hero: "hero_image_ref", space: "space_image_ref", logo: "logo_ref" };
const COVER_ITEM = "_cover";

function draftSlotMatches(row: DraftRow, p: Legacy): boolean {
  if (p.item === COVER_ITEM) return row.table === "module_configs" && row.moduleKey === p.module;
  if (p.module === "brand") return row.table === "brand_configs" && row.column === BRAND_COLUMN[p.item];
  return row.table === "module_items" && row.moduleKey === p.module && row.id === p.item;
}

function collectRefs(node: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, into));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "imageRef" && typeof v === "string") into.add(v);
      else collectRefs(v, into);
    }
  }
  return into;
}

function snapshotSlotRefs(modules: unknown, p: Legacy): Set<string> {
  const m = modules && typeof modules === "object" ? (modules as Record<string, unknown>) : {};
  if (p.item === COVER_ITEM) return collectRefs((m.moduleCovers as Record<string, unknown> | undefined)?.[p.module]);
  if (p.module === "brand") return collectRefs(m.brand);
  return collectRefs(m[p.module]);
}

/**
 * Proves one scope object is in its exact deterministic migrated state:
 * destination bytes match the scope, and the DB draft ref (draft role) or the
 * published snapshot ref (published role) in the right slot points at the
 * destination and no longer at the source. Throws a reason code otherwise.
 */
export async function verifyObjectMigrated(sb: SupabaseClient, scope: Scope, obj: ScopeObject, phase: "pre-write" | "post-write" = "pre-write"): Promise<void> {
  const fail = (code: string) => {
    throw new ScopeViolation(code, phase);
  };
  const p = parseLegacy(obj.source_key) as Legacy;
  const copy = await fetchObject(sb, obj.destination_key);
  if (!copy) return fail("destination-missing");
  if (copy.size !== obj.size) fail("destination-size-mismatch");
  if (copy.sha !== obj.sha256) fail("destination-sha-mismatch");
  if (obj.role === "draft") {
    const rows = await readDraftRows(sb, scope.tenant_id);
    if (!rows.some((r) => r.ref === obj.destination_key && draftSlotMatches(r, p))) fail("draft-ref-not-at-destination");
    if (rows.some((r) => r.ref === obj.source_key)) fail("draft-ref-still-at-source");
  } else {
    const { data, error } = await sb.from("published_spaces").select("modules").eq("tenant_id", scope.tenant_id).maybeSingle();
    if (error) throw new Error("read published_spaces failed");
    if (!data) return fail("snapshot-missing");
    const refs = snapshotSlotRefs((data as { modules: unknown }).modules, p);
    if (!refs.has(obj.destination_key)) fail("snapshot-ref-not-at-destination");
    if (collectRefs((data as { modules: unknown }).modules).has(obj.source_key)) fail("snapshot-ref-still-at-source");
  }
}

export type Engine = {
  planTenant(sb: SupabaseClient, tenantId: string): Promise<TenantPlan>;
  applyTenantPlan(sb: SupabaseClient, plan: TenantPlan): Promise<TenantResult>;
  verifyTenantRefs(sb: SupabaseClient, tenantId: string): Promise<{ checked: number; missing: string[] }>;
};

export type ScopedReport = {
  mode: "dry-run" | "apply";
  scopeObjects: number;
  pendingObjects: number;
  alreadyDoneObjects: number;
  statuses: Record<string, number>;
  snapshotRefsRewritten: number;
  contentUpdatedAtRestored: boolean;
  knownUnresolved: number;
};

const OK_STATUS = new Set(["migrated", "already-done"]);

/**
 * Plans, validates against the scope, and (apply) executes ONE tenant. Throws
 * ScopeViolation for anything that is not full, strictly verified success:
 * pre-write violations touch nothing; post-write ones leave the (safe,
 * convergent) partial state for a rerun.
 */
export async function runScopedTenant(sb: SupabaseClient, scope: Scope, mode: "dry-run" | "apply", engine: Engine): Promise<ScopedReport> {
  const plan = await engine.planTenant(sb, scope.tenant_id);
  const { pending, absent } = planVsScope(plan, scope);
  for (const obj of absent) await verifyObjectMigrated(sb, scope, obj, "pre-write");
  const report: ScopedReport = {
    mode,
    scopeObjects: pending.length + absent.length,
    pendingObjects: pending.length,
    alreadyDoneObjects: absent.length,
    statuses: {},
    snapshotRefsRewritten: 0,
    contentUpdatedAtRestored: false,
    knownUnresolved: plan.skips.filter((s) => s.reason === "object-missing").length,
  };
  if (mode === "dry-run") return report;

  if (plan.assets.length > 0) {
    const result = await engine.applyTenantPlan(sb, plan);
    report.snapshotRefsRewritten = result.snapshotRefsRewritten;
    report.contentUpdatedAtRestored = result.contentUpdatedAtRestored;
    for (const a of result.assets) report.statuses[a.status] = (report.statuses[a.status] ?? 0) + 1;
    const bad = result.assets.find((a) => !OK_STATUS.has(a.status));
    if (bad) throw new ScopeViolation(bad.status, "post-write", report.statuses);
    if (result.errors.length > 0) throw new ScopeViolation("tenant-errors", "post-write", report.statuses);
    if (result.assets.length !== plan.assets.length) throw new ScopeViolation("result-incomplete", "post-write", report.statuses);
  }
  for (const obj of scopeObjects(scope)) await verifyObjectMigrated(sb, scope, obj, "post-write");
  const v = await engine.verifyTenantRefs(sb, scope.tenant_id);
  if (v.missing.length > report.knownUnresolved) throw new ScopeViolation("unresolved-refs", "post-write", report.statuses);
  return report;
}
