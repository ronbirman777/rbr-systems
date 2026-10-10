/**
 * TASK 032 (0046) - pure decision logic for scripts/audio-duration-backfill.mjs (no I/O, unit-tested in
 * audioBackfillCore.test.ts). The script downloads each stored audio object with the service role, measures it with
 * the Studio's own parser and fingerprints it; this module decides what that means.
 *
 * Verdicts (one per attached file on an enforced Space):
 *   ok                  the stored durationSeconds equals the server's whole-second measurement, and any existing
 *                       published sibling holds the same bytes as the draft
 *   mismatch            the stored length differs from the measurement (the old value is reported, never rewritten)
 *   unmeasurable        the object exists but its length cannot be determined (or the ref/extension is not audio)
 *   missing_object      the draft object is not in Storage
 *   published_mismatch  a published sibling exists whose bytes differ from the draft (what guests may hear is not
 *                       what would be stamped) - flagged, never stamped
 * Only "ok" is ever stamped as provenance; everything else needs a fresh upload by the owner.
 */

export const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "wav", "ogg"]);
export const VERDICTS = ["ok", "mismatch", "unmeasurable", "missing_object", "published_mismatch"];

/** `{tenant}/{module}/{item}/{uploadId}/draft.{ext}` -> parts, or null. */
export function parseDraftAudioRef(ref) {
  if (typeof ref !== "string") return null;
  const m = /^([0-9a-f-]{36})\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/draft\.([a-z0-9]+)$/.exec(ref);
  if (!m || !AUDIO_EXTENSIONS.has(m[5])) return null;
  return { tenantId: m[1], moduleKey: m[2], itemId: m[3], uploadId: m[4], ext: m[5], published: ref.replace(/\/draft\.([a-z0-9]+)$/, "/published.$1") };
}

/** The stored length as a whole number of seconds, or null when it is absent / not a whole non-negative number. */
export function storedSeconds(metadata) {
  const v = metadata?.durationSeconds;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * @param {{ storedDuration: unknown, draftFound: boolean, measuredSeconds: number | null,
 *           draftSha256: string | null, publishedFound: boolean, publishedSha256: string | null, refValid: boolean }} m
 */
export function classify(m) {
  if (!m.refValid) return "unmeasurable";
  if (!m.draftFound) return "missing_object";
  if (m.measuredSeconds === null || !m.draftSha256) return "unmeasurable";
  if (m.publishedFound && m.publishedSha256 !== m.draftSha256) return "published_mismatch";
  const stored = typeof m.storedDuration === "number" ? m.storedDuration : null;
  return stored !== null && stored === m.measuredSeconds ? "ok" : "mismatch";
}

/** Provenance status of one item before this run: verified (matches this file), stale (row for another file/length), none. */
export function provenanceStatus(verification, { ref, storedDuration, sha256 }) {
  if (!verification) return "none";
  const same = verification.audio_ref === ref && verification.duration_seconds === storedDuration && (!sha256 || verification.sha256 === sha256);
  return same ? "verified" : "stale";
}

export function parseArgs(argv) {
  const out = { apply: false, tenant: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--tenant") {
      const v = argv[++i];
      if (!v || !/^[0-9a-f-]{36}$/.test(v)) throw new Error("--tenant needs a Space (tenant) uuid");
      out.tenant = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/** Run id, e.g. "bf-20261010-1a2b3c4d" - matches the 0046 check ^[a-z0-9-]{6,64}$. */
export function makeRunId(now, randomHex) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  const id = `bf-${d}-${String(randomHex).toLowerCase()}`;
  if (!/^[a-z0-9-]{6,64}$/.test(id)) throw new Error("bad run id");
  return id;
}

/** Which rows an --apply run would stamp, and the count assertions it must satisfy afterwards. */
export function applyPlan(rows) {
  const actionable = rows.filter((r) => r.provenance !== "verified");
  return {
    calls: actionable.length,
    expectedStamps: actionable.filter((r) => r.verdict === "ok").length,
    flagged: actionable.filter((r) => r.verdict !== "ok").length,
  };
}

export function summarize(rows) {
  const by = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  for (const r of rows) by[r.verdict]++;
  return { total: rows.length, ...by, alreadyVerified: rows.filter((r) => r.provenance === "verified").length };
}

export function formatRow(r) {
  const cols = [
    r.tenantId, r.itemId, r.moduleKey,
    `stored=${r.storedDuration ?? "-"}`, `measured=${r.measuredSeconds ?? "-"}`, `size=${r.sizeBytes ?? "-"}`,
    `provenance=${r.provenance}`, `verdict=${r.verdict}`,
  ];
  return cols.join("  ");
}
