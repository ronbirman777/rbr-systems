#!/usr/bin/env node
/**
 * TASK 032.5 POC - HOSTED matrix against the deployed Worker innerdwes-media-poc (workers.dev) and the ONE synthetic
 * object seeded by `scripts/seed.mjs --only=a60m4a`. Every row is evidence from Cloudflare, not from workerd.
 * Rows that need fixtures the owner did not approve for upload (second tenant object, draft object, WAV, .html, second
 * key id) are reported as LOCAL-ONLY instead of being faked.
 *
 *   POC_AUDIO=<dir with marker-60min.m4a> POC_OUT=<scratch dir> node test/poc-hosted.mjs
 * Reads (never prints): ~/.config/innerdwes/{poc-keys.json,poc-fixtures.json,cf-staging.env}.
 * Side effects (all inside the POC resources): KV epoch:<synthetic tenant> rows, KV lt:<hash> rows (24 h TTL),
 * Queue messages, Analytics Engine data points, R2 reads. ~100 MB of R2 egress (free) in total.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const BASE = "https://innerdwes-media-poc.ronbirman7.workers.dev";
const cfg = join(homedir(), ".config/innerdwes");
const { KEYS, ADMIN } = JSON.parse(readFileSync(join(cfg, "poc-keys.json"), "utf8"));
const FX = JSON.parse(readFileSync(join(cfg, "poc-fixtures.json"), "utf8"));
const cred = Object.fromEntries(readFileSync(join(cfg, "cf-staging.env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const ACC = `https://api.cloudflare.com/client/v4/accounts/${cred.CLOUDFLARE_ACCOUNT_ID}`;
const cf = (p, init = {}) => fetch(ACC + p, { ...init, headers: { Authorization: `Bearer ${cred.CLOUDFLARE_API_TOKEN}`, ...(init.headers || {}) } });
const KV_ID = "9755718a140b42d09506168cee66508f";
const AUDIO = join(process.env.POC_AUDIO ?? ".", "marker-60min.m4a");
const OUT = process.env.POC_OUT ?? ".";
const LOCAL = readFileSync(AUDIO), SIZE = LOCAL.length, SHA = createHash("sha256").update(LOCAL).digest("hex");
const K = FX.objects.a60m4a, TA = FX.TA, TB = FX.TB;
if (!K) throw new Error("a60m4a not seeded");

const results = [];
const check = (id, name, ok, detail = "") => { results.push({ id, name, ok: ok === null ? null : !!ok, detail }); console.log(`${ok === null ? "LOCAL-ONLY" : ok ? "PASS" : "FAIL"}  ${id}  ${name}${detail ? "  [" + detail + "]" : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (b) => Buffer.from(b).toString("base64url");
const KID = Object.keys(KEYS)[0];
const sign = (p, kid = KID, keys = KEYS) => { const h = `v1.${kid}.${b64(JSON.stringify(p))}`; return `${h}.${createHmac("sha256", Buffer.from(keys[kid], "base64url")).update(h).digest("base64url")}`; };
const now = () => Math.floor(Date.now() / 1000);
const mint = (o = {}) => { const n = o.n ?? randomBytes(12).toString("hex"); return { n, tk: sign({ t: o.t ?? TA, k: o.k ?? K, kd: o.kd ?? "pub", ia: o.ia ?? now(), x: o.x ?? now() + 600, ep: o.ep ?? now(), n, ...(o.s ? { s: o.s } : {}) }) }; };
const tok = (o) => mint(o).tk;
const url = (k, tk) => `${BASE}/o/${k}${tk === undefined ? "" : `?tk=${encodeURIComponent(tk)}`}`;
const get = (k, tk, headers = {}, method = "GET") => fetch(url(k, tk), { method, headers });
let received = 0; // bytes this client actually received from /o/ responses
const bytesOf = async (r) => { const b = Buffer.from(await r.arrayBuffer()); received += b.length; return b; };
const sha16 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const adminRevoke = (t, tsOff = 0, key = ADMIN) => { const body = JSON.stringify({ t }), ts = String(now() + tsOff); return fetch(`${BASE}/admin/epoch`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Timestamp": ts, "X-Admin-Signature": createHmac("sha256", Buffer.from(key, "base64url")).update(`${ts}.${body}`).digest("base64url") }, body }); };
const beacon = (tk, s, q = 1) => fetch(`${BASE}/m`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tk, s, q }) });
const pmint = (ps, k = K, ttl) => fetch(`${BASE}/poc/mint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ps, k, ttl }) });
const psFor = (t, x = now() + 3600) => tok({ t, k: "", s: "poc-mint", x });
const otherKey = (t = TA) => `${t}/teachAudioFile/${randomUUID()}/${randomUUID()}/published.m4a`;
const runStart = new Date(Date.now() - 5000).toISOString().slice(0, 19).replace("T", " ");
const t0 = Date.now();

// ---- access enforcement (the object EXISTS, so a 404 here is the authorization check, not a missing object) ----
const missing = await get(otherKey());
const missingBody = await missing.text();
const noTok = await get(K), noTokBody = await noTok.text(), noTokHead = await get(K, undefined, {}, "HEAD");
check("H-SEC-01", "existing object without a token -> 404, indistinguishable from a missing object (GET+HEAD)", noTok.status === 404 && noTokHead.status === 404 && noTokBody === missingBody && missing.status === 404, `${noTok.status}/${noTokHead.status}`);
const valid = tok();
const bad = { garbage: "garbage", tampered: valid.slice(0, -3) + (valid.endsWith("AAA") ? "BBB" : "AAA"), wrongKey: sign({ t: TA, k: K, kd: "pub", ia: now(), x: now() + 600, ep: now(), n: "x" }, KID, { [KID]: b64(randomBytes(32)) }), unknownKid: sign({ t: TA, k: K, kd: "pub", ia: now(), x: now() + 600, ep: now(), n: "x" }, "zz", { zz: b64(randomBytes(32)) }), unsigned: `v1.${KID}.${b64(JSON.stringify({ t: TA, k: K, kd: "pub", ia: now(), x: now() + 600, ep: now(), n: "x" }))}.`, oversized: "v1." + "A".repeat(3000) };
const badSt = {}; const badBodies = new Set();
for (const [n, t] of Object.entries(bad)) { const r = await get(K, t, { Range: "bytes=0-1" }); badSt[n] = r.status; badBodies.add(await r.text()); }
check("H-SEC-02", "garbage / tampered / wrong-key / unknown-kid / unsigned / oversized tokens -> identical 404", Object.values(badSt).every((s) => s === 404) && badBodies.size === 1, JSON.stringify(badSt));
const exp = await get(K, tok({ ia: now() - 700, x: now() - 10 }), { Range: "bytes=0-1" }), fut = await get(K, tok({ ia: now() + 3600 }), { Range: "bytes=0-1" });
check("H-SEC-03", "expired token -> 404; token issued in the future -> 404", exp.status === 404 && fut.status === 404, `${exp.status},${fut.status}`);
const objScope = await get(K, tok({ k: otherKey() }), { Range: "bytes=0-1" });
check("H-SEC-04", "object scope: a valid tenant-A token for another key used on this object -> 404", objScope.status === 404, `${objScope.status}`);
const tenScope1 = await get(K, tok({ t: TB }), { Range: "bytes=0-1" }), tenScope2 = await get(K, tok({ t: TB, k: otherKey(TB) }), { Range: "bytes=0-1" });
const tenMint = await pmint(psFor(TB), K);
check("H-SEC-05", "tenant scope: tenant-B token on tenant-A object -> 404 (both forms); tenant-B POC session cannot mint for it", tenScope1.status === 404 && tenScope2.status === 404 && tenMint.status === 404, `${tenScope1.status},${tenScope2.status},${tenMint.status}`);
const kind = await get(K, tok({ kd: "draft" }), { Range: "bytes=0-1" });
check("H-SEC-06", "kind scope: draft-kind token on a published object -> 404", kind.status === 404, `${kind.status}`);
check("H-SEC-06b", "draft object served to a draft token (positive case)", null, "no draft object approved for upload");
const sess = await get(K, tok({ s: "poc-mint" }), { Range: "bytes=0-1" });
check("H-SEC-07", "a POC mint-session token can never fetch bytes", sess.status === 404, `${sess.status}`);
const methods = {}; for (const m of ["PUT", "DELETE", "POST", "PATCH"]) methods[m] = (await fetch(url(K, tok()), { method: m, body: m === "DELETE" ? undefined : "x" })).status;
const objCount = (await (await cf(`/r2/buckets/innerdwes-media-poc/objects`)).json()).result.length;
check("H-SEC-08", "write methods with a VALID token -> 404 and the bucket still holds exactly 1 object", Object.values(methods).every((s) => s === 404) && objCount === 1, `${JSON.stringify(methods)} objects=${objCount}`);
check("H-SEC-09", "forced Content-Type when the stored type is wrong; .html never served; WAV range", null, "needs extra fixtures not approved for upload (covered by local P-SEC-08/08b, P-STR-08)");

// ---- full file + headers ----------------------------------------------------------------------------------
const tFull = Date.now();
const full = await get(K, tok(), { Origin: "https://example.test" });
const fullBody = await bytesOf(full);
const fullMs = Date.now() - tFull;
const h = Object.fromEntries(full.headers);
writeFileSync(join(OUT, "hosted-download.m4a"), fullBody);
let dur = "";
try { dur = execFileSync("afinfo", [join(OUT, "hosted-download.m4a")]).toString().match(/estimated duration: ([\d.]+)/)?.[1] ?? ""; } catch {}
const gotSha = createHash("sha256").update(fullBody).digest("hex");
check("H-STR-01", "full GET -> 200, exact length, SHA-256 identical to the fixture, duration 3600 s", full.status === 200 && h["content-length"] === String(SIZE) && fullBody.length === SIZE && gotSha === SHA && Math.abs(Number(dur) - 3600) < 0.5, `status ${full.status} len ${fullBody.length} sha ${gotSha.slice(0, 12)}… dur ${dur}s in ${(fullMs / 1000).toFixed(1)}s`);
check("H-HDR-01", "content headers: audio/mp4, Accept-Ranges bytes, nosniff, inline, CSP sandbox, Referrer-Policy no-referrer, CORP, ETag",
  h["content-type"] === "audio/mp4" && h["accept-ranges"] === "bytes" && h["x-content-type-options"] === "nosniff" && h["content-disposition"] === "inline" && /sandbox/.test(h["content-security-policy"] ?? "") && h["referrer-policy"] === "no-referrer" && h["cross-origin-resource-policy"] === "cross-origin" && /^"?[0-9a-f]{32}"?$/.test((h.etag ?? "").replace(/^W\//, "")), `${h["content-type"]} etag=${h.etag}`);
check("H-CACHE-01", "private response: Cache-Control private, no-store; not served from Cloudflare cache; no Set-Cookie", h["cache-control"] === "private, no-store" && !/HIT/i.test(h["cf-cache-status"] ?? "") && !h["set-cookie"], `cache-control=${h["cache-control"]} cf-cache-status=${h["cf-cache-status"] ?? "absent"}`);
check("H-CORS-01", "CORS on GET: ACAO *, exposes Content-Range/Accept-Ranges/Content-Length/ETag", h["access-control-allow-origin"] === "*" && /content-range/i.test(h["access-control-expose-headers"] ?? "") && /etag/i.test(h["access-control-expose-headers"] ?? ""), h["access-control-allow-origin"]);
const pre = await fetch(url(K), { method: "OPTIONS", headers: { Origin: "https://example.test", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "range" } });
check("H-CORS-02", "preflight -> 204 with Range allowed and no auth needed (no data returned)", pre.status === 204 && /range/i.test(pre.headers.get("access-control-allow-headers") ?? "") && (await pre.text()) === "", `${pre.status}`);
const etag = h.etag;

// ---- ranges / seeking -------------------------------------------------------------------------------------
const rr = async (range, method = "GET", extra = {}) => { const r = await get(K, tok(), { Range: range, ...extra }, method); return { r, b: method === "HEAD" ? Buffer.alloc(0) : await bytesOf(r) }; };
const mid = Math.floor(SIZE / 2), seekLen = 64 * 1024;
const a = await rr("bytes=0-1"), z = await rr(`bytes=${SIZE - 10}-`), sfx = await rr("bytes=-500"), seek = await rr(`bytes=${mid}-${mid + seekLen - 1}`);
check("H-STR-02", "206 for first 2 bytes / open-ended tail / suffix-500: exact Content-Range, Content-Length and bytes",
  a.r.status === 206 && a.r.headers.get("content-range") === `bytes 0-1/${SIZE}` && a.r.headers.get("content-length") === "2" && a.b.equals(LOCAL.subarray(0, 2)) &&
  z.r.status === 206 && z.r.headers.get("content-range") === `bytes ${SIZE - 10}-${SIZE - 1}/${SIZE}` && z.b.equals(LOCAL.subarray(SIZE - 10)) &&
  sfx.r.status === 206 && sfx.r.headers.get("content-range") === `bytes ${SIZE - 500}-${SIZE - 1}/${SIZE}` && sfx.b.equals(LOCAL.subarray(SIZE - 500)),
  [a.r.status, z.r.status, sfx.r.status].join(","));
check("H-STR-03", "seek: 64 KiB range at the 30:00 byte offset returns the exact fixture bytes", seek.r.status === 206 && seek.r.headers.get("content-length") === String(seekLen) && seek.b.equals(LOCAL.subarray(mid, mid + seekLen)), `${seek.r.status} ${seek.r.headers.get("content-range")}`);
const u1 = await rr(`bytes=${SIZE}-`), u2 = await rr("bytes=-0"), malformed = await rr("bytes=abc", "HEAD"), multi = await rr("bytes=0-1,5-9", "HEAD"), reversed = await rr("bytes=9-5", "HEAD");
check("H-STR-04", "416 for start>=size and bytes=-0 with Content-Range bytes */size; malformed / multi / reversed ranges -> full 200",
  u1.r.status === 416 && u1.r.headers.get("content-range") === `bytes */${SIZE}` && u2.r.status === 416 && malformed.r.status === 200 && malformed.r.headers.get("content-length") === String(SIZE) && multi.r.status === 200 && reversed.r.status === 200,
  [u1.r.status, u2.r.status, malformed.r.status, multi.r.status, reversed.r.status].join(","));
