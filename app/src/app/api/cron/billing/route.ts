import { timingSafeEqual } from "node:crypto";
import { BILLING_ENV, getBillingDeps, getEmailSender, isStripeConfigured } from "@/lib/billing/deps.server";
import { runBillingJobs } from "@/lib/billing/lifecycleJob";

/**
 * The scheduled billing job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Fails CLOSED: with no CRON_SECRET configured nothing can ever authorise a run,
 * and a wrong/missing token gets 401 before any work happens. Safe to run at any
 * frequency (every step is idempotent - see lifecycleJob.ts).
 */
function authorised(request: Request): boolean {
  const secret = process.env[BILLING_ENV.cronSecret];
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: Request) {
  if (!process.env[BILLING_ENV.cronSecret]) return new Response("cron not configured", { status: 503 });
  if (!authorised(request)) return new Response("unauthorized", { status: 401 });
  if (!isStripeConfigured()) return Response.json({ skipped: "stripe not configured" });
  const report = await runBillingJobs(getBillingDeps(), getEmailSender());
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}

export const GET = run;
export const POST = run;
