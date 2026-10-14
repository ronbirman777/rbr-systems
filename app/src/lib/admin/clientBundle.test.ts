import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * After `next build`, no client chunk may contain a server-only environment variable NAME, and none may contain the
 * VALUE of any non-public variable from the local env file (batches doc: "A test greps the client bundle for the env
 * names"). Skipped when there is no build output. Failures report the variable NAME only, never a value.
 */
const STATIC = join(process.cwd(), ".next/static");
const HAS_BUILD = existsSync(STATIC);

const SERVER_ENV_NAMES = [
  "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "GUEST_ACCESS_TOKEN_SECRET",
  "GUEST_ACCESS_IP_HMAC_SECRET", "INNERDWES_PREVIEW_PASSWORD", "CRON_SECRET", "RESEND_API_KEY", "BILLING_EMAIL_FROM",
  // proposed watchdog/dashboard credentials (Batch 3+): must never be client-visible
  "CLOUDFLARE_WATCHDOG_KV_READ_TOKEN", "WATCHDOG_KV_NAMESPACE_ID", "CLOUDFLARE_ACCOUNT_ID", "VERCEL_TARGET_ENV",
];

function chunks(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? chunks(p) : /\.(js|css|json|txt|map)$/.test(f) ? [p] : [];
  });
}

describe.skipIf(!HAS_BUILD)("client bundle carries no server secrets", () => {
  const blob = HAS_BUILD ? chunks(STATIC).map((f) => readFileSync(f, "utf8")).join("\n") : "";
  it("no server-only env variable NAME appears in .next/static", () => {
    expect(blob.length).toBeGreaterThan(0);
    expect(SERVER_ENV_NAMES.filter((n) => blob.includes(n))).toEqual([]);
  });
  it("no VALUE of a non-public local env variable appears in .next/static", () => {
    const envFile = join(process.cwd(), ".env.local");
    if (!existsSync(envFile)) return;
    const leaked: string[] = [];
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || m[1].startsWith("NEXT_PUBLIC_")) continue;
      const v = m[2].trim().replace(/^"|"$/g, "");
      if (v.length >= 12 && blob.includes(v)) leaked.push(m[1]);
    }
    expect(leaked).toEqual([]);
  });
  it("console-only strings (watchdog adapter internals, reason codes) are not in client chunks", () => {
    expect(blob.includes("notConnectedWatchdogSource")).toBe(false);
    expect(blob.includes("admin_metric_snapshots")).toBe(false);
  });
});
