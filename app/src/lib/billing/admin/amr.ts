/**
 * Pure helpers over the verified JWT claims Supabase Auth issues. The `amr`
 * claim lists how the session authenticated and WHEN: after a TOTP check it
 * contains {method: "totp", timestamp: <unix seconds>}. That timestamp is what
 * makes "recent MFA" (step-up) enforceable without any home-grown token.
 */
export type AuthClaimsLike = {
  aal?: unknown;
  amr?: unknown;
};

/**
 * AAL2 for Admin = the verified JWT says `aal2` AND its `amr` records a TOTP verification. Admin MFA is TOTP only
 * (step-up reads the TOTP timestamp), so an aal2 session reached by any other method, or a malformed claim set
 * without the amr entry, is not accepted as Admin MFA and is sent to the code prompt instead (fail closed).
 * The values are read only from the signature-verified JWT (getClaims), never from client-writable metadata.
 */
export function isAal2(claims: AuthClaimsLike | null | undefined): boolean {
  return claims?.aal === "aal2" && latestTotpTimestamp(claims) != null;
}

/** Unix-seconds timestamp of the most recent TOTP verification in this session, or null. */
export function latestTotpTimestamp(claims: AuthClaimsLike | null | undefined): number | null {
  if (!Array.isArray(claims?.amr)) return null;
  let latest: number | null = null;
  for (const entry of claims!.amr as unknown[]) {
    const e = entry as { method?: unknown; timestamp?: unknown };
    if (e?.method === "totp" && typeof e.timestamp === "number" && Number.isFinite(e.timestamp)) {
      latest = latest == null ? e.timestamp : Math.max(latest, e.timestamp);
    }
  }
  return latest;
}

/** True when the last TOTP verification is no older than maxAgeSeconds (and not in the future beyond clock skew). */
export function hasRecentMfa(claims: AuthClaimsLike | null | undefined, now: Date, maxAgeSeconds: number): boolean {
  const ts = latestTotpTimestamp(claims);
  if (ts == null) return false;
  const age = now.getTime() / 1000 - ts;
  return age >= -60 && age <= maxAgeSeconds;
}

/** The fields of a Supabase Auth MFA factor this module needs (Auth Admin API `mfa.listFactors`). */
export type FactorLike = { id: string; factor_type: string; status: string; created_at: string };

/**
 * Does a STILL-EXISTING verified TOTP factor back this session's MFA?
 *
 * Supabase's `amr` entries carry only `{ method, timestamp }` (auth-js `AMREntry`), not the factor id, so the link
 * between the session and a factor is established by time: the session's latest TOTP verification must have happened
 * at or after the creation of a factor that is verified NOW. That rejects (a) a session whose only factor was removed,
 * and (b) a session from a removed factor when the account later enrolled a NEW factor (created after the
 * verification). If a future Auth version adds a factor id to the amr entry (`factor_id`), it is matched exactly.
 * Residual (documented): with two factors, removing the one that verified this session is not detected while the
 * other, older factor still exists. Both timestamps come from the same Auth server clock, so the tolerance is only
 * `skewSeconds` (default 5 s, for second rounding).
 */
export function factorBacksSession(claims: AuthClaimsLike | null | undefined, factors: FactorLike[] | null | undefined, skewSeconds = 5): boolean {
  const ts = latestTotpTimestamp(claims);
  if (ts == null || !Array.isArray(factors)) return false;
  const verified = factors.filter((f) => f?.factor_type === "totp" && f.status === "verified");
  if (!verified.length) return false;
  const ids = new Set<string>();
  for (const e of (Array.isArray(claims?.amr) ? (claims!.amr as unknown[]) : [])) {
    const id = (e as { method?: unknown; factor_id?: unknown })?.method === "totp" ? (e as { factor_id?: unknown }).factor_id : undefined;
    if (typeof id === "string") ids.add(id);
  }
  if (ids.size) return verified.some((f) => ids.has(f.id));
  return verified.some((f) => {
    const created = Date.parse(f.created_at) / 1000;
    return Number.isFinite(created) && created <= ts + skewSeconds;
  });
}

export function hasVerifiedTotp(factors: FactorLike[] | null | undefined): boolean {
  return Array.isArray(factors) && factors.some((f) => f?.factor_type === "totp" && f.status === "verified");
}
