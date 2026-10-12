#!/usr/bin/env node
/**
 * TASK 032.5 POC - seed SYNTHETIC audio into the POC bucket innerdwes-media-poc and print device-test links.
 * Runs scripts/guard.mjs (remote, read-only) first and stops on any mismatch.
 * Two synthetic tenants (A, B) that exist ONLY in the POC bucket (no Supabase rows, no real customer data).
 * Writes ~/.config/innerdwes/poc-fixtures.json (object keys + tenant ids; no secrets).
 * Prints player links that carry a 3-hour POC mint-session token scoped to tenant A only (it cannot fetch bytes
 * itself and can only mint <=15-min playback tokens for tenant A's objects).
 *
 *   node scripts/seed.mjs <audio dir from make-test-audio.sh> https://innerdwes-media-poc.<subdomain>.workers.dev [--only=a60m4a,...]
 * --only restricts the upload (and the printed links) to the listed fixture ids; already-seeded ids are never re-uploaded.
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EXPECT } from "./guard.mjs";

const [AUDIO, BASE] = process.argv.slice(2);
if (!AUDIO || !/^https:\/\/innerdwes-media-poc\.[a-z0-9-]+\.workers\.dev$/.test(BASE ?? "")) throw new Error("usage: seed.mjs <audioDir> https://innerdwes-media-poc.<sub>.workers.dev");
const extra = process.argv.slice(4);
if (extra.some((a) => a.startsWith("--env") || a.startsWith("--name"))) throw new Error("REFUSING: --env/--name not allowed");
const ONLY = extra.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
const here = decodeURIComponent(new URL("..", import.meta.url).pathname);
execFileSync("node", [join(here, "scripts/guard.mjs"), "remote"], { stdio: "inherit" }); // throws (non-zero) on any mismatch
const cfg = join(homedir(), ".config/innerdwes");
const credFile = process.env.CF_ENV_FILE ?? join(cfg, "cf-staging.env");
const cred = Object.fromEntries(readFileSync(credFile, "utf8").split("\n").filter((l) => /^CLOUDFLARE_(ACCOUNT_ID|API_TOKEN)=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const childEnv = { ...process.env, ...cred, WRANGLER_SEND_METRICS: "false", CLOUDFLARE_ENV: "", WRANGLER_ENV: "" };
const { KEYS } = JSON.parse(readFileSync(join(cfg, "poc-keys.json"), "utf8"));
const fixturesFile = join(cfg, "poc-fixtures.json");
const fx = existsSync(fixturesFile) ? JSON.parse(readFileSync(fixturesFile, "utf8")) : { TA: randomUUID(), TB: randomUUID(), objects: {} };
const key = (t, folder, kind, ext) => `${t}/${folder}/${randomUUID()}/${randomUUID()}/${kind}.${ext}`;
const plan = {
  a60m4a: [fx.TA, "teachAudioFile", "published", "m4a", "marker-60min.m4a", "audio/mp4"],
  a5m4a: [fx.TA, "audioFile", "published", "m4a", "marker-5min.m4a", "audio/mp4"],
  a5wav: [fx.TA, "audioFile", "published", "wav", "marker-5min.wav", "audio/wav"],
  aDraft: [fx.TA, "audioFile", "draft", "m4a", "marker-5min.m4a", "audio/mp4"],
  b5m4a: [fx.TB, "audioFile", "published", "m4a", "marker-5min.m4a", "audio/mp4"],
};
if (ONLY?.some((id) => !plan[id])) throw new Error(`unknown fixture id in --only (known: ${Object.keys(plan).join(", ")})`);
for (const [id, [t, folder, kind, ext, file, ct]] of Object.entries(plan)) {
  if (fx.objects[id] || (ONLY && !ONLY.includes(id))) continue;
  const k = key(t, folder, kind, ext);
  execFileSync("npx", ["--no-install", "wrangler", "r2", "object", "put", `${EXPECT.bucket}/${k}`, "--remote", "--file", join(AUDIO, file), "--content-type", ct], { cwd: here, env: childEnv, stdio: ["ignore", "ignore", "inherit"] });
  fx.objects[id] = k;
  writeFileSync(fixturesFile, JSON.stringify(fx, null, 2), { mode: 0o600 });
}
const now = Math.floor(Date.now() / 1000);
const kid = Object.keys(KEYS)[0];
const head = `v1.${kid}.${Buffer.from(JSON.stringify({ t: fx.TA, k: "", kd: "pub", ia: now, x: now + 3 * 3600, ep: now, n: randomBytes(12).toString("hex"), s: "poc-mint" })).toString("base64url")}`;
const ps = `${head}.${createHmac("sha256", Buffer.from(KEYS[kid], "base64url")).update(head).digest("base64url")}`;
console.log("Seeded (synthetic): ", Object.keys(fx.objects).join(", "));
console.log("\nDevice test links (valid 3 h, tenant A only):");
for (const id of ["a60m4a", "a5m4a", "a5wav"].filter((i) => fx.objects[i])) console.log(`  ${id}: ${BASE}/poc/player?ps=${encodeURIComponent(ps)}&k=${encodeURIComponent(fx.objects[id])}`);
