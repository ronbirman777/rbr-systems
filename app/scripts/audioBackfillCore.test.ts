import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "./audioBackfillCore.mjs";

/**
 * TASK 032 (0046): scripts/audio-duration-backfill.mjs. The decision logic is pure (audioBackfillCore.mjs) and is
 * tested here; the script itself is audited statically: Staging guard first, read-only by default, and no call that
 * could modify media, module_items or a duration.
 */

const T = "11111111-2222-4333-8444-555555555555";
const I = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const U = "33333333-3333-4333-8333-333333333333";
const REF = `${T}/teachAudioFile/${I}/${U}/draft.mp3`;
const base = { refValid: true, storedDuration: 120, draftFound: true, measuredSeconds: 120, draftSha256: "a".repeat(64), publishedFound: false, publishedSha256: null };

describe("classify", () => {
  it("ok only when the stored length equals the server measurement", () => {
    expect(core.classify(base)).toBe("ok");
    expect(core.classify({ ...base, storedDuration: 1 })).toBe("mismatch"); // browser claimed 1 s
    expect(core.classify({ ...base, storedDuration: null })).toBe("mismatch");
  });

  it("missing object, unmeasurable bytes and a non-audio/foreign ref are never ok", () => {
    expect(core.classify({ ...base, draftFound: false })).toBe("missing_object");
    expect(core.classify({ ...base, measuredSeconds: null })).toBe("unmeasurable");
    expect(core.classify({ ...base, refValid: false })).toBe("unmeasurable");
  });

  it("a published sibling with different bytes is flagged even when the draft matches", () => {
    expect(core.classify({ ...base, publishedFound: true, publishedSha256: "b".repeat(64) })).toBe("published_mismatch");
    expect(core.classify({ ...base, publishedFound: true, publishedSha256: "a".repeat(64) })).toBe("ok");
  });
});

describe("refs, stored values, provenance status", () => {
  it("parses only versioned draft AUDIO refs", () => {
    expect(core.parseDraftAudioRef(REF)).toMatchObject({ tenantId: T, itemId: I, ext: "mp3", published: REF.replace("/draft.mp3", "/published.mp3") });
    for (const bad of [`${T}/teachAudioFile/${I}/draft.mp3`, REF.replace("draft.mp3", "draft.webp"), REF.replace("draft", "published"), 42, null]) {
      expect(core.parseDraftAudioRef(bad)).toBeNull();
    }
  });

  it("stored length must be a whole non-negative number", () => {
    expect(core.storedSeconds({ durationSeconds: 61 })).toBe(61);
    for (const v of [61.5, -1, "61", null, undefined]) expect(core.storedSeconds({ durationSeconds: v })).toBeNull();
  });

  it("provenance: verified only for the same file, length and bytes", () => {
    const v = { audio_ref: REF, duration_seconds: 120, sha256: "a".repeat(64) };
    expect(core.provenanceStatus(null, { ref: REF, storedDuration: 120, sha256: "a".repeat(64) })).toBe("none");
    expect(core.provenanceStatus(v, { ref: REF, storedDuration: 120, sha256: "a".repeat(64) })).toBe("verified");
    expect(core.provenanceStatus(v, { ref: REF, storedDuration: 121, sha256: "a".repeat(64) })).toBe("stale");
    expect(core.provenanceStatus(v, { ref: REF, storedDuration: 120, sha256: "c".repeat(64) })).toBe("stale");
  });
});

describe("arguments, run id, plan", () => {
  it("dry run is the default; --apply must be explicit; unknown flags refused", () => {
    expect(core.parseArgs([])).toEqual({ apply: false, tenant: null, help: false });
    expect(core.parseArgs(["--apply", "--tenant", T])).toEqual({ apply: true, tenant: T, help: false });
    expect(() => core.parseArgs(["--force"])).toThrow(/unknown argument/);
    expect(() => core.parseArgs(["--tenant", "x"])).toThrow(/uuid/);
  });

  it("run ids satisfy the 0046 check", () => {
    const id = core.makeRunId(new Date("2026-10-10T08:00:00Z"), "1A2B3C4D");
    expect(id).toBe("bf-20261010-1a2b3c4d");
    expect(id).toMatch(/^[a-z0-9-]{6,64}$/);
  });

  it("apply plan skips already-verified files and expects stamps only for ok verdicts", () => {
    const rows = [
      { verdict: "ok", provenance: "none" },
      { verdict: "ok", provenance: "verified" },
      { verdict: "mismatch", provenance: "none" },
      { verdict: "missing_object", provenance: "stale" },
    ];
    expect(core.applyPlan(rows)).toEqual({ calls: 3, expectedStamps: 1, flagged: 2 });
    expect(core.summarize(rows)).toMatchObject({ total: 4, ok: 2, mismatch: 1, missing_object: 1, alreadyVerified: 1 });
  });
});

describe("audio-duration-backfill.mjs safety audit (static)", () => {
  const src = readFileSync(path.join(__dirname, "audio-duration-backfill.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("asserts the Staging target before any client exists", () => {
    const guard = code.indexOf("assertStagingTarget(");
    expect(guard).toBeGreaterThan(-1);
    expect(code.indexOf("createClient(")).toBeGreaterThan(guard);
    expect(code.slice(0, guard)).not.toMatch(/createClient\(/);
    expect(src.split("qzmsclkzbxrfohuxnitc").length - 1).toBe(0); // Production ref never named here
  });

  it("never modifies media, module_items or a duration: no upload/remove/move/copy/update/insert/delete/upsert calls", () => {
    // (createHash(...).update() is hashing, not a database write.)
    expect(code.replace(/createHash\("sha256"\)\.update\(/g, "")).not.toMatch(/\.(upload|remove|move|copy|update|insert|delete|upsert)\(/);
    // The only write is the 0046 recorder RPC, and only after the dry-run gate.
    const rpcWrites = [...code.matchAll(/rpc\("(\w+)"/g)].map((m) => m[1]).sort();
    expect(rpcWrites).toEqual(["billing_audio_backfill_record", "billing_audio_policy"]);
    expect(code.indexOf('rpc("billing_audio_backfill_record"')).toBeGreaterThan(code.indexOf("if (!args.apply)"));
  });

  it("asserts counts before (re-inspection) and after (audit rows, provenance rows) an apply run", () => {
    expect(code).toContain("APPLY ABORTED");
    expect(code).toMatch(/eq\("run_id", runId\)/);
    expect(code).toMatch(/eq\("backfill_run", runId\)/);
    expect(code).toContain("COUNT ASSERTION FAILED");
  });

  it("the key comes from the environment only and is never printed", () => {
    expect(code).toMatch(/process\.env\.SUPABASE_SECRET_KEY/);
    expect(code).not.toMatch(/console\.log\([^)]*SECRET/);
  });
});
