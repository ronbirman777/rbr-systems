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
 * Counts delivered bytes without losing Content-Length: a plain TransformStream makes the runtime drop the
 * length header (chunked), which Safari's media stack dislikes, so the counted stream feeds a FixedLengthStream.
 */
function countingStream(body: ReadableStream, length: number, onDone: (bytes: number) => void): ReadableStream {
  let bytes = 0, reported = false;
  const report = () => { if (!reported) { reported = true; onDone(bytes); } };
  const counter = new TransformStream({
    transform(chunk, ctl) { bytes += chunk.byteLength; ctl.enqueue(chunk); },
    flush() { report(); },
  });
  const fixed = new FixedLengthStream(length);
  body.pipeThrough(counter).pipeTo(fixed.writable).catch(report); // client abort: record what was delivered
  return fixed.readable;
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
  const record = (bytes: number, status: number) => {
    try { env.BW.writeDataPoint({ blobs: [p.t, kh, String(status)], doubles: [bytes], indexes: [p.t] }); } catch { /* observe-only */ }
  };
  if (req.method === "HEAD") {
    const h = range ? { ...base, "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`, "Content-Length": String(range.length) } : { ...base, "Content-Length": String(size) };
    return new Response(null, { status: range ? 206 : 200, headers: h });
  }
  const obj = await env.BUCKET.get(key, range ? { range: { offset: range.offset, length: range.length } } : undefined);
  if (!obj) return notFound(env);
  const status = range ? 206 : 200;
  let done!: (n: number) => void;
  const finished = new Promise<number>((r) => (done = r));
  ctx.waitUntil(finished.then((n) => record(n, status)));
  const body = countingStream(obj.body, range ? range.length : size, done);
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
