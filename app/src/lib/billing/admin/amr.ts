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