const hd = await rr("bytes=10-19", "HEAD"), hdFull = await get(K, tok(), {}, "HEAD");
check("H-STR-05", "HEAD: 200 with full Content-Length and no body; HEAD+Range -> 206 with Content-Range and length 10",
  hdFull.status === 200 && hdFull.headers.get("content-length") === String(SIZE) && (await hdFull.arrayBuffer()).byteLength === 0 && hd.r.status === 206 && hd.r.headers.get("content-length") === "10" && hd.r.headers.get("content-range") === `bytes 10-19/${SIZE}`,
  `${hdFull.status},${hd.r.status}`);
const inm = await get(K, tok(), { "If-None-Match": etag }), irOk = await rr("bytes=10-19", "GET", { "If-Range": etag }), irBad = await rr("bytes=10-19", "HEAD", { "If-Range": '"other"' });
check("H-STR-06", "conditional: If-None-Match -> 304; If-Range match -> 206; If-Range mismatch -> full 200", inm.status === 304 && irOk.r.status === 206 && irOk.b.equals(LOCAL.subarray(10, 20)) && irBad.r.status === 200, [inm.status, irOk.r.status, irBad.r.status].join(","));

// ---- token lifecycle --------------------------------------------------------------------------------------
const short = tok({ x: now() + 3 });
const s1 = (await get(K, short, { Range: "bytes=0-1" })).status; await sleep(4200); const s2 = (await get(K, short, { Range: "bytes=0-1" })).status;
check("H-TOK-01", "token works until expiry and is refused after it", s1 === 206 && s2 === 404, `${s1} -> ${s2}`);
const psA = psFor(TA);
const m1 = await pmint(psA, K, 99999), m1j = m1.ok ? await m1.json() : {}, m2 = await pmint(psA, K, 1), m2j = m2.ok ? await m2.json() : {};
const refreshed = m1j.tk ? (await get(K, m1j.tk, { Range: `bytes=${mid}-${mid + 1}` })).status : 0;
const mExpired = await pmint(psFor(TA, now() - 5), K), mPlayback = await pmint(tok(), K), mNoSess = await pmint(undefined, K), mOther = await pmint(psA, otherKey(TB));
check("H-TOK-02", "refresh: POC session mints a working token (resume at offset -> 206); TTL clamped to 30..900 s; expired / playback-token / missing session and foreign-tenant key refused",
  m1.status === 200 && m1j.exp - now() <= 900 && m1j.exp - now() >= 890 && m2j.exp - now() <= 30 && m2j.exp - now() >= 25 && refreshed === 206 && [mExpired, mPlayback, mNoSess, mOther].every((r) => r.status === 404),
  `ttl99999->${m1j.exp - now()}s ttl1->${m2j.exp - now()}s resume=${refreshed} refusals=${[mExpired, mPlayback, mNoSess, mOther].map((r) => r.status).join(",")}`);
