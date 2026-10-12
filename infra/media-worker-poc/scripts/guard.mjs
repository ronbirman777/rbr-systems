#!/usr/bin/env node
/**
 * TASK 032.5 POC - fail-closed target guard. Run before ANY provisioning, seeding or deployment.
 *
 *   node scripts/guard.mjs config            config-only checks (no network, no credentials)
 *   node scripts/guard.mjs remote [--post]   config checks + READ-ONLY Cloudflare API checks
 *                                            (--post: after deploy, the Worker's bindings must match EXACTLY)
 *
 * Exits non-zero, printing every mismatch, if anything differs from the owner-approved mapping (2026-10-12, Option 1).
 * Never prints the API token. Only GET requests are made.
 */
import { readFileSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECT = Object.freeze({
  worker: "innerdwes-media-poc",
  bucket: "innerdwes-media-poc",
  kv: "innerdwes-media-poc-epochs",
  queue: "innerdwes-media-poc-listen",
  datasets: { BW: "innerdwes_media_poc_bw", LISTEN: "innerdwes_media_poc_listen" },
  vars: { ALLOWED_ORIGIN: "*", POC: "1" },
  secrets: ["MEDIA_ADMIN_KEY", "MEDIA_TOKEN_KEYS"],
});
const here = decodeURIComponent(new URL("..", import.meta.url).pathname);
const problems = [];
const fail = (m) => problems.push(m);
const info = (m) => console.log(`  ${m}`);

// ---- 1. config (wrangler.toml) - deliberately strict text checks ------------------------------------------------
export function checkConfig() {
  const toml = readFileSync(join(here, "wrangler.toml"), "utf8").replace(/#.*$/gm, "");
  const one = (re, what) => { const m = toml.match(re); if (!m) fail(`wrangler.toml: ${what} missing`); return m?.[1]; };
  if (/^\s*\[\s*env\./m.test(toml) || /^\s*\[\[\s*env\./m.test(toml)) fail("wrangler.toml: [env.*] sections are not allowed (single target only)");
  if (/^\s*(routes?|custom_domain|zone_id|zone_name)\s*=/m.test(toml) || /^\s*\[\[?\s*routes/m.test(toml)) fail("wrangler.toml: routes / custom domains are not allowed (workers.dev only)");
  if (one(/^\s*name\s*=\s*"([^"]+)"/m, "name") !== EXPECT.worker) fail(`wrangler.toml: name must be ${EXPECT.worker}`);
  if (one(/^\s*workers_dev\s*=\s*(\w+)/m, "workers_dev") !== "true") fail("wrangler.toml: workers_dev must be true");
  const r2 = [...toml.matchAll(/binding\s*=\s*"([^"]+)"\s*,\s*bucket_name\s*=\s*"([^"]+)"/g)];
  if (r2.length !== 1 || r2[0][1] !== "BUCKET" || r2[0][2] !== EXPECT.bucket) fail(`wrangler.toml: exactly one R2 binding BUCKET -> ${EXPECT.bucket} required`);
  const kv = [...toml.matchAll(/binding\s*=\s*"([^"]+)"\s*,\s*id\s*=\s*"([^"]+)"/g)];
  if (kv.length !== 1 || kv[0][1] !== "EPOCHS") fail("wrangler.toml: exactly one KV binding EPOCHS required");
  const ae = Object.fromEntries([...toml.matchAll(/binding\s*=\s*"([^"]+)"\s*,\s*dataset\s*=\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  if (JSON.stringify(ae) !== JSON.stringify(EXPECT.datasets)) fail(`wrangler.toml: Analytics Engine bindings must be ${JSON.stringify(EXPECT.datasets)}`);
  const queues = [...toml.matchAll(/queue\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  if (queues.length !== 2 || queues.some((q) => q !== EXPECT.queue)) fail(`wrangler.toml: producer + consumer must both use ${EXPECT.queue}`);
  if (!/binding\s*=\s*"LISTEN_Q"/.test(toml)) fail("wrangler.toml: queue producer binding LISTEN_Q missing");
  if (!/\[observability\]\s*\n\s*enabled\s*=\s*false/.test(toml)) fail("wrangler.toml: [observability] enabled = false required (no invocation logs)");
  return { kvId: kv[0]?.[2] };
}

export function refuseEnvArgs(argv) {
  if (argv.some((a) => a === "--env" || a.startsWith("--env=") || a === "-e" || a === "--name" || a.startsWith("--name="))) {
    console.error("REFUSING: --env/--name are not allowed; the only target is " + EXPECT.worker); process.exit(2);
  }
}

// ---- 2. remote, READ-ONLY ------------------------------------------------------------------------------------------
function loadCreds() {
  const f = process.env.CF_ENV_FILE ?? join(homedir(), ".config/innerdwes/cf-staging.env");
  if (!existsSync(f)) { fail(`credential file missing: ${f} (owner creates it)`); return null; }
  if ((statSync(f).mode & 0o077) !== 0) fail(`credential file ${f} must be chmod 600`);
  const env = Object.fromEntries(readFileSync(f, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]));
  if (!/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? "")) fail("CLOUDFLARE_ACCOUNT_ID missing or malformed");
  if (!env.CLOUDFLARE_API_TOKEN) fail("CLOUDFLARE_API_TOKEN missing");
  return env;
}
async function api(env, path) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok && j.success !== false, result: j.result, info: j.result_info, errors: (j.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ") };
}
const all = async (env, path) => { const out = []; for (let page = 1; page < 50; page++) { const r = await api(env, `${path}${path.includes("?") ? "&" : "?"}page=${page}&per_page=100`); if (!r.ok) return { ...r, result: null }; const items = Array.isArray(r.result) ? r.result : r.result?.buckets ?? []; out.push(...items); if (items.length < 100) break; } return { ok: true, result: out }; };

export async function checkRemote({ post = false, kvId } = {}) {
  const env = loadCreds(); if (!env || problems.length) return;
  const A = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
  const tok = await api(env, `${A}/tokens/verify`).then((r) => (r.ok ? r : api(env, "/user/tokens/verify")));
  if (!tok.ok || tok.result?.status !== "active") fail(`API token not active (${tok.status} ${tok.errors})`); else info(`token: active (value not shown)`);
  const acct = await api(env, A);
  if (acct.ok) info(`account: ${acct.result?.name ?? "?"} (${env.CLOUDFLARE_ACCOUNT_ID.slice(0, 6)}…)`); else info(`account name not readable with this token (${acct.status}); continuing on account id`);

  // Worker must already exist (never create a second one) and must have no routes/custom domains.
  const scripts = await all(env, `${A}/workers/scripts`);
  if (!scripts.ok) fail(`cannot list Workers (${scripts.status ?? ""} ${scripts.errors ?? ""})`);
  else {
    const names = scripts.result.map((s) => s.id);
    info(`workers in account: ${names.length} [${names.filter((n) => n.startsWith("innerdwes-media")).join(", ")}]`);
    if (!names.includes(EXPECT.worker)) fail(`Worker ${EXPECT.worker} not found - refusing to create one`);
    const extra = names.filter((n) => n.startsWith("innerdwes-media") && n !== EXPECT.worker);
    if (extra.length) fail(`unexpected POC-like Workers exist: ${extra.join(", ")}`);
  }
  const settings = await api(env, `${A}/workers/scripts/${EXPECT.worker}/settings`);
  if (!settings.ok) fail(`cannot read Worker settings (${settings.status} ${settings.errors})`);
  else {
    const b = settings.result?.bindings ?? [];
    const want = [
      { name: "BUCKET", type: "r2_bucket", bucket_name: EXPECT.bucket },
      { name: "EPOCHS", type: "kv_namespace", ...(kvId && !kvId.startsWith("REPLACE") ? { namespace_id: kvId } : {}) },
      { name: "LISTEN_Q", type: "queue", queue_name: EXPECT.queue },
      { name: "BW", type: "analytics_engine", dataset: EXPECT.datasets.BW },
      { name: "LISTEN", type: "analytics_engine", dataset: EXPECT.datasets.LISTEN },
      { name: "ALLOWED_ORIGIN", type: "plain_text", text: EXPECT.vars.ALLOWED_ORIGIN },
      { name: "POC", type: "plain_text", text: EXPECT.vars.POC },
      ...EXPECT.secrets.map((n) => ({ name: n, type: "secret_text" })),
    ];
    const show = b.map((x) => `${x.name}:${x.type}${x.bucket_name ? "->" + x.bucket_name : ""}${x.queue_name ? "->" + x.queue_name : ""}${x.dataset ? "->" + x.dataset : ""}`);
    info(`current Worker bindings: ${show.length ? show.join(", ") : "(none)"}`);
    for (const x of b) {
      const w = want.find((y) => y.name === x.name);
      if (!w) { fail(`unexpected binding on Worker: ${x.name} (${x.type})`); continue; }
      for (const [k, v] of Object.entries(w)) if (x[k] !== undefined && x[k] !== v) fail(`binding ${x.name}: ${k}=${x[k]} expected ${v}`);
      if (x.type !== w.type) fail(`binding ${x.name}: type ${x.type} expected ${w.type}`);
    }
    if (post) for (const w of want) if (!b.some((x) => x.name === w.name)) fail(`after deploy: binding ${w.name} missing`);
    const obs = settings.result?.observability;
    if (post && obs?.enabled) fail("after deploy: observability/logs still enabled");
    if (obs) info(`observability enabled: ${!!obs.enabled}`);
  }
  const sub = await api(env, `${A}/workers/scripts/${EXPECT.worker}/subdomain`);
  if (sub.ok) info(`workers.dev enabled: ${!!sub.result?.enabled}`);
  const doms = await all(env, `${A}/workers/domains?service=${EXPECT.worker}`);
  if (doms.ok && doms.result.length) fail(`Worker has custom domains attached: ${doms.result.map((d) => d.hostname).join(", ")}`);
  else if (doms.ok) info("custom domains on Worker: none");
  else info(`custom domains: not readable with this token (${doms.status ?? ""}) - zone routes cannot be verified without zone access (by design)`);

  // R2 bucket must exist, be private (no r2.dev, no custom domain) and contain only POC objects.
  const bk = await api(env, `${A}/r2/buckets/${EXPECT.bucket}`);
  if (!bk.ok) fail(`R2 bucket ${EXPECT.bucket} not readable / not found (${bk.status} ${bk.errors}) - refusing to create one`);
  else info(`bucket: ${EXPECT.bucket} location=${bk.result?.location ?? "?"} storage_class=${bk.result?.storage_class ?? "?"}`);
  const buckets = await all(env, `${A}/r2/buckets`);
  if (buckets.ok) { const extra = buckets.result.map((x) => x.name).filter((n) => n.startsWith("innerdwes-media") && n !== EXPECT.bucket); if (extra.length) fail(`unexpected POC-like buckets exist: ${extra.join(", ")}`); info(`buckets in account: ${buckets.result.length}`); }
  const dev = await api(env, `${A}/r2/buckets/${EXPECT.bucket}/domains/managed`);
  if (!dev.ok) fail(`cannot read r2.dev public-URL state (${dev.status} ${dev.errors})`);
  else if (dev.result?.enabled) fail("bucket r2.dev public URL is ENABLED - bucket must be private (owner disables it in the dashboard)");
  else info("bucket r2.dev public URL: disabled");
  const cd = await api(env, `${A}/r2/buckets/${EXPECT.bucket}/domains/custom`);
  if (!cd.ok) fail(`cannot read bucket custom domains (${cd.status} ${cd.errors})`);
  else if ((cd.result?.domains ?? []).length) fail(`bucket has custom domains: ${(cd.result.domains).map((d) => d.domain).join(", ")}`);
  else info("bucket custom domains: none");
  const objs = await api(env, `${A}/r2/buckets/${EXPECT.bucket}/objects?per_page=1000`);
  if (objs.ok) { const keys = (objs.result ?? []).map((o) => o.key); const foreign = keys.filter((k) => !/^[0-9a-f-]{36}\/(teachAudioFile|audioFile)\//.test(k)); info(`bucket objects: ${keys.length}${keys.length >= 1000 ? "+" : ""}`); if (foreign.length) fail(`bucket contains non-POC objects (${foreign.length}), e.g. ${foreign[0].slice(0, 40)}`); }
  else info(`bucket object listing not available via API (${objs.status}); seed step lists via wrangler`);

  // KV / Queue: report presence (created by provision.sh if absent).
  const kvs = await all(env, `${A}/storage/kv/namespaces`);
  if (kvs.ok) { const n = kvs.result.find((x) => x.title === EXPECT.kv); info(`KV ${EXPECT.kv}: ${n ? "exists" : "absent (would be created)"}`); if (n && kvId && !kvId.startsWith("REPLACE") && n.id !== kvId) fail(`KV id in wrangler.toml does not match ${EXPECT.kv}`); }
  else fail(`cannot list KV namespaces (${kvs.status ?? ""})`);
  const qs = await all(env, `${A}/queues`);
  if (qs.ok) { const q = qs.result.find((x) => x.queue_name === EXPECT.queue); info(`Queue ${EXPECT.queue}: ${q ? "exists" : "absent (would be created)"}`); if (q) { const cons = (q.consumers ?? []).filter((c) => (c.script ?? c.service) !== EXPECT.worker); if (cons.length) fail(`Queue has a consumer other than ${EXPECT.worker}`); } }
  else fail(`cannot list Queues (${qs.status ?? ""})`);
}

// ---- CLI ----------------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode = "config", ...rest] = process.argv.slice(2);
  refuseEnvArgs(rest);
  console.log(`POC target guard (${mode}) - expected Worker ${EXPECT.worker}, bucket ${EXPECT.bucket}`);
  const { kvId } = checkConfig();
  if (mode === "remote") await checkRemote({ post: rest.includes("--post"), kvId });
  if (problems.length) { console.error("STOP - mismatches:\n" + problems.map((p) => "  ✘ " + p).join("\n")); process.exit(1); }
  console.log("OK - all checks match the approved mapping");
}
