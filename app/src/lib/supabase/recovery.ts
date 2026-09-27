import { cookies } from "next/headers";

/**
 * Task 012: a small, short-lived flow-context marker - NOT a security
 * boundary and NOT a replacement for Supabase's own session. The real
 * authorization for every recovery action is still `getUser()` against
 * the real Supabase session cookies (see server.ts); this cookie only
 * answers a UX question the session alone cannot: "did this exact
 * session just arrive via a verified recovery link, or is it an
 * ordinary already-signed-in session that happens to have navigated to
 * /reset-password directly?" Without it, /reset-password would silently
 * become generic "change my password" account settings for any signed-in
 * visitor - explicitly out of this task's scope.
 *
 * Storing the verified user's id (a UUID, not sensitive - the same kind
 * of identifier already used as a public tenant id everywhere in this
 * app) is an unsigned marker, not cryptographic proof: it is only ever
 * compared against the CURRENT session's own `getUser().id`, so a
 * forged/replayed cookie cannot let anyone act as a user their real
 * Supabase session doesn't already authenticate as - at most it could let
 * an already-signed-in visitor reach the update FORM for their own
 * account without having actually clicked a fresh email link, which is
 * not a privilege escalation (updateUser() still only ever changes the
 * caller's own authenticated account).
 *
 * Same cookie conventions used everywhere else in this app (preview-gate,
 * Supabase SSR itself): HttpOnly, SameSite=Lax, Secure only in
 * production (parity with local http:// dev), host-only (no `domain`
 * attribute - never set one here).
 */
export const RECOVERY_COOKIE_NAME = "idw_recovery_uid";

/** Short-lived on purpose - a recovery flow should be completed in one
 * sitting shortly after the email link is clicked, not resumed later. */
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 60 * 15;

function recoveryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function setRecoveryFlowCookie(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE_NAME, userId, {
    ...recoveryCookieOptions(),
    maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearRecoveryFlowCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(RECOVERY_COOKIE_NAME);
}

/** True only when the current recovery-flow cookie names exactly this
 * user id - never used on its own as authorization, only ever alongside
 * a fresh `getUser()` check against the real session. */
export async function hasRecoveryFlowContext(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(RECOVERY_COOKIE_NAME)?.value === userId;
}