const retryOld = tok({ ia: now() - 120, x: now() - 1 });
const rA = (await get(K, retryOld, { Range: `bytes=${mid}-${mid + 1}` })).status;
const rB = (await get(K, (await (await pmint(psA, K)).json()).tk, { Range: `bytes=${mid}-${mid + 1}` })).status;
check("H-FAIL-01", "failure/retry path: an expired token fails mid-playback (404), a re-minted token resumes at the same offset (206)", rA === 404 && rB === 206, `${rA} -> ${rB}`);

// revocation: KV is eventually consistent, so measure how long until an outstanding token dies
const TC = randomUUID();
const oldTk = tok({ ep: now() - 5 });
const pre1 = (await get(K, oldTk, { Range: "bytes=0-1" })).status;
const rvC = await adminRevoke(TC); await sleep(1500);
const afterOther = (await get(K, oldTk, { Range: "bytes=0-1" })).status;
const rvA = await adminRevoke(TA); const tRv = Date.now();
let revokedAfter = null, polls = [];
for (let i = 0; i < 25; i++) { const s = (await get(K, oldTk, { Range: "bytes=0-1" })).status; polls.push(s); if (s === 404) { revokedAfter = (Date.now() - tRv) / 1000; break; } await sleep(5000); }
await sleep(1100);
const postNew = (await get(K, tok(), { Range: "bytes=0-1" })).status;
check("H-TOK-03", "revocation: revoking another tenant leaves tenant-A tokens working; revoking tenant A kills outstanding tokens; new tokens work",
  pre1 === 206 && rvC.status === 200 && afterOther === 206 && rvA.status === 200 && revokedAfter !== null && postNew === 206,
  `pre ${pre1}, other-tenant revoke ${rvC.status} -> A still ${afterOther}, revoke A ${rvA.status}, outstanding token dead after ${revokedAfter ?? ">125"} s (polls ${polls.join("")}), new ${postNew}`);
