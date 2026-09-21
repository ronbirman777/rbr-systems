"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";
import { deriveRequestIpHmac } from "./ipHmac";
import { guestAccessCookieName, signGuestAccessToken, GUEST_ACCESS_COOKIE_MAX_AGE_SECONDS } from "./cookieToken";
import type { VerifyGuestCodeState } from "./verifyActionState";

// This file has "use server" at module scope, so every export from it must
// be an async function (Next.js Server Actions constraint) - see
// verifyActionState.ts for why the state type/initial-value pair live
// there instead of here (Task 008C, CRITICAL-1 root-cause fix).

const GENERIC_ERROR = "That code didn't work. Please try again.";
const THROTTLED_ERROR = "Too many attempts. Please wait a few minutes and try again.";

/**
 * The trusted server-side flow (Distribution phase migration review,
 * "Revised guest verification architecture"). The browser never calls
 * verify_guest_access_code or check_and_record_guest_attempt directly -
 * both are revoked from anon/authenticated at the database level, and
 * this Server Action is the only code path with a service-role client
 * that can reach them. Order matters and is fixed:
 *   1. commercial/public availability (existing, authoritative gate)
 *   2. trusted client-IP resolution (must succeed to throttle at all)
 *   3. per-IP throttle
 *   4. code verification
 *   5. cookie issuance
 * A Space that isn't publicly available never gets to the code check at
 * all, regardless of what mode it's configured for - a lapsed Space's
 * code cannot be used to route around the commercial gate.
 *
 * Step 2 fails closed: if no trusted client IP can be established (see
 * ipHmac.ts - on Vercel that means Vercel's own edge header is absent or
 * malformed), the request stops here. Proceeding would either throttle
 * every unidentifiable client as one shared identity or skip throttling
 * entirely, and the per-IP throttle is the only thing standing between a
 * six-digit code and brute force - so no throttle means no verification
 * and no cookie.
 */
export async function verifyGuestCode(
  tenantId: string,
  _prevState: VerifyGuestCodeState,
  formData: FormData
): Promise<VerifyGuestCodeState> {
  const code = String(formData.get("code") ?? "");

  if (!(await isSpacePubliclyAvailable(tenantId))) {
    // Deliberately the same generic message as an incorrect code -
    // never reveal to a guest WHY entry failed (not "this Space isn't
    // commercially active", which would leak organizer billing state).
    return { error: GENERIC_ERROR, success: false };
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return { error: GENERIC_ERROR, success: false };
  }

  let ipHmac: string | null;
  try {
    ipHmac = await deriveRequestIpHmac();
  } catch {
    // Fail closed: an unexpected exception deriving the trusted IP (for
    // example a missing/misconfigured GUEST_ACCESS_IP_HMAC_SECRET) must
    // degrade to the same generic failure as every other rejection path
    // below, never an uncaught crash and never a bypass of the throttle,
    // code verification, or cookie-issuance gates that follow (Task 008C
    // hardening, added alongside the CRITICAL-1 root-cause fix).
    return { error: GENERIC_ERROR, success: false };
  }
  if (ipHmac === null) {
    // Same generic message as an incorrect code - never tell a guest that
    // the failure was about request provenance rather than their code.
    return { error: GENERIC_ERROR, success: false };
  }

  const admin = createAdminClient();

  const { data: allowed, error: throttleError } = await admin.rpc("check_and_record_guest_attempt", {
    p_tenant_id: tenantId,
    p_ip_hmac: ipHmac,
  });
  if (throttleError) {
    // Fail closed - a throttle-check failure must never be treated as
    // "allowed by default".
    return { error: GENERIC_ERROR, success: false };
  }
  if (!allowed) {
    return { error: THROTTLED_ERROR, success: false };
  }

  const { data: version, error: verifyError } = await admin.rpc("verify_guest_access_code", {
    p_tenant_id: tenantId,
    p_code: code,
  });
  if (verifyError || version === null || version === undefined) {
    return { error: GENERIC_ERROR, success: false };
  }

  const token = await signGuestAccessToken(tenantId, version as number);
  const cookieStore = await cookies();
  cookieStore.set(guestAccessCookieName(tenantId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_ACCESS_COOKIE_MAX_AGE_SECONDS,
  });

  return { error: null, success: true };
}
