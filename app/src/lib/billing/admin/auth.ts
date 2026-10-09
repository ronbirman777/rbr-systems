import "server-only";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_STEP_UP_MAX_AGE_SECONDS } from "../constants";
import { hasRecentMfa, isAal2 } from "./amr";

/**
 * Admin authorization - three independent, server-side gates, ALL required:
 *
 *   1. AUTHENTICATED  a real, verified session (getClaims verifies the JWT
 *                     signature; nothing is read from client-writable metadata).
 *   2. AUTHORIZED     a row in admin_users (RLS: no policies, service-role only;
 *                     an ordinary user cannot read it, let alone grant themselves
 *                     a row). Not an email string, not profile data, not a hidden
 *                     URL, not an environment switch.
 *   3. MFA            the session must be AAL2 (an authenticator-app TOTP was
 *                     verified in THIS session). Dangerous actions additionally
 *                     need a TOTP verified within ADMIN_STEP_UP_MAX_AGE_SECONDS.
 *
 * Fail closed: any error resolving any gate is a denial. Every Admin server
 * action calls requireAdminAction() itself - hiding a link or a page is never the
 * protection.
 */

export type AdminRole = "owner" | "billing_admin";
export type AdminContext = {
  userId: string;
  email: string | null;
  role: AdminRole;
  /** Correlation id stamped on every audit row this context writes. Test harnesses set a `qa032…` value so their entries are identifiable. */
  requestId?: string;
};

export type AdminDenial =
  | "unauthenticated"
  | "not_admin"
  | "mfa_enroll_required"
  | "mfa_challenge_required"
  | "step_up_required";

export class AdminAuthError extends Error {
  constructor(public readonly denial: AdminDenial) {
    super(denial);
    this.name = "AdminAuthError";
  }
}

async function resolveAdmin(opts: { recentMfa: boolean }): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as ({ sub?: string; email?: string; aal?: unknown; amr?: unknown }) | undefined;
  if (error || !claims?.sub) throw new AdminAuthError("unauthenticated");

  // Gate 2: server-controlled authorization (service role, never RLS-weakened).
  const db = createAdminClient();
  const { data: row, error: rowErr } = await db.from("admin_users").select("role, disabled_at").eq("user_id", claims.sub).maybeSingle();
  if (rowErr || !row || row.disabled_at) throw new AdminAuthError("not_admin");

  // Gate 3: MFA assurance.
  if (!isAal2(claims)) {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasVerifiedTotp = (factors?.totp ?? []).some((f) => f.status === "verified");
    throw new AdminAuthError(hasVerifiedTotp ? "mfa_challenge_required" : "mfa_enroll_required");
  }
  if (opts.recentMfa && !hasRecentMfa(claims, new Date(), ADMIN_STEP_UP_MAX_AGE_SECONDS)) throw new AdminAuthError("step_up_required");

  return { userId: claims.sub, email: claims.email ?? null, role: row.role as AdminRole };
}

/** For server actions / route handlers: throws AdminAuthError (callers turn it into a safe error result). */
export async function requireAdminAction(opts: { recentMfa?: boolean } = {}): Promise<AdminContext> {
  return resolveAdmin({ recentMfa: !!opts.recentMfa });
}

/**
 * For pages and layouts. A signed-out visitor is sent to log in; a signed-in
 * NON-admin gets a plain 404 (the Admin area does not advertise its existence);
 * an admin without MFA is sent to enrol/verify - and never sees Admin content
 * in between.
 */
export async function requireAdminPage(opts: { recentMfa?: boolean } = {}): Promise<AdminContext> {
  try {
    return await resolveAdmin({ recentMfa: !!opts.recentMfa });
  } catch (e) {
    if (!(e instanceof AdminAuthError)) throw e;
    switch (e.denial) {
      case "unauthenticated": redirect("/log-in?next=/admin");
      case "not_admin": notFound();
      case "mfa_enroll_required": redirect("/admin/mfa/enroll");
      case "mfa_challenge_required": redirect("/admin/mfa/verify");
      case "step_up_required": redirect("/admin/mfa/verify?stepup=1");
    }
  }
}

/**
 * The MFA pages themselves need a different gate: an authenticated, authorized
 * admin who is NOT yet AAL2 (that is the whole point of them). Returns who they
 * are; never exposes any Admin data.
 */
export async function requireAdminForMfaPages(): Promise<{ userId: string; email: string | null; aal2: boolean }> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as ({ sub?: string; email?: string; aal?: unknown }) | undefined;
  if (error || !claims?.sub) redirect("/log-in?next=/admin");
  const db = createAdminClient();
  const { data: row, error: rowErr } = await db.from("admin_users").select("disabled_at").eq("user_id", claims.sub).maybeSingle();
  if (rowErr || !row || row.disabled_at) notFound();
  return { userId: claims.sub, email: claims.email ?? null, aal2: isAal2(claims) };
}
