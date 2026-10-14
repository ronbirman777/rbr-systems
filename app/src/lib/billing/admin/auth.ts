import "server-only";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_STEP_UP_MAX_AGE_SECONDS } from "../constants";
import { factorBacksSession, hasRecentMfa, hasVerifiedTotp, isAal2, latestTotpTimestamp, type FactorLike } from "./amr";

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

export const ADMIN_ROLES = ["owner", "billing_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
/** Sections and actions only the owner may reach (spec §9). A billing_admin gets the same plain 404 as a non-admin. */
export const OWNER_ONLY: readonly AdminRole[] = ["owner"];

export type AdminGateOptions = {
  /** Require a TOTP verified within ADMIN_STEP_UP_MAX_AGE_SECONDS (dangerous actions). */
  recentMfa?: boolean;
  /**
   * Restrict to these roles. Omitted = any active admin (owner or billing_admin): the behaviour every billing page and
   * action had before roles existed, unchanged. An empty list admits nobody (fail closed on a misconfiguration).
   */
  roles?: readonly AdminRole[];
};
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
  /** An active admin whose role is not allowed here. Rendered exactly like not_admin (404), never as a 403 or a redirect. */
  | "role_forbidden"
  | "mfa_enroll_required"
  | "mfa_challenge_required"
  | "step_up_required";

export class AdminAuthError extends Error {
  constructor(public readonly denial: AdminDenial) {
    super(denial);
    this.name = "AdminAuthError";
  }
}

function isAdminRole(v: unknown): v is AdminRole {
  return typeof v === "string" && (ADMIN_ROLES as readonly string[]).includes(v);
}

type AdminDb = ReturnType<typeof createAdminClient>;

/**
 * The user's MFA factors read FRESH from the Auth server with the service role (Auth Admin API), never from the
 * session/JWT. null = the lookup failed (callers fail closed).
 */
async function freshFactors(db: AdminDb, userId: string): Promise<FactorLike[] | null> {
  try {
    const { data, error } = await db.auth.admin.mfa.listFactors({ userId });
    if (error || !data || !Array.isArray(data.factors)) return null;
    return data.factors as FactorLike[];
  } catch {
    return null;
  }
}

/**
 * Page reads re-check the factor list too, with a SHORT positive-only cache: a factor removal stops authorizing page
 * reads within FACTOR_CACHE_MS (instead of the JWT's ~1 h lifetime), at the cost of at most one Auth Admin API call
 * per admin session per minute per server instance. Negative or failed results are never cached. Mutations and
 * step-up never use the cache.
 */
export const FACTOR_CACHE_MS = 60_000;
const factorCache = new Map<string, number>();
function cacheKey(claims: { sub?: string; session_id?: unknown; amr?: unknown }): string {
  return `${claims.sub}:${String(claims.session_id ?? "")}:${latestTotpTimestamp(claims) ?? ""}`;
}
/** Test hook: forget cached factor checks. */
export function __resetFactorCacheForTests() { factorCache.clear(); }

async function resolveAdmin(opts: { recentMfa: boolean; roles?: readonly AdminRole[]; kind: "page" | "action" }): Promise<AdminContext> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as ({ sub?: string; email?: string; aal?: unknown; amr?: unknown; session_id?: unknown }) | undefined;
  if (error || !claims?.sub) throw new AdminAuthError("unauthenticated");

  // Gate 2: server-controlled authorization (service role, never RLS-weakened).
  const db = createAdminClient();
  const { data: row, error: rowErr } = await db.from("admin_users").select("role, disabled_at").eq("user_id", claims.sub).maybeSingle();
  if (rowErr || !row || row.disabled_at) throw new AdminAuthError("not_admin");
  // A role value this code does not know (a future role, a bad write) is no role at all: fail closed.
  if (!isAdminRole(row.role)) throw new AdminAuthError("not_admin");

  // Gate 2b: role. Checked BEFORE MFA: a second factor can never cure a role mismatch, so a billing_admin asking for an
  // owner-only section gets the same 404 a stranger gets, without first being walked through a code prompt.
  if (opts.roles && !opts.roles.includes(row.role)) throw new AdminAuthError("role_forbidden");

  // Gate 3: MFA assurance. The JWT must say aal2 AND carry the TOTP verification in its amr (isAal2) ...
  if (!isAal2(claims)) {
    const factors = await freshFactors(db, claims.sub);
    throw new AdminAuthError(hasVerifiedTotp(factors) ? "mfa_challenge_required" : "mfa_enroll_required");
  }
  // ... and step-up needs a TOTP within the window ...
  if (opts.recentMfa && !hasRecentMfa(claims, new Date(), ADMIN_STEP_UP_MAX_AGE_SECONDS)) throw new AdminAuthError("step_up_required");
  // ... and a factor that STILL EXISTS must back that AAL2 (an AAL2 JWT outlives the removal of its factor until it
  // expires). Every server action and every step-up checks fresh; page reads may use the short positive cache.
  const key = cacheKey(claims);
  const cachedUntil = factorCache.get(key);
  const useCache = opts.kind === "page" && !opts.recentMfa;
  if (!(useCache && cachedUntil && cachedUntil > Date.now())) {
    const factors = await freshFactors(db, claims.sub);
    if (!factorBacksSession(claims, factors)) {
      factorCache.delete(key);
      if (opts.recentMfa) throw new AdminAuthError("step_up_required");
      throw new AdminAuthError(hasVerifiedTotp(factors) ? "mfa_challenge_required" : "mfa_enroll_required");
    }
    if (useCache) {
      if (factorCache.size > 1000) factorCache.clear();
      factorCache.set(key, Date.now() + FACTOR_CACHE_MS);
    }
  }

  return { userId: claims.sub, email: claims.email ?? null, role: row.role };
}

/** For server actions / route handlers: throws AdminAuthError (callers turn it into a safe error result). */
export async function requireAdminAction(opts: AdminGateOptions = {}): Promise<AdminContext> {
  return resolveAdmin({ recentMfa: !!opts.recentMfa, roles: opts.roles, kind: "action" });
}

/**
 * For pages and layouts. A signed-out visitor is sent to log in; a signed-in
 * NON-admin gets a plain 404 (the Admin area does not advertise its existence),
 * and so does an admin whose role may not see this section; an admin without
 * MFA is sent to enrol/verify - and never sees Admin content in between.
 */
export async function requireAdminPage(opts: AdminGateOptions = {}): Promise<AdminContext> {
  try {
    return await resolveAdmin({ recentMfa: !!opts.recentMfa, roles: opts.roles, kind: "page" });
  } catch (e) {
    if (!(e instanceof AdminAuthError)) throw e;
    switch (e.denial) {
      case "unauthenticated": redirect("/log-in?next=/admin");
      case "not_admin":
      case "role_forbidden": notFound();
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
  const { data: row, error: rowErr } = await db.from("admin_users").select("role, disabled_at").eq("user_id", claims.sub).maybeSingle();
  if (rowErr || !row || row.disabled_at || !isAdminRole(row.role)) notFound();
  // "aal2" here means: an AAL2 session backed by a factor that still exists (fresh read). Otherwise the MFA pages show
  // their prompt, so a session whose factor was removed is sent to verify/enrol instead of looping back to /admin.
  const aal2 = isAal2(claims) && factorBacksSession(claims, await freshFactors(db, claims.sub));
  return { userId: claims.sub, email: claims.email ?? null, aal2 };
}
