#!/usr/bin/env node
/**
 * Legacy media hardening (TASK 027): copy legacy single-path media into
 * immutable versioned folders and repoint DB + published-snapshot refs.
 *
 *   node --env-file=.env.local scripts/migrate-legacy-media.mjs                 dry run, all tenants
 *   node --env-file=.env.local scripts/migrate-legacy-media.mjs --tenant <id>   dry run, one tenant
 *   ... --apply                                                                 migrate (refuses if any conflict)
 *   ... --cleanup [--apply]                                                     list / remove migrated legacy objects
 *
 * Dry run is the default and is read-only. A non-local Supabase URL also
 * requires --allow-hosted for anything that writes. Output is aggregate
 * counts and short tenant prefixes only - never object names or content.
 */
import { createClient } from "@supabase/supabase-js";
import {
  applyTenantPlan,
  cleanupTenantLegacy,
  listTenantIds,
  planTenant,
  verifyTenantRefs,
} from "../src/lib/media/legacyMigration.ts";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const apply = flag("--apply");
const cleanup = flag("--cleanup");
const tenantArg = value("--tenant");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const local = /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
if (apply && !local && !flag("--allow-hosted")) {
  console.error("Refusing to write to a non-local Supabase without --allow-hosted.");
  process.exit(2);
}
if (tenantArg && !/^[0-9a-f-]{36}$/i.test(tenantArg)) throw new Error("--tenant must be a uuid");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const short = (id) => id.slice(0, 8);
const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const fmt = (m) => [...m].sort().map(([k, v]) => `${k}=${v}`).join(" ") || "-";

console.log(`mode: ${cleanup ? (apply ? "cleanup APPLY" : "cleanup dry-run") : apply ? "migrate APPLY" : "migrate dry-run"} | target: ${local ? "local" : "HOSTED"}`);
const tenants = tenantArg ? [tenantArg] : await listTenantIds(sb);
console.log(`tenants in scope: ${tenants.length}`);

if (cleanup) {
  let removed = 0, kept = new Map(), failed = 0;
  for (const t of tenants) {
    const r = await cleanupTenantLegacy(sb, t, { apply });
    removed += r.removed.length;
    failed += r.failed.length;
    for (const k of r.kept) bump(kept, k.reason);
    if (r.removed.length || r.failed.length) console.log(`  ${short(t)} ${apply ? "removed" : "removable"}=${r.removed.length} failed=${r.failed.length}`);
  }
  console.log(`${apply ? "removed" : "removable"}: ${removed} | failed: ${failed} | kept: ${fmt(kept)}`);
  process.exit(failed ? 1 : 0);
}

const plans = [];
for (const t of tenants) plans.push(await planTenant(sb, t));
const outcomes = new Map(), byModule = new Map(), skips = new Map(), shapes = new Map();
for (const p of plans) {
  for (const a of p.assets) {
    bump(outcomes, a.outcome);
    bump(byModule, a.moduleKey);
    bump(shapes, `${a.draft ? "draft" : ""}${a.draft && a.published ? "+" : ""}${a.published ? "published" : ""}`);
  }
  for (const s of p.skips) bump(skips, `${s.where}:${s.reason}`);
}
console.log(`assets to migrate: ${outcomes.get("migrate") ?? 0} | conflicts: ${outcomes.get("conflict") ?? 0}`);
console.log(`asset shapes: ${fmt(shapes)}`);
console.log(`by module: ${fmt(byModule)}`);
console.log(`skipped: ${fmt(skips)}`);
const conflicted = plans.filter((p) => p.assets.some((a) => a.outcome === "conflict"));
for (const p of conflicted) console.log(`  CONFLICT tenant ${short(p.tenantId)}: ${p.assets.filter((a) => a.outcome === "conflict").length} asset(s) with draft != published bytes`);

if (!apply) {
  console.log("dry run only - nothing written.");
  process.exit(conflicted.length ? 2 : 0);
}
if (conflicted.length) {
  console.error("Conflicts present: nothing was written. Resolve them (or scope with --tenant) and rerun.");
  process.exit(2);
}

const statuses = new Map();
let rewritten = 0, errors = 0, missing = 0;
for (const p of plans) {
  if (!p.assets.length) continue;
  const r = await applyTenantPlan(sb, p);
  rewritten += r.snapshotRefsRewritten;
  for (const a of r.assets) bump(statuses, a.status);
  errors += r.errors.length + r.assets.filter((a) => a.error).length;
  const v = await verifyTenantRefs(sb, p.tenantId);
  const knownBroken = p.skips.filter((s) => s.reason === "object-missing").length;
  missing += Math.max(0, v.missing.length - knownBroken);
  console.log(`  ${short(p.tenantId)} ${fmt(r.assets.reduce((m, a) => m.set(a.status, (m.get(a.status) ?? 0) + 1), new Map()))} snapshotRefs=${r.snapshotRefsRewritten} restoredContentUpdatedAt=${r.contentUpdatedAtRestored} unresolvedRefs=${v.missing.length} (known object-missing skips: ${knownBroken})`);
}
console.log(`result: ${statuses.size ? fmt(statuses) : "migrated=0 (nothing to do)"} | snapshot refs rewritten: ${rewritten} | errors: ${errors} | newly unresolved refs: ${missing}`);
process.exit(errors || missing ? 1 : 0);
