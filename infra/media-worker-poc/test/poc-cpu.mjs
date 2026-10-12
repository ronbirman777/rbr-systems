#!/usr/bin/env node
/**
 * TASK 032.5 POC - HOSTED CPU measurement for the deployed Worker innerdwes-media-poc (the 60-min synthetic object only).
 * Each scenario runs ALONE inside its own wall-clock minute, so Cloudflare's per-minute workersInvocationsAdaptive
 * rows (max / P50 cpuTime, per status) can be attributed to it. Then the BW Analytics Engine rows for the same minute
 * show what the accounting recorded. Nothing is inferred: rows with no analytics data are reported as missing.
 *
 *   node test/poc-cpu.mjs [label]        writes test-results to $POC_OUT/cpu-<label>.json
 * Total transfer: ~4 full files + ~60 MB of ranges (R2 egress is free). ~60 Worker requests.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = "https://innerdwes-media-poc.ronbirman7.workers.dev";
const LABEL = process.argv[2] ?? "run";
const cfg = join(homedir(), ".config/innerdwes");
const { KEYS } = JSON.parse(readFileSync(join(cfg, "poc-keys.json"), "utf8"));
const FX = JSON.parse(readFileSync(join(cfg, "poc-fixtures.json"), "utf8"));
const cred = Object.fromEntries(readFileSync(join(cfg, "cf-staging.env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const cf = (p, init = {}) => fetch(`https://api.cloudflare.com/client/v4${p}`, { ...init, headers: { Authorization: `Bearer ${cred.CLOUDFLARE_API_TOKEN}`, ...(init.headers || {}) } });
const K = FX.objects.a60m4a, TA = FX.TA, SIZE = 43852309;
const KID = Object.keys(KEYS)[0];
const now = () => Math.floor(Date.now() / 1000);
const tok = () => { const h = `v1.${KID}.${Buffer.from(JSON.stringify({ t: TA, k: K, kd: "pub", ia: now(), x: now() + 900, ep: now(), n: randomBytes(12).toString("hex") })).toString("base64url")}`; return `${h}.${createHmac("sha256", Buffer.from(KEYS[KID], "base64url")).update(h).digest("base64url")}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (headers = {}, signal) => fetch(`${BASE}/o/${K}?tk=${encodeURIComponent(tok())}`, { headers, signal });
// a stream cut off by the server (e.g. exceededResources) is recorded as {cut, n} instead of aborting the probe
const drain = async (r) => { let n = 0; const rd = r.body.getReader(); try { for (;;) { const { value, done } = await rd.read(); if (done) return n; n += value.length; } } catch (e) { return { cut: String(e.cause?.code ?? e.message), n }; } };
const readThenAbort = async (headers, limit) => { const ac = new AbortController(); const r = await get(headers, ac.signal); let n = 0; const rd = r.body.getReader(); try { while (n < limit) { const { value, done } = await rd.read(); if (done) break; n += value.length; } } finally { ac.abort(); } await sleep(1500); return { status: r.status, n }; };
const MB = 1024 * 1024, MID = Math.floor(SIZE / 2);

const scenarios = [
  ["full-file GET x3 (43.85 MB each, 60:00 of audio)", async () => { const o = []; for (let i = 0; i < 3; i++) { const t = Date.now(); const r = await get(); o.push({ status: r.status, bytes: await drain(r), s: (Date.now() - t) / 1000 }); } return o; }],
  ["Safari-style probe bytes=0-1 x10", async () => { const o = []; for (let i = 0; i < 10; i++) { const r = await get({ Range: "bytes=0-1" }); o.push(await drain(r)); } return o; }],
  ["64 KiB seek ranges x10", async () => { const o = []; for (let i = 0; i < 10; i++) { const s = Math.floor((SIZE - 65536) * i / 10); const r = await get({ Range: `bytes=${s}-${s + 65535}` }); o.push(await drain(r)); } return o; }],
  ["1 MiB ranges x10 (~1.4 min audio each)", async () => { const o = []; for (let i = 0; i < 10; i++) { const s = i * MB * 4; const r = await get({ Range: `bytes=${s}-${s + MB - 1}` }); o.push(await drain(r)); } return o; }],
  ["8 MiB ranges x3 (~11 min audio each)", async () => { const o = []; for (let i = 0; i < 3; i++) { const s = i * 8 * MB; const r = await get({ Range: `bytes=${s}-${s + 8 * MB - 1}` }); o.push(await drain(r)); } return o; }],
  ["interrupted: open-ended bytes=MID- aborted after 2 MiB x3 (Chrome-style)", async () => { const o = []; for (let i = 0; i < 3; i++) o.push(await readThenAbort({ Range: `bytes=${MID + i * MB}-` }, 2 * MB)); return o; }],
  ["interrupted: full GET aborted after 20 MiB x1", async () => [await readThenAbort({}, 20 * MB)]],
];

const out = { label: LABEL, scenarios: [] };
for (const [name, fn] of scenarios) {
  if (out.scenarios.length || Date.now() % 60000 > 2000) await sleep(60000 - (Date.now() % 60000) + 300); // every scenario gets its own minute
  const minute = new Date(Date.now() - (Date.now() % 60000)).toISOString().replace(".000Z", "Z");
  const t = Date.now(); let client; try { client = await fn(); } catch (e) { client = [{ error: String(e.cause?.code ?? e.message) }]; }
  if (Date.now() - t > 55000) console.log(`WARN ${name} ran ${(Date.now() - t) / 1000}s - may spill into the next minute`);
  out.scenarios.push({ name, minute, client });
  console.log(`ran  ${minute}  ${name}  ${JSON.stringify(client)}`);
}
const first = out.scenarios[0].minute, last = new Date(Date.parse(out.scenarios.at(-1).minute) + 120000).toISOString();
const q = `query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){w:workersInvocationsAdaptive(limit:500,filter:{datetime_geq:$s,datetime_leq:$u,scriptName:"innerdwes-media-poc"}){sum{requests responseBodySize} max{cpuTime} quantiles{cpuTimeP50 cpuTimeP99} dimensions{datetimeMinute status scriptVersion}}}}}`;
let rows = [];
for (let i = 0; i < 16; i++) {
  await sleep(20000);
  const r = await (await cf("/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: { a: cred.CLOUDFLARE_ACCOUNT_ID, s: first, u: last } }) })).json();
  rows = r?.data?.viewer?.accounts?.[0]?.w ?? [];
  const want = out.scenarios.reduce((n, s) => n + (Array.isArray(s.client) ? s.client.length : 0), 0);
  if (rows.reduce((n, x) => n + x.sum.requests, 0) >= want) break;
}
const sql = async (s) => { const r = await cf(`/accounts/${cred.CLOUDFLARE_ACCOUNT_ID}/analytics_engine/sql`, { method: "POST", body: s }); try { return JSON.parse(await r.text()).data ?? []; } catch { return []; } };
const bw = await sql(`SELECT toStartOfMinute(timestamp) AS m, blob4 AS outcome, blob5 AS mode, count() AS n, SUM(_sample_interval*double1) AS low, SUM(_sample_interval*double4) AS high, SUM(_sample_interval*double2) AS requested FROM innerdwes_media_poc_bw WHERE timestamp >= toDateTime('${first.slice(0, 19).replace("T", " ")}') GROUP BY m, outcome, mode ORDER BY m FORMAT JSON`);
console.log("\nscenario | Worker status | requests | CPU max ms | CPU P50 ms | body bytes (Cloudflare) | BW accounting (AE)");
for (const s of out.scenarios) {
  s.cf = rows.filter((x) => x.dimensions.datetimeMinute === s.minute).map((x) => ({ status: x.dimensions.status, version: x.dimensions.scriptVersion, requests: x.sum.requests, cpuMaxMs: x.max.cpuTime / 1000, cpuP50Ms: x.quantiles.cpuTimeP50 / 1000, cpuP99Ms: x.quantiles.cpuTimeP99 / 1000, bodyBytes: x.sum.responseBodySize }));
  s.bw = bw.filter((x) => x.m.replace(" ", "T").slice(0, 16) === s.minute.slice(0, 16));
  if (!s.cf.length) console.log(`${s.name} | NO ANALYTICS ROW (yet)`);
  for (const c of s.cf) console.log(`${s.name} | ${c.status} | ${c.requests} | ${c.cpuMaxMs.toFixed(2)} | ${c.cpuP50Ms.toFixed(2)} | ${c.bodyBytes} | ${s.bw.map((b) => `${b.outcome}/${b.mode} n=${b.n} low=${b.low} high=${b.high} req=${b.requested}`).join("; ")}`);
}
writeFileSync(join(process.env.POC_OUT ?? ".", `cpu-${LABEL}.json`), JSON.stringify(out, null, 2));
