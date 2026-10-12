// TASK 032.5 controlled Staging POC - private R2 audio behind an authenticated Worker.
// Design: docs/media/r2-audit/04-SECURITY-STREAMING-METERING.md (§D, §E, §F.7). NOT production code.
//
// Routes
//   GET|HEAD /o/<objectKey>?tk=<token>   authorized audio bytes (200 / 206 / 304 / 416), bare 404 on any failure
//   OPTIONS  /o/...                       CORS preflight
//   POST     /m                           listening beacon {tk, s: playedSeconds (cumulative), q: seq}  -> Queue (observe only)
//   POST     /admin/epoch                 revoke a tenant's outstanding tokens (HMAC-authenticated; POC stand-in for the app)
//   GET      /poc/player?ps=<pocSession>&k=<objectKey>   POC device test page (synthetic POC tenant only)
//   POST     /poc/mint                    POC-only token mint for the player page, scoped to the POC session's tenant
// Privacy: never reads CF-Connecting-IP, User-Agent or cookies; logs carry no token, key or IP.
import { sha256hex, sign, verify, type TokenPayload } from "./token";

export interface Env {
  BUCKET: R2Bucket;
  EPOCHS: KVNamespace;
  LISTEN_Q: Queue<ListenMsg>;
  BW: AnalyticsEngineDataset;
  LISTEN: AnalyticsEngineDataset;
  MEDIA_TOKEN_KEYS: string;
  MEDIA_ADMIN_KEY: string;
  ALLOWED_ORIGIN: string;
  POC: string;
  ACCT_MODE?: string; // "seg" (default) | "chunk" | "pipe" - see segmentedBody / chunkedBody / pipedBody
}
type ListenMsg = { th: string; t: string; kh: string; s: number; ia: number; at: number };

const MIME: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg" };
const KEY_RE = /^([0-9a-f-]{36})\/(teachAudioFile|audioFile)\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/(draft|published)\.([a-z0-9]+)$/;
const TOKEN_GRACE_BEACON = 15 * 60;
const POC_TTL_MAX = 15 * 60;

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, Content-Type",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length, ETag",
    "Access-Control-Max-Age": "600",
  };
}
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Referrer-Policy": "no-referrer",
};
const notFound = (env: Env) => new Response("Not found", { status: 404, headers: { ...cors(env), "Cache-Control": "private, no-store", "Content-Type": "text/plain" } });

function keys(env: Env): Record<string, string> {
  try { return JSON.parse(env.MEDIA_TOKEN_KEYS) as Record<string, string>; } catch { return {}; }
}

/** Epoch check, FAIL CLOSED: a KV error denies (04 §E.4 recommendation). */
async function epochOk(env: Env, tenant: string, ep: number): Promise<boolean> {
  try {
    const cur = await env.EPOCHS.get(`epoch:${tenant}`);
    return cur === null || ep >= Number(cur);
  } catch { return false; }
}

async function authorize(env: Env, key: string, tk: string | null, now: number): Promise<TokenPayload | null> {
  const m = KEY_RE.exec(key);
  if (!m || !tk || !MIME[m[6]]) return null;
  const p = await verify(keys(env), tk);
  if (!p) return null;
  if (p.s === "poc-mint") return null;                       // a POC session can never fetch bytes
  if (p.x <= now || p.ia > now + 60) return null;            // expired / from the future
  if (p.k !== key || p.t !== m[1]) return null;               // token bound to exactly this object and tenant
  if ((p.kd === "pub") !== (m[5] === "published")) return null; // draft/published kind must match the key
  if (!(await epochOk(env, p.t, p.ep))) return null;          // revocation
  return p;
}

type Range = { offset: number; length: number } | "unsatisfiable" | null;
function parseRange(h: string | null, size: number): Range {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // multi-range or malformed -> full 200 (RFC 9110 allows)
  if (m[1] === "") {
    const n = Math.min(Number(m[2]), size);
    if (n === 0) return "unsatisfiable";
    return { offset: size - n, length: n };
  }
  const start = Number(m[1]);
  if (start >= size) return "unsatisfiable";
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < start) return null;
  return { offset: start, length: end - start + 1 };
}