const fAdmin = await fetch(`${BASE}/admin/epoch`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Timestamp": String(now()), "X-Admin-Signature": "AAAA" }, body: JSON.stringify({ t: TB }) });
const stale = await adminRevoke(TB, -400), wrongAdmin = await adminRevoke(TB, 0, b64(randomBytes(32))), noHdr = await fetch(`${BASE}/admin/epoch`, { method: "POST", body: JSON.stringify({ t: TB }) });
check("H-TOK-04", "revocation endpoint: forged signature, wrong key, stale timestamp (replay > 300 s) and missing headers -> 404", [fAdmin, stale, wrongAdmin, noHdr].every((r) => r.status === 404), [fAdmin, stale, wrongAdmin, noHdr].map((r) => r.status).join(","));
check("H-TOK-05", "key rotation (second kid accepted while configured)", null, "would need a new secret version; covered locally by P-TOK-08");

// ---- metering: queue delivery, listening vs bandwidth -----------------------------------------------------
// Simulated listener: a token issued 400 s ago, 300 s "played", and exactly 300 s of 96 kbps audio fetched by range.
const L = mint({ ia: now() - 400 });
const listenBytes = 300 * 12000;
const lr = await get(K, L.tk, { Range: `bytes=0-${listenBytes - 1}` }); const lrb = await bytesOf(lr);
const bq = [await beacon(L.tk, 60, 1), await beacon(L.tk, 300, 2), await beacon(L.tk, 240, 3)];
const C = mint(); const bc = await beacon(C.tk, 5000, 1);              // claims more than the token's lifetime -> capped
const dropped = [await beacon("forged", 9999), await beacon(tok({ s: "poc-mint" }), 9999), await beacon(tok({ ia: now() - 3600, x: now() - 1000 }), 9999), await beacon(L.tk, -5)];
check("H-MET-01", "beacon endpoint: valid beacons and forged / mint-session / long-expired / negative beacons all -> 204 (no oracle)", [...bq, bc, ...dropped].every((r) => r.status === 204), [...bq, bc, ...dropped].map((r) => r.status).join(","));
// abort mid-stream: Worker should record the bytes it actually delivered
const ac = new AbortController(); let abortRecv = 0;
try { const r = await fetch(url(K, tok()), { signal: ac.signal }); const rd = r.body.getReader(); while (abortRecv < 2_000_000) { const { value, done } = await rd.read(); if (done) break; abortRecv += value.length; } ac.abort(); } catch {}
received += abortRecv;
const kvGet = async (k) => { const r = await cf(`/storage/kv/namespaces/${KV_ID}/values/${encodeURIComponent(k)}`); return r.status === 200 ? await r.text() : null; };
let lVal = null, cVal = null, waited = 0;
for (; waited < 150; waited += 10) { lVal = await kvGet(`lt:${sha16(L.n)}`); cVal = await kvGet(`lt:${sha16(C.n)}`); if (lVal === "300" && cVal !== null) break; await sleep(10000); }
const cCap = cVal === null ? NaN : Number(cVal);
check("H-MET-02", "Queue delivery: consumer stored max played seconds per token (300, the lower 240 ignored) within the batch window", lVal === "300", `lt=${lVal} after ~${waited}s`);
check("H-MET-03", "anti-inflation: a 5000 s claim on a fresh token is capped to its lifetime (+60 s)", cCap >= 55 && cCap <= 200, `credited ${cVal}`);
const kvList = (await (await cf(`/storage/kv/namespaces/${KV_ID}/keys?limit=1000`)).json()).result || [];
check("H-PRIV-01", "KV holds only epoch:<tenant> and lt:<32-hex hash> (24 h TTL) keys - no IP, UA or listener id", kvList.every((k) => /^epoch:[0-9a-f-]{36}$/.test(k.name) || (/^lt:[0-9a-f]{32}$/.test(k.name) && k.expiration && k.expiration - now() <= 86400)), `${kvList.length} keys: ${[...new Set(kvList.map((k) => k.name.split(":")[0]))].join(",")}`);

// ---- Analytics Engine (ingestion lags ~1 min) -------------------------------------------------------------
const sql = async (q) => { const r = await cf(`/analytics_engine/sql`, { method: "POST", body: q }); const t = await r.text(); try { return JSON.parse(t); } catch { return { error: t.slice(0, 300) }; } };
let bw, li;
for (let i = 0; i < 12; i++) {
  bw = await sql(`SELECT blob3 AS status, count() AS points, SUM(_sample_interval * double1) AS bytes FROM innerdwes_media_poc_bw WHERE timestamp >= toDateTime('${runStart}') AND blob1 = '${TA}' GROUP BY status FORMAT JSON`);
  li = await sql(`SELECT blob3 AS flag, count() AS points, SUM(_sample_interval * double1) AS seconds FROM innerdwes_media_poc_listen WHERE timestamp >= toDateTime('${runStart}') GROUP BY flag FORMAT JSON`);
  const bwBytes = (bw.data || []).reduce((s, r) => s + Number(r.bytes), 0);
  if (bwBytes >= received * 0.98 && (li.data || []).length >= 2) break;
  await sleep(15000);
}
const bwBytes = (bw.data || []).reduce((s, r) => s + Number(r.bytes), 0);
const liSec = Object.fromEntries((li.data || []).map((r) => [r.flag, Number(r.seconds)]));
check("H-MET-04", "Analytics Engine BW: Worker-recorded delivered bytes cover what this client received (abort included)", bwBytes >= received * 0.98 && bwBytes <= received + SIZE, `recorded ${bwBytes} B vs received ${received} B (abort read ${abortRecv} B); by status ${JSON.stringify(bw.data ?? bw)}`);
check("H-MET-05", "Analytics Engine LISTEN: 300 s credited ok + capped claim flagged 'capped'", liSec.ok === 300 && liSec.capped >= 55 && liSec.capped <= 200, JSON.stringify(li.data ?? li));
const schema = await sql(`SELECT blob1, blob2, blob3, blob4, double1, double2, index1 FROM innerdwes_media_poc_bw WHERE timestamp >= toDateTime('${runStart}') LIMIT 50 FORMAT JSON`);
check("H-PRIV-02", "AE rows carry only tenant id, 32-hex key hash, status - no IP, UA, token or key", (schema.data || []).length > 0 && (schema.data || []).every((r) => r.blob1 === TA && /^[0-9a-f]{32}$/.test(r.blob2) && /^(200|206)$/.test(r.blob3) && !r.blob4 && Number(r.double2 ?? 0) === 0), `${(schema.data || []).length} rows`);
writeFileSync(join(OUT, "hosted-metering.json"), JSON.stringify({ runStart, received, abortRecv, listenBytes: lrb.length, bw: bw.data, listen: li.data, kv: { L: lVal, C: cVal } }, null, 2));

const failed = results.filter((r) => r.ok === false).length, local = results.filter((r) => r.ok === null).length;
console.log(`\n${results.length - failed - local}/${results.length - local} hosted rows passed, ${local} local-only (HOSTED: ${BASE}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(failed ? 1 : 0);
