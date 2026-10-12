#!/usr/bin/env node
/**
 * TASK 032.5 POC - LOCAL run of the subset of the 06-POC-PLAN.md matrix that does not need Cloudflare.
 * Runs the Worker in `wrangler dev --local` (workerd + simulated R2/KV/Queues, no Cloudflare account, no cost).
 * LOCAL evidence only: it is NOT a substitute for the hosted Staging POC rows.
 *
 *   node test/poc-matrix.mjs            (local)
 *   POC_BASE=https://<worker>.workers.dev POC_KEYS_FILE=... node test/poc-matrix.mjs --remote   (hosted POC Worker innerdwes-media-poc, after owner approval)
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REMOTE = process.argv.includes("--remote");
const here = decodeURIComponent(new URL("..", import.meta.url).pathname);
const b64url = (b) => Buffer.from(b).toString("base64url");
const results = [];
const check = (id, name, ok, detail = "") => { results.push({ id, name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${name}${ok || !detail ? "" : "  -> " + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- keys -----------------------------------------------------------------
let KEYS, ADMIN, BASE, BUCKET = "innerdwes-media-poc";
if (REMOTE) {
  const f = process.env.POC_KEYS_FILE; if (!f || !existsSync(f)) throw new Error("POC_KEYS_FILE required for --remote");
  ({ KEYS, ADMIN } = JSON.parse(readFileSync(f, "utf8"))); BASE = process.env.POC_BASE;
  if (!/^https:\/\/innerdwes-media-poc\.[a-z0-9-]+\.workers\.dev$/.test(BASE ?? "")) throw new Error("REFUSING: POC_BASE must be https://innerdwes-media-poc.<subdomain>.workers.dev");
} else {
  KEYS = { k1: b64url(randomBytes(32)), k0: b64url(randomBytes(32)) };
  ADMIN = b64url(randomBytes(32));
  writeFileSync(join(here, ".dev.vars"), `MEDIA_TOKEN_KEYS=${JSON.stringify(KEYS)}\nMEDIA_ADMIN_KEY=${ADMIN}\n`, { mode: 0o600 });
  BASE = "http://127.0.0.1:8799";
}
function sign(kid, payload, keys = KEYS) {
  const head = `v1.${kid}.${b64url(JSON.stringify(payload))}`;
  return `${head}.${createHmac("sha256", Buffer.from(keys[kid], "base64url")).update(head).digest("base64url")}`;
}
const now = () => Math.floor(Date.now() / 1000);
const mint = (key, o = {}) => {
  const [t, , , , file] = key.split("/");
  return sign(o.kid ?? "k1", { t: o.t ?? t, k: o.k ?? key, kd: o.kd ?? (file.startsWith("published") ? "pub" : "draft"), ia: o.ia ?? now(), x: o.x ?? now() + 600, ep: o.ep ?? now(), n: randomBytes(12).toString("hex"), ...(o.s ? { s: o.s } : {}) });
};

// ---- fixtures (synthetic) ---------------------------------------------------
const TA = randomUUID(), TB = randomUUID();
const key = (t, kind, ext, folder = "audioFile") => `${t}/${folder}/${randomUUID()}/${randomUUID()}/${kind}.${ext}`;
const A_PUB = key(TA, "published", "mp3"), A_DRAFT = key(TA, "draft", "mp3"), B_PUB = key(TB, "published", "mp3"), A_HTML = key(TA, "published", "html"), A_WAV = key(TA, "published", "wav", "teachAudioFile");
const SIZE = 100_000;
const A_BIG = key(TA, "published", "m4a"), BIG = 20_000_001;   // "seg" segments 2+4+8 MiB then the remainder (covers the 8 MiB cap); odd length
const big = Buffer.alloc(BIG); for (let i = 0; i < BIG; i++) big[i] = (i * 7 + 3) % 253;
const payload = Buffer.alloc(SIZE); for (let i = 0; i < SIZE; i++) payload[i] = i % 251;
const wav = (() => { const d = 8000 * 2 * 2, b = Buffer.alloc(44 + d); b.write("RIFF", 0); b.writeUInt32LE(36 + d, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(d, 40); return b; })();

let dev;
// Local runs must never reach Cloudflare: strip any credentials/target overrides from the child environment.
const localEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLOUDFLARE_|CF_|WRANGLER_ENV)/.test(k)));
async function startLocal() {
  const dir = mkdtempSync(join(tmpdir(), "poc-"));
  const put = (k, buf, ct) => { const f = join(dir, randomUUID()); writeFileSync(f, buf); execFileSync("npx", ["--no-install", "wrangler", "r2", "object", "put", `${BUCKET}/${k}`, "--local", "--file", f, "--content-type", ct], { cwd: here, env: localEnv, stdio: "ignore" }); };
  put(A_PUB, payload, "text/html"); // stored Content-Type deliberately WRONG: the Worker must force audio/mpeg
  put(A_DRAFT, payload, "audio/mpeg"); put(B_PUB, payload, "audio/mpeg"); put(A_HTML, Buffer.from("<script>alert(1)</script>"), "text/html"); put(A_WAV, wav, "audio/wav"); put(A_BIG, big, "audio/mp4");
  dev = spawn("npx", ["--no-install", "wrangler", "dev", "--local", "--port", "8799", "--ip", "127.0.0.1"], { cwd: here, env: localEnv, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; dev.stdout.on("data", (d) => (out += d)); dev.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 60; i++) { await sleep(1000); try { const r = await fetch(`${BASE}/nope`); if (r.status === 404) return; } catch {} }
  throw new Error("wrangler dev did not start:\n" + out.slice(-2000));
}
const get = (k, tk, headers = {}, method = "GET") => fetch(`${BASE}/o/${k}${tk === undefined ? "" : `?tk=${encodeURIComponent(tk)}`}`, { method, headers });

async function adminRevoke(t) {
  const body = JSON.stringify({ t }), ts = String(now());
  const sig = createHmac("sha256", Buffer.from(ADMIN, "base64url")).update(`${ts}.${body}`).digest("base64url");
  return fetch(`${BASE}/admin/epoch`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Timestamp": ts, "X-Admin-Signature": sig }, body });
}

try {
  if (!REMOTE) await startLocal();
  // --- 3.1 access enforcement ------------------------------------------------
  const noTok = await get(A_PUB);
  check("P-SEC-02a", "no token -> 404", noTok.status === 404, noTok.status);
  const bad = [ "garbage", "v1.k1.e30.AAAA", mint(A_PUB).slice(0, -3) + "AAA", sign("k1", { t: TA, k: A_PUB, kd: "pub", ia: now(), x: now() + 600, ep: now(), n: "x" }, { k1: b64url(randomBytes(32)) }), sign("zz", { t: TA, k: A_PUB, kd: "pub", ia: now(), x: now() + 600, ep: now(), n: "x" }, { zz: b64url(randomBytes(32)) }) ];
  const badSt = []; for (const t of bad) badSt.push((await get(A_PUB, t)).status);
  const bodies = new Set(); for (const t of bad.slice(0, 2)) bodies.add(await (await get(A_PUB, t)).text());
  check("P-SEC-02b", "malformed / tampered / wrong-key / unknown-kid tokens -> identical 404", badSt.every((s) => s === 404) && bodies.size === 1, badSt.join(","));
  check("P-SEC-03", "valid token for object A used on object B -> 404", (await get(A_DRAFT, mint(A_PUB))).status === 404 && (await get(A_PUB, mint(A_PUB, { k: A_DRAFT }))).status === 404);
  check("P-SEC-04", "cross-tenant: tenant-A token on tenant-B key -> 404", (await get(B_PUB, mint(B_PUB, { t: TA }))).status === 404 && (await get(B_PUB, mint(A_PUB, { k: B_PUB }))).status === 404);
  check("P-SEC-05", "predictable key without token -> 404", (await get(B_PUB)).status === 404);
  const dPub = await get(A_DRAFT, mint(A_DRAFT, { kd: "pub" })), pDraft = await get(A_PUB, mint(A_PUB, { kd: "draft" })), dOk = await get(A_DRAFT, mint(A_DRAFT));
  check("P-SEC-06", "draft/published kind mismatch -> 404 both ways; a draft-kind token on its own draft key works", dPub.status === 404 && pDraft.status === 404 && dOk.status === 200, `${dPub.status},${pDraft.status},${dOk.status}`);
  const ok = await get(A_PUB, mint(A_PUB)); const okBody = Buffer.from(await ok.arrayBuffer());
  const h = Object.fromEntries(ok.headers);
  check("P-SEC-08", "forced headers: audio/mpeg despite stored text/html, nosniff, private no-store, inline, CSP sandbox",
    ok.status === 200 && h["content-type"] === "audio/mpeg" && h["x-content-type-options"] === "nosniff" && h["cache-control"] === "private, no-store" && h["content-disposition"] === "inline" && /sandbox/.test(h["content-security-policy"] ?? ""), JSON.stringify(h));
  check("P-SEC-08b", "non-audio extension (.html) is never served, even with a valid token", (await get(A_HTML, mint(A_HTML))).status === 404);
  check("P-SEC-12", "a POC mint-session token can never fetch bytes", (await get(A_PUB, mint(A_PUB, { s: "poc-mint" }))).status === 404);
  // --- 3.2 streaming ---------------------------------------------------------
  check("P-STR-01", "GET without Range -> 200, full length, Accept-Ranges bytes, exact bytes", ok.status === 200 && h["content-length"] === String(SIZE) && h["accept-ranges"] === "bytes" && okBody.equals(payload), `status ${ok.status} len ${h["content-length"]} ar ${h["accept-ranges"]} bytesEqual ${okBody.equals(payload)} got ${okBody.length}`);
  const r01 = await get(A_PUB, mint(A_PUB), { Range: "bytes=0-1" }), r100 = await get(A_PUB, mint(A_PUB), { Range: "bytes=99990-" }), rSuf = await get(A_PUB, mint(A_PUB), { Range: "bytes=-500" });
  const r416 = await get(A_PUB, mint(A_PUB), { Range: `bytes=${SIZE}-` }), rMulti = await get(A_PUB, mint(A_PUB), { Range: "bytes=0-1,5-9" });
  const b01 = Buffer.from(await r01.arrayBuffer()), b100 = Buffer.from(await r100.arrayBuffer()), bSuf = Buffer.from(await rSuf.arrayBuffer());
  check("P-STR-02", "206 bytes=0-1 / open-ended / suffix with exact Content-Range and bytes; 416 unsatisfiable; multi-range -> 200",
    r01.status === 206 && r01.headers.get("content-range") === `bytes 0-1/${SIZE}` && b01.equals(payload.subarray(0, 2)) &&
    r100.status === 206 && r100.headers.get("content-range") === `bytes 99990-99999/${SIZE}` && b100.equals(payload.subarray(99990)) &&
    rSuf.status === 206 && rSuf.headers.get("content-range") === `bytes 99500-99999/${SIZE}` && bSuf.equals(payload.subarray(99500)) &&
    r416.status === 416 && r416.headers.get("content-range") === `bytes */${SIZE}` && rMulti.status === 200,
    [r01.status, r01.headers.get("content-range"), r100.status, rSuf.status, r416.status, rMulti.status].join(" "));
  const etag = h.etag;
  const hd = await get(A_PUB, mint(A_PUB), { Range: "bytes=10-19" }, "HEAD"), inm = await get(A_PUB, mint(A_PUB), { "If-None-Match": etag });
  const irOk = await get(A_PUB, mint(A_PUB), { Range: "bytes=10-19", "If-Range": etag }), irBad = await get(A_PUB, mint(A_PUB), { Range: "bytes=10-19", "If-Range": '"other"' });
  check("P-STR-03", "HEAD+Range -> 206 headers no body; If-None-Match -> 304; If-Range match -> 206, mismatch -> 200",
    hd.status === 206 && hd.headers.get("content-length") === "10" && (await hd.arrayBuffer()).byteLength === 0 && inm.status === 304 && irOk.status === 206 && irBad.status === 200,
    [hd.status, inm.status, irOk.status, irBad.status].join(","));
  const wv = await get(A_WAV, mint(A_WAV), { Range: "bytes=0-43" });
  check("P-STR-08", "WAV under teachAudioFile served as audio/wav with a valid RIFF header", wv.status === 206 && wv.headers.get("content-type") === "audio/wav" && Buffer.from(await wv.arrayBuffer()).subarray(0, 4).toString() === "RIFF");
  const bg = await get(A_BIG, mint(A_BIG)), bgb = Buffer.from(await bg.arrayBuffer());
  const bx = await get(A_BIG, mint(A_BIG), { Range: "bytes=262000-19000000" }), bxb = Buffer.from(await bx.arrayBuffer());
  const bt = await get(A_BIG, mint(A_BIG), { Range: "bytes=-300000" }), btb = Buffer.from(await bt.arrayBuffer());
  check("P-STR-09", "multi-segment body (20,000,001 B: 2+4+8 MiB segments + remainder): full 200 and segment-spanning 206 ranges byte-exact with exact Content-Length",
    bg.status === 200 && bg.headers.get("content-length") === String(BIG) && bgb.equals(big) &&
    bx.status === 206 && bx.headers.get("content-range") === `bytes 262000-19000000/${BIG}` && bxb.equals(big.subarray(262000, 19000001)) &&
    bt.status === 206 && bt.headers.get("content-length") === "300000" && btb.equals(big.subarray(BIG - 300000)),
    [bg.status, bgb.length, bx.status, bxb.length, bt.status, btb.length].join(","));
  // --- 3.3 token lifecycle ---------------------------------------------------
  const shortTk = mint(A_PUB, { x: now() + 2 });
  const before = (await get(A_PUB, shortTk, { Range: "bytes=0-1" })).status; await sleep(3200);
  const after = (await get(A_PUB, shortTk, { Range: "bytes=0-1" })).status;
  check("P-TOK-01", "token valid until expiry, 404 after (client re-resolve is a browser row)", before === 206 && after === 404, `${before} -> ${after}`);
  check("P-TOK-01b", "token issued in the future is refused", (await get(A_PUB, mint(A_PUB, { ia: now() + 3600 }))).status === 404);
  const oldTk = mint(A_PUB, { ep: now() - 5 });
  const pre = (await get(A_PUB, oldTk, { Range: "bytes=0-1" })).status;
  const rv = await adminRevoke(TA);
  const postOld = (await get(A_PUB, oldTk, { Range: "bytes=0-1" })).status;
  await sleep(1100);
  const postNew = (await get(A_PUB, mint(A_PUB), { Range: "bytes=0-1" })).status;
  const otherTenant = (await get(B_PUB, mint(B_PUB, { ep: now() - 5 }), { Range: "bytes=0-1" })).status;
  check("P-TOK-03", "epoch revocation: outstanding tenant-A tokens die immediately, new tokens work, tenant B unaffected", pre === 206 && rv.status === 200 && postOld === 404 && postNew === 206 && otherTenant === 206, [pre, rv.status, postOld, postNew, otherTenant].join(","));
  const forged = await fetch(`${BASE}/admin/epoch`, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Timestamp": String(now()), "X-Admin-Signature": "AAAA" }, body: JSON.stringify({ t: TB }) });
  check("P-TOK-03b", "unsigned / forged revocation request refused", forged.status === 404);
  const k0tok = mint(B_PUB, { kid: "k0" });
  check("P-TOK-08", "key rotation: tokens under the second kid are accepted while it is configured (removal = redeploy secret; hosted row)", (await get(B_PUB, k0tok, { Range: "bytes=0-1" })).status === 206);
  // --- 3.5 metering ingress (consumer aggregation is a hosted row) ----------
  const beaconOk = await fetch(`${BASE}/m`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tk: mint(B_PUB), s: 30, q: 1 }) });
  const beaconBad = await fetch(`${BASE}/m`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tk: "forged", s: 99999, q: 1 }) });
  check("P-MET-03a", "beacon endpoint accepts a valid token and silently drops a forged one (both 204, no detail leaked)", beaconOk.status === 204 && beaconBad.status === 204);
  // --- privacy (static) -------------------------------------------------------
  const src = readFileSync(join(here, "src/index.ts"), "utf8") + readFileSync(join(here, "src/token.ts"), "utf8");
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
  check("P-SEC-10a", "Worker code never reads CF-Connecting-IP / User-Agent / Cookie and never logs", !/cf-connecting-ip|user-agent|headers\.get\(["']cookie|console\.(log|info|warn|error)/i.test(code));
} finally {
  if (dev) dev.kill("SIGINT");
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed (${REMOTE ? "HOSTED" : "LOCAL workerd simulation - not hosted evidence"})`);
process.exit(failed ? 1 : 0);
