#!/usr/bin/env node
/**
 * TASK 032.5 Part F - NON-DESTRUCTIVE Backblaze B2 restore verification (owner-approved 2026-10-11).
 *
 * Reads the TASK 027 backup copy of Production `tenant-media` (B2 prefix supabase-storage/tenant-media/) with a
 * READ-ONLY application key and restores it into an ISOLATED local directory. It never writes, hides, deletes or
 * changes anything in B2, never touches the backup workflow, and never writes to Supabase.
 *
 * Credentials: a dedicated owner-created B2 application key, restricted to the backup bucket, with ONLY
 *   listBuckets, readBuckets, readBucketEncryption, readBucketRetentions, listFiles, readFiles
 * stored by the owner in a local file (never in chat, never in the repo):
 *   ~/.config/innerdwes/b2-restore-test.env   ->   B2_KEY_ID=...   B2_APP_KEY=...
 * Values are never printed. The script refuses to run if the key holds any write/delete capability.
 *
 * Usage:
 *   node restore-test.mjs --out <empty dir> [--limit N] [--source-manifest prod-objects.json]
 * prod-objects.json = read-only SELECT of storage.objects (name, size, mimetype, eTag) for bucket tenant-media.
 * Cost: list + download Class B/C transactions and egress for ~15 MB, within B2's daily free allowance
 * (2,500 Class B/day free; egress free up to 3x stored). --limit keeps a sample run smaller still.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg("--out"), LIMIT = Number(arg("--limit", "0")), SRC = arg("--source-manifest");
const PREFIX = "supabase-storage/tenant-media/";
if (!OUT) throw new Error("--out <empty dir> required");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("REFUSING: --out must be an empty/new directory (isolated restore target)");
mkdirSync(OUT, { recursive: true });

const envFile = process.env.B2_ENV_FILE ?? join(homedir(), ".config/innerdwes/b2-restore-test.env");
const env = Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => /^\s*[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.B2_KEY_ID || !env.B2_APP_KEY) throw new Error(`B2_KEY_ID / B2_APP_KEY missing in ${envFile}`);

const report = { startedAt: new Date().toISOString(), checks: [], notes: [] };
const check = (id, name, ok, detail = "") => { report.checks.push({ id, name, ok: ok === null ? null : !!ok, detail }); console.log(`${ok === null ? "INFO" : ok ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? "  -> " + detail : ""}`); };

// 1. authorize (read-only key enforced)
const auth = await (await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", { headers: { Authorization: "Basic " + Buffer.from(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`).toString("base64") } })).json();
if (!auth.authorizationToken) throw new Error(`authorize failed: ${auth.code ?? "unknown"}`);
const api = auth.apiInfo.storageApi;
const caps = api.capabilities ?? [];
const WRITE_CAPS = caps.filter((c) => /^(write|delete|share)/i.test(c) || /Keys$/.test(c));
if (WRITE_CAPS.length) throw new Error(`REFUSING: key holds write/delete capabilities (${WRITE_CAPS.join(",")}). Create a read-only key.`);
check("F11a", "restore key is read-only", true, caps.join(","));
const allowedBucket = api.allowed?.buckets?.[0] ?? (api.bucketId ? { id: api.bucketId, name: api.bucketName } : null);
if (!allowedBucket?.id) throw new Error("key must be restricted to exactly the backup bucket");
const call = async (op, body) => { const r = await fetch(`${api.apiUrl}/b2api/v3/${op}`, { method: "POST", headers: { Authorization: auth.authorizationToken }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(`${op}: ${j.code} ${j.message}`); return j; };

// 2. bucket security posture (F11 privacy, F12 encryption, retention / lifecycle / lock)
const { buckets } = await call("b2_list_buckets", { accountId: auth.accountId, bucketId: allowedBucket.id });
const b = buckets[0] ?? {};
check("F11", "backup bucket is private (allPrivate)", b.bucketType === "allPrivate", `bucketType=${b.bucketType}`);
const sse = b.defaultServerSideEncryption;
check("F12", "default server-side encryption enabled", sse?.isClientAuthorizedToRead === false ? null : sse?.value?.mode === "SSE-B2" || sse?.value?.mode === "SSE-C", sse?.isClientAuthorizedToRead === false ? "key cannot read encryption settings (add readBucketEncryption)" : `mode=${sse?.value?.mode ?? "none"}`);
check("F-RET", "lifecycle rules (version retention)", null, JSON.stringify(b.lifecycleRules ?? []));
check("F-LOCK", "Object Lock (immutability)", null, `fileLockEnabled=${b.fileLockConfiguration?.value?.isFileLockEnabled ?? "unknown"}`);

// 3. discovery: current versions + hidden/old versions under the media prefix
const files = []; let next = null;
do { const j = await call("b2_list_file_names", { bucketId: b.bucketId, prefix: PREFIX, maxFileCount: 1000, startFileName: next }); files.push(...j.files.filter((f) => f.action === "upload")); next = j.nextFileName; } while (next);
const versions = []; let nn = null, ni = null;
do { const j = await call("b2_list_file_versions", { bucketId: b.bucketId, prefix: PREFIX, maxFileCount: 1000, startFileName: nn, startFileId: ni }); versions.push(...j.files); nn = j.nextFileName; ni = j.nextFileId; } while (nn);
const hidden = versions.filter((v) => v.action === "hide").length, older = versions.length - files.length - hidden;
check("F1", "backup objects discovered under supabase-storage/tenant-media/", files.length > 0, `${files.length} current, ${hidden} hide markers, ${older} older versions`);
const newest = files.reduce((m, f) => Math.max(m, f.uploadTimestamp), 0);
const ageH = ((Date.now() - newest) / 3600000).toFixed(1);
check("F13", "backup age (newest object upload)", null, `${new Date(newest).toISOString()} (${ageH} h ago; rclone --update only re-uploads changed objects)`);

// 4. restore (download) into the isolated directory, verify B2's own SHA1 end to end
const pick = LIMIT > 0 ? sampleStratified(files, LIMIT) : files;
const manifest = [];
for (const f of pick) {
  const url = `${auth.apiInfo.storageApi.downloadUrl}/file/${encodeURIComponent(b.bucketName)}/${f.fileName.split("/").map(encodeURIComponent).join("/")}`;
  const r = await fetch(url, { headers: { Authorization: auth.authorizationToken } });
  if (!r.ok) { manifest.push({ name: f.fileName, ok: false, status: r.status }); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  const rel = f.fileName.slice(PREFIX.length);
  const dest = join(OUT, rel); mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, buf);
  const sha1 = createHash("sha1").update(buf).digest("hex");
  const b2sha1 = f.contentSha1 && f.contentSha1 !== "none" ? f.contentSha1.replace(/^unverified:/, "") : (f.fileInfo?.large_file_sha1 ?? null);
  manifest.push({ name: rel, size: buf.length, b2Size: f.contentLength, contentType: f.contentType, md5: createHash("md5").update(buf).digest("hex"), sha256: createHash("sha256").update(buf).digest("hex"), sha1, b2sha1, sha1Match: b2sha1 ? b2sha1 === sha1 : null, mtime: f.fileInfo?.src_last_modified_millis ?? null });
}
const dl = manifest.filter((m) => m.size != null);
check("F3", "download/restore to isolated destination", dl.length === pick.length, `${dl.length}/${pick.length} restored into ${OUT}`);
check("F4", "object count (restored vs discovered)", LIMIT > 0 ? null : dl.length === files.length, `${dl.length} of ${files.length}${LIMIT > 0 ? " (sample)" : ""}`);
const sizeOk = dl.every((m) => m.size === m.b2Size), shaKnown = dl.filter((m) => m.sha1Match !== null);
check("F5", "byte-for-byte: size and B2-recorded SHA1 match the restored bytes", sizeOk && shaKnown.every((m) => m.sha1Match), `size ok ${sizeOk}; sha1 verified ${shaKnown.filter((m) => m.sha1Match).length}/${shaKnown.length} (rest have no stored SHA1)`);

// 5. compare against the SOURCE (read-only Production storage.objects manifest): md5 == Supabase eTag
if (SRC) {
  const src = new Map(JSON.parse(readFileSync(SRC, "utf8")).map((o) => [o.name, o]));
  let md5Match = 0, md5Known = 0, missingInBackup = 0; const mism = [];
  for (const m of dl) { const s = src.get(m.name); if (!s) continue; const et = String(s.eTag ?? "").replace(/"/g, ""); if (/^[0-9a-f]{32}$/.test(et)) { md5Known++; if (et === m.md5) md5Match++; else mism.push(m.name); } }
  for (const name of src.keys()) if (!dl.some((m) => m.name === name) && LIMIT === 0) missingInBackup++;
  check("F6", "restored MD5 equals Production Storage eTag (source evidence)", md5Known > 0 && md5Match === md5Known, `${md5Match}/${md5Known} match${mism.length ? "; mismatch: " + mism.slice(0, 3).join(",") : ""}`);
  check("F4b", "every Production object present in the backup", LIMIT > 0 ? null : missingInBackup === 0, `${missingInBackup} missing (Production ${src.size} vs backup ${files.length})`);
  const tenants = new Set([...src.keys()].map((n) => n.split("/")[0]));
  const orphanTenant = dl.filter((m) => !tenants.has(m.name.split("/")[0])).length;
  check("F10", "tenant/object mapping: every restored object maps to a tenant prefix present in Production", orphanTenant === 0, `${orphanTenant} restored objects under a prefix with no live Production objects`);
  check("F9", "file metadata: content type recorded in B2 matches Production mimetype", dl.every((m) => !src.get(m.name) || !src.get(m.name).mimetype || src.get(m.name).mimetype === m.contentType), "");
}

// 6. readability (macOS built-ins, no dependencies): afinfo for audio, sips for images
const audio = dl.filter((m) => /\.(mp3|m4a|aac|wav|ogg)$/.test(m.name)), images = dl.filter((m) => /\.(webp|png|jpe?g)$/.test(m.name));
const readable = (cmd, args) => { try { execFileSync(cmd, args, { stdio: "pipe" }); return true; } catch { return false; } };
const aOk = audio.filter((m) => readable("afinfo", [join(OUT, m.name)]));
check("F7", "audio files decode (afinfo)", audio.length ? aOk.length === audio.length : null, `${aOk.length}/${audio.length}`);
const iOk = images.filter((m) => m.size === 0 || readable("sips", ["-g", "pixelWidth", join(OUT, m.name)]));
check("F8", "images decode (sips)", images.length ? iOk.length === images.length : null, `${iOk.length}/${images.length}`);

report.finishedAt = new Date().toISOString();
report.manifest = manifest.map(({ name, size, sha256, md5, sha1Match }) => ({ name, size, sha256, md5, sha1Match }));
writeFileSync(join(OUT, "..", `restore-report-${Date.now()}.json`), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => c.ok === false).length;
console.log(`\n${report.checks.filter((c) => c.ok).length} pass, ${failed} fail, ${report.checks.filter((c) => c.ok === null).length} info`);
process.exit(failed ? 1 : 0);

function sampleStratified(list, n) {
  const audioF = list.filter((f) => /\.(mp3|m4a|aac|wav|ogg)$/.test(f.fileName)), rest = list.filter((f) => !audioF.includes(f));
  const out = [...audioF]; for (let i = 0; out.length < n && i < rest.length; i += Math.max(1, Math.floor(rest.length / n))) out.push(rest[i]);
  return out;
}
