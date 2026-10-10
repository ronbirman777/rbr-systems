#!/usr/bin/env node
/**
 * TASK 032 (0046) - audio duration provenance backfill. STAGING ONLY (scripts/stagingGuard.mjs refuses any other
 * project, the Production ref and a non-service-role key before a client exists). Procedure and the Production
 * plan: docs/billing/AUDIO-DURATION-BACKFILL.md.
 *
 * From 0046 on, an enforced (paid, non-exempt) Space can publish an attached recording only when the server has
 * measured that exact file (public.billing_audio_verifications). Files attached earlier carry a length nobody on the
 * server measured. This script, for every attached audio file on every ENFORCED Space:
 *   - downloads the stored draft with the service role and measures it with the Studio's own parser
 *     (src/lib/media/audioDuration.ts) and fingerprints it (size + sha256),
 *   - compares an existing published sibling's bytes with the draft's,
 *   - reports: stored duration, re-measured duration, size, provenance status, verdict
 *     (ok / mismatch / unmeasurable / missing_object / published_mismatch).
 *
 * DEFAULT IS A DRY RUN: it reads only. With --apply (Staging only) it calls billing_audio_backfill_record() once per
 * not-yet-verified file, under one run id: the database stamps provenance only when the row's CURRENT ref and stored
 * length equal what was measured, and writes an audit row (billing_audio_backfill_findings) for every call. It never
 * deletes or uploads media, never writes module_items and never changes a duration; a mismatch is recorded with the
 * old value and stays unpublishable until the owner uploads the file again. Counts are asserted before and after.
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/audio-duration-backfill.mjs            # dry run
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/audio-duration-backfill.mjs --apply    # Staging only
 *   ... --tenant <uuid>   limit to one Space
 *
 * Needs Node >= 23.6 (imports the TypeScript parser directly). The key is read from the environment only and is
 * never printed.
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { assertStagingTarget } from "./stagingGuard.mjs";
import { applyPlan, classify, formatRow, makeRunId, parseArgs, parseDraftAudioRef, provenanceStatus, storedSeconds, summarize } from "./audioBackfillCore.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("usage: node scripts/audio-duration-backfill.mjs [--dry-run | --apply] [--tenant <uuid>]");
  process.exit(0);
}
const URL_ = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !SECRET) throw new Error("missing SUPABASE_URL / SUPABASE_SECRET_KEY");
// Fails CLOSED before any client is created: exact Staging URL + a service-role JWT whose ref is Staging.
assertStagingTarget({ url: URL_, serviceKey: SECRET });

const { deriveAudioDuration, toWholeSeconds } = await import("../src/lib/media/audioDuration.ts");
const admin = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const BUCKET = "tenant-media";
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function download(path) {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Every Space whose audio the database enforces right now (billing_audio_policy = 'enforced'). */
async function enforcedTenants() {
  let q = admin.from("space_subscriptions").select("tenant_id, status").neq("status", "exempt");
  if (args.tenant) q = q.eq("tenant_id", args.tenant);
  const subs = await must(q, "read space_subscriptions");
  const out = [];
  for (const s of subs) {
    const pol = await must(admin.rpc("billing_audio_policy", { p_tenant_id: s.tenant_id }), "billing_audio_policy");
    const mode = pol?.[0]?.mode;
    if (mode === "enforced") out.push(s.tenant_id);
    else if (mode === "unavailable") console.log(`NOTE  ${s.tenant_id}: audio policy unavailable (fails closed at publish) - not inspected`);
  }
  return out;
}