/**
 * Delivered-byte accounting (docs/media/r2-audit/07-POC-ACCOUNTING.md). All modes keep Content-Length by writing
 * into a FixedLengthStream, and none touches individual bytes in JavaScript.
 *   "seg" (default): the response is assembled from consecutive R2 range reads, each piped NATIVELY (pipeTo,
 *            preventClose) into the response. Segments grow 2 -> 4 -> 8 MiB and stay at 8 MiB (each segment costs
 *            ~0.5 ms CPU, so a full 44 MB file is 7 segments). EXACT on completion. On abort BOUNDED: low = completed
 *            segments, high = low + the segment in flight (2 MiB in the first 2 MiB, 4 MiB up to 6 MiB, then 8 MiB). Every segment after the first is read with
 *            onlyIf etagMatches, so a response can never mix two versions of an object (mismatch -> response aborted).
 *            The next segment's read is started while the current one streams, to avoid a gap.
 *   "chunk": the R2 body is read natively into 256 KiB blocks (BYOB readAtLeast) and each block is written to
 *            the response. EXACT on completion. On abort it is BOUNDED: low = bytes of fully accepted blocks,
 *            high = low + the one block that was in flight (at most 256 KiB, possibly partly sent).
 *   "pipe":  fully native pipeTo. EXACT on completion; on abort UNKNOWN: low = 0, high = requested length.
 * "Delivered" means accepted by the Workers runtime for sending, not received by the client: on a disconnect the
 * client can have received less (network buffering). Cloudflare's own responseBodySize is the account-level check.
 */
const ACCT_BLOCK = 256 * 1024;
type Delivery = { low: number; high: number; outcome: "complete" | "aborted" | "short" }; // exact when low === high

function chunkedBody(body: ReadableStream, length: number): { stream: ReadableStream; done: Promise<Delivery> } {
  const fixed = new FixedLengthStream(length);
  const writer = fixed.writable.getWriter();
  const reader = body.getReader({ mode: "byob" });
  let accepted = 0, inFlight = 0;
  const done = (async (): Promise<Delivery> => {
    try {
      while (accepted < length) {
        const want = Math.min(ACCT_BLOCK, length - accepted);
        const { value, done: end } = await reader.readAtLeast(want, new Uint8Array(want));
        if (value && value.byteLength) { inFlight = value.byteLength; await writer.write(value); accepted += inFlight; inFlight = 0; }
        if (end || !value || value.byteLength < want) break;
      }
      await writer.close();
      return { low: accepted, high: accepted, outcome: accepted === length ? "complete" : "short" };
    } catch {
      reader.cancel().catch(() => {}); writer.abort().catch(() => {});
      return { low: accepted, high: accepted + inFlight, outcome: "aborted" };
    }
  })();
  return { stream: fixed.readable, done };
}

const ACCT_SEG = 2 * 1024 * 1024, ACCT_SEG_MAX = 8 * 1024 * 1024;

function segmentedBody(env: Env, key: string, etag: string, offset: number, length: number, first: R2ObjectBody, firstLen: number): { stream: ReadableStream; done: Promise<Delivery> } {
  const fixed = new FixedLengthStream(length);
  let sent = 0, inFlight = firstLen, idx = 1;
  const read = (at: number) => { const n = Math.min(ACCT_SEG * 2 ** Math.min(idx++, 2), ACCT_SEG_MAX, length - at); return { n, p: n > 0 ? env.BUCKET.get(key, { range: { offset: offset + at, length: n }, onlyIf: { etagMatches: etag } }) : null }; };
  const done = (async (): Promise<Delivery> => {
    let body: ReadableStream | null = first.body;
    let next = read(firstLen);
    try {
      for (;;) {
        await body!.pipeTo(fixed.writable, { preventClose: true });
        sent += inFlight; inFlight = 0;
        if (sent >= length || !next.p) break;
        const o = await next.p;
        if (!o || !("body" in o)) throw new Error("object changed or vanished mid-response");
        body = (o as R2ObjectBody).body; inFlight = next.n;
        next = read(sent + inFlight);
      }
      await fixed.writable.close();
      return { low: sent, high: sent, outcome: "complete" };
    } catch {
      next.p?.then((o) => { if (o && "body" in o) (o as R2ObjectBody).body.cancel().catch(() => {}); }).catch(() => {});
      fixed.writable.abort().catch(() => {});
      return { low: sent, high: sent + inFlight, outcome: "aborted" };
    }
  })();
  return { stream: fixed.readable, done };
}