async function inspect() {
  const rows = [];
  for (const tenantId of await enforcedTenants()) {
    const items = await must(admin.from("module_items").select("id, module_key, metadata").eq("tenant_id", tenantId), "read module_items");
    const verifications = await must(
      admin.from("billing_audio_verifications").select("item_id, audio_ref, duration_seconds, size_bytes, sha256").eq("tenant_id", tenantId),
      "read billing_audio_verifications"
    );
    const byItem = new Map(verifications.map((v) => [v.item_id, v]));
    for (const it of items) {
      const ref = it.metadata?.audioRef;
      if (typeof ref !== "string") continue; // no attached file
      const parts = parseDraftAudioRef(ref);
      const refValid = !!parts && parts.tenantId === tenantId && parts.itemId === it.id;
      const draft = refValid ? await download(ref) : null;
      let measuredSeconds = null;
      if (draft && draft.byteLength > 0 && draft.byteLength <= MAX_AUDIO_BYTES) {
        const r = deriveAudioDuration(draft, parts.ext);
        measuredSeconds = r.ok ? toWholeSeconds(r.seconds) : null;
      }
      const draftSha256 = draft ? sha256(draft) : null;
      const published = refValid ? await download(parts.published) : null;
      const verdict = classify({
        refValid,
        storedDuration: storedSeconds(it.metadata),
        draftFound: !!draft,
        measuredSeconds,
        draftSha256,
        publishedFound: !!published,
        publishedSha256: published ? sha256(published) : null,
      });
      rows.push({
        tenantId, itemId: it.id, moduleKey: it.module_key, ref,
        storedDuration: it.metadata?.durationSeconds ?? null, measuredSeconds,
        sizeBytes: draft ? draft.byteLength : null, sha256: draftSha256,
        provenance: provenanceStatus(byItem.get(it.id), { ref, storedDuration: it.metadata?.durationSeconds ?? null, sha256: draftSha256 }),
        verdict,
      });
    }
  }
  return rows;
}

const rows = await inspect();
console.log(`mode=${args.apply ? "APPLY (Staging)" : "DRY RUN (read only)"}${args.tenant ? ` tenant=${args.tenant}` : ""}`);
for (const r of rows) console.log(formatRow(r));
const summary = summarize(rows);
console.log("summary", JSON.stringify(summary));

if (!args.apply) {
  console.log("dry run: nothing was written. Re-run with --apply (Staging only) after review.");
  process.exit(0);
}

// ----------------------------------------------------------------- APPLY (Staging only; guard already passed)
const runId = makeRunId(new Date(), randomBytes(4).toString("hex"));
const plan = applyPlan(rows);
// Count assertion BEFORE writing: re-inspect and require the same set of files (nothing changed under us).
const again = await inspect();
const key = (r) => `${r.itemId}|${r.ref}|${r.verdict}`;
if (again.length !== rows.length || again.map(key).sort().join() !== rows.map(key).sort().join()) {
  throw new Error("APPLY ABORTED: the set of audio files changed between the two inspections; nothing was written");
}
console.log(`apply run=${runId}: ${plan.calls} call(s), expecting ${plan.expectedStamps} stamp(s) and ${plan.flagged} flag(s)`);
const outcomes = { stamped: 0, already_verified: 0, flagged: 0, skipped_changed: 0 };
for (const r of rows) {
  if (r.provenance === "verified") continue;
  const outcome = await must(
    admin.rpc("billing_audio_backfill_record", {
      p_run_id: runId, p_tenant_id: r.tenantId, p_item_id: r.itemId, p_audio_ref: r.ref,
      p_measured_seconds: r.measuredSeconds, p_size_bytes: r.sizeBytes, p_sha256: r.sha256, p_verdict: r.verdict,
    }),
    `billing_audio_backfill_record(${r.itemId})`
  );
  outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
}
// Count assertions AFTER writing: exactly one audit row per call, exactly the stamps the database reported.
const { count: findings } = await admin.from("billing_audio_backfill_findings").select("*", { count: "exact", head: true }).eq("run_id", runId);
const { count: stamps } = await admin.from("billing_audio_verifications").select("*", { count: "exact", head: true }).eq("backfill_run", runId);
console.log("outcomes", JSON.stringify(outcomes), `audit rows=${findings} provenance rows=${stamps}`);
const problems = [];
if (findings !== plan.calls) problems.push(`expected ${plan.calls} audit rows for ${runId}, found ${findings}`);
if (stamps !== outcomes.stamped) problems.push(`database reported ${outcomes.stamped} stamps, ${stamps} provenance rows carry ${runId}`);
if (outcomes.stamped > plan.expectedStamps) problems.push(`more stamps (${outcomes.stamped}) than ok verdicts (${plan.expectedStamps})`);
if (problems.length) {
  console.log("COUNT ASSERTION FAILED (provenance rows are additive; review before re-running):\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(`done: run ${runId}. Media, durations and module_items were not modified.`);