function pipedBody(body: ReadableStream, length: number): { stream: ReadableStream; done: Promise<Delivery> } {
  const fixed = new FixedLengthStream(length);
  const done = body.pipeTo(fixed.writable).then(
    (): Delivery => ({ low: length, high: length, outcome: "complete" }),
    (): Delivery => ({ low: 0, high: length, outcome: "aborted" }),
  );
  return { stream: fixed.readable, done };
}

async function serveObject(req: Request, env: Env, ctx: ExecutionContext, key: string): Promise<Response> {
  const url = new URL(req.url);
  const now = Math.floor(Date.now() / 1000);
  const p = await authorize(env, key, url.searchParams.get("tk"), now);
  if (!p) return notFound(env); // NO R2 operation happens before authorization succeeds
  const ext = KEY_RE.exec(key)![6];
  const head = await env.BUCKET.head(key);
  if (!head) return notFound(env);
  const size = head.size;
  const etag = head.httpEtag;
  const base: Record<string, string> = { ...cors(env), ...SECURITY_HEADERS, "Content-Type": MIME[ext], "Accept-Ranges": "bytes", ETag: etag, "Last-Modified": head.uploaded.toUTCString() };

  const inm = req.headers.get("If-None-Match");
  if (inm && inm.split(",").map((s) => s.trim()).includes(etag)) return new Response(null, { status: 304, headers: base });

  let range = parseRange(req.headers.get("Range"), size);
  const ifRange = req.headers.get("If-Range");
  if (range && ifRange && ifRange !== etag) range = null; // validator mismatch -> full body
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });

  const kh = (await sha256hex(key)).slice(0, 32);
  const mode = env.ACCT_MODE === "pipe" || env.ACCT_MODE === "chunk" ? env.ACCT_MODE : "seg";
  // BW row: blobs [tenant, keyHash, status, outcome, mode], doubles [deliveredLow, requested, exact(1|0), deliveredHigh]
  const record = (d: Delivery, requested: number, status: number) => {
    try { env.BW.writeDataPoint({ blobs: [p.t, kh, String(status), d.outcome, mode], doubles: [d.low, requested, d.low === d.high ? 1 : 0, d.high], indexes: [p.t] }); } catch { /* observe-only */ }
  };
  if (req.method === "HEAD") {
    const h = range ? { ...base, "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`, "Content-Length": String(range.length) } : { ...base, "Content-Length": String(size) };
    return new Response(null, { status: range ? 206 : 200, headers: h });
  }
  const status = range ? 206 : 200;
  const offset = range ? range.offset : 0, length = range ? range.length : size;
  const firstLen = mode === "seg" ? Math.min(ACCT_SEG, length) : length;
  const obj = await env.BUCKET.get(key, (range || mode === "seg") && length > 0 ? { range: { offset, length: firstLen } } : undefined);
  if (!obj) return notFound(env);
  const { stream: body, done } = mode === "seg" && length > 0 ? segmentedBody(env, key, head.etag, offset, length, obj, firstLen) : (mode === "pipe" ? pipedBody : chunkedBody)(obj.body, length);
  ctx.waitUntil(done.then((d) => record(d, length, status)));
  const headers = range
    ? { ...base, "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`, "Content-Length": String(range.length) }
    : { ...base, "Content-Length": String(size) };
  return new Response(body, { status, headers });
}

async function beacon(req: Request, env: Env): Promise<Response> {
  const h = { ...cors(env), "Cache-Control": "private, no-store" };
  let b: { tk?: string; s?: number; q?: number };
  try { b = await req.json(); } catch { return new Response(null, { status: 204, headers: h }); }
  const now = Math.floor(Date.now() / 1000);
  const p = b.tk ? await verify(keys(env), b.tk) : null;
  // Invalid / foreign / long-expired tokens are silently dropped (204, nothing recorded).
  if (!p || p.s === "poc-mint" || p.x + TOKEN_GRACE_BEACON < now || !Number.isFinite(b.s) || (b.s as number) < 0) return new Response(null, { status: 204, headers: h });
  const msg: ListenMsg = { th: (await sha256hex(p.n)).slice(0, 32), t: p.t, kh: (await sha256hex(p.k)).slice(0, 32), s: Math.floor(b.s as number), ia: p.ia, at: now };
  await env.LISTEN_Q.send(msg);
  return new Response(null, { status: 204, headers: h });
}

/** Queue consumer: per token (hashed nonce) keep max(playedSeconds); credit only the bounded increase. Observe only. */
async function consume(batch: MessageBatch<ListenMsg>, env: Env): Promise<void> {
  const best = new Map<string, ListenMsg>();
  for (const m of batch.messages) {
    const cur = best.get(m.body.th);
    if (!cur || m.body.s > cur.s) best.set(m.body.th, m.body);
  }
  for (const m of best.values()) {
    const wallBound = Math.max(0, m.at - m.ia + 60);           // can't have played longer than the token has existed
    const claimed = Math.min(m.s, wallBound);
    const prevRaw = await env.EPOCHS.get(`lt:${m.th}`);        // transient per-token max, 24 h TTL (no identity)
    const prev = prevRaw ? Number(prevRaw) : 0;
    if (claimed <= prev) continue;
    await env.EPOCHS.put(`lt:${m.th}`, String(claimed), { expirationTtl: 86400 });
    env.LISTEN.writeDataPoint({ blobs: [m.t, m.kh, m.s > wallBound ? "capped" : "ok"], doubles: [claimed - prev], indexes: [m.t] });
  }
  batch.ackAll();
}

async function adminEpoch(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  const sig = req.headers.get("X-Admin-Signature") ?? "";
  const ts = Number(req.headers.get("X-Admin-Timestamp") ?? "0");
  if (!env.MEDIA_ADMIN_KEY || Math.abs(Date.now() / 1000 - ts) > 300) return new Response(null, { status: 404 });
  const k = await crypto.subtle.importKey("raw", Uint8Array.from(atob(env.MEDIA_ADMIN_KEY.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((env.MEDIA_ADMIN_KEY.length + 3) % 4)), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sig.length + 3) % 4)), (c) => c.charCodeAt(0));
  if (!(await crypto.subtle.verify("HMAC", k, sigBytes, new TextEncoder().encode(`${ts}.${body}`)))) return new Response(null, { status: 404 });
  const { t } = JSON.parse(body) as { t: string };
  if (!/^[0-9a-f-]{36}$/.test(t)) return new Response(null, { status: 400 });
  const epoch = Math.floor(Date.now() / 1000);
  await env.EPOCHS.put(`epoch:${t}`, String(epoch));
  return Response.json({ t, epoch });
}

async function pocMint(req: Request, env: Env): Promise<Response> {
  if (env.POC !== "1") return new Response(null, { status: 404 });
  const { ps, k, ttl } = (await req.json().catch(() => ({}))) as { ps?: string; k?: string; ttl?: number };
  const now = Math.floor(Date.now() / 1000);
  const s = ps ? await verify(keys(env), ps) : null;
  const m = k ? KEY_RE.exec(k) : null;
  if (!s || s.s !== "poc-mint" || s.x <= now || !m || m[1] !== s.t) return new Response(null, { status: 404, headers: cors(env) });
  const life = Math.max(30, Math.min(POC_TTL_MAX, Number(ttl) || 600));
  const kid = Object.keys(keys(env))[0];
  const nonce = new Uint8Array(12); crypto.getRandomValues(nonce);
  const tk = await sign(keys(env), kid, { t: s.t, k: k!, kd: m[5] === "published" ? "pub" : "draft", ia: now, x: now + life, ep: now, n: [...nonce].map((b) => b.toString(16).padStart(2, "0")).join("") });
  return Response.json({ tk, exp: now + life }, { headers: { ...cors(env), "Cache-Control": "private, no-store" } });
}

function pocPlayer(req: Request, env: Env): Response {
  if (env.POC !== "1") return new Response(null, { status: 404 });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>InnerDweS R2 POC player</title><style>body{font:15px system-ui;margin:16px;max-width:640px}button{font:inherit;padding:10px 14px;margin:4px 4px 4px 0;min-height:44px}
#log{font:12px ui-monospace,monospace;white-space:pre-wrap;background:#f4f4f4;padding:8px;max-height:45vh;overflow:auto}audio{width:100%}</style></head>
<body><h1>R2 POC player</h1><p>Synthetic POC audio only. Tokens are short-lived; the page re-requests a token on error or before expiry.</p>
<label>TTL seconds <input id="ttl" type="number" value="600" min="30" max="900"></label>
<audio id="a" controls preload="metadata"></audio>
<div><button id="seek">Seek +5 min</button><button id="back">Seek to 0:10</button><button id="expire">Mint 60 s token now</button></div>
<div id="stats"></div><div id="log"></div>
<script>
const q=new URLSearchParams(location.search), ps=q.get("ps"), key=q.get("k"), a=document.getElementById("a"), L=document.getElementById("log");
let tk=null, exp=0, assignedAt=0, attempts=0, played=0, lastT=0, seq=0;
const log=(m)=>{L.textContent=new Date().toISOString().slice(11,19)+" "+m+"\\n"+L.textContent;};
async function mint(ttl){const r=await fetch("/poc/mint",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ps,k:key,ttl:ttl||+document.getElementById("ttl").value})});
 if(!r.ok){log("mint refused "+r.status);return false;} const j=await r.json(); tk=j.tk; exp=j.exp; log("token minted, expires in "+(exp-Math.floor(Date.now()/1000))+" s"); return true;}
async function assign(ttl,keepTime){const t=a.currentTime, wasPlaying=!a.paused; if(!(await mint(ttl)))return; a.src="/o/"+key+"?tk="+encodeURIComponent(tk); assignedAt=Date.now();
 if(keepTime){a.addEventListener("loadedmetadata",()=>{a.currentTime=t; if(wasPlaying)a.play().catch(()=>{});},{once:true});}}
function beacon(){ if(!tk)return; seq++; navigator.sendBeacon("/m",new Blob([JSON.stringify({tk,s:Math.floor(played),q:seq})],{type:"application/json"})); }
a.addEventListener("timeupdate",()=>{const d=a.currentTime-lastT; if(!a.paused&&d>0&&d<2)played+=d; lastT=a.currentTime; document.getElementById("stats").textContent="played "+played.toFixed(1)+" s, position "+a.currentTime.toFixed(1)+" s";});
a.addEventListener("seeking",()=>{lastT=a.currentTime; log("seeking to "+a.currentTime.toFixed(1));});
a.addEventListener("error",async()=>{log("media error "+(a.error&&a.error.code)); if(attempts++<3){await new Promise(r=>setTimeout(r,[500,2000,5000][attempts-1])); await assign(0,true);} });
a.addEventListener("playing",()=>{attempts=0; log("playing");});
a.addEventListener("pause",()=>{log("paused"); beacon();});
a.addEventListener("ended",()=>{log("ended"); beacon();});
a.addEventListener("play",async()=>{ if(exp-Math.floor(Date.now()/1000)<90){log("pre-emptive renewal"); await assign(0,true);} });
setInterval(()=>{ if(!a.paused) beacon(); },300000);
addEventListener("pagehide",beacon);
document.getElementById("seek").onclick=()=>{a.currentTime=Math.min((a.duration||1e9)-1,a.currentTime+300);};
document.getElementById("back").onclick=()=>{a.currentTime=10;};
document.getElementById("expire").onclick=()=>assign(60,true);
assign();
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname.startsWith("/o/") && (req.method === "GET" || req.method === "HEAD")) {
      let key: string;
      try { key = decodeURIComponent(url.pathname.slice(3)); } catch { return notFound(env); }
      return serveObject(req, env, ctx, key);
    }
    if (url.pathname === "/m" && req.method === "POST") return beacon(req, env);
    if (url.pathname === "/admin/epoch" && req.method === "POST") return adminEpoch(req, env);
    if (url.pathname === "/poc/mint" && req.method === "POST") return pocMint(req, env);
    if (url.pathname === "/poc/player" && req.method === "GET") return pocPlayer(req, env);
    return notFound(env);
  },
  async queue(batch: MessageBatch<ListenMsg>, env: Env): Promise<void> {
    await consume(batch, env);
  },
} satisfies ExportedHandler<Env, ListenMsg>;
