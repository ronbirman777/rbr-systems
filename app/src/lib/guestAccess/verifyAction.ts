"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";
import { deriveRequestIpHmac } from "./ipHmac";
import { guestAccessCookieName, signGuestAccessToken, GUEST_ACCESS_COOKIE_MAX_AGE_SECONDS } from "./cookieToken";

export type VerifyGuestCodeState = { error: string | null; success: boolean };

export const verifyGuestCodeInitialState: VerifyGuestCodeState = { error: null, success: false };

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
 *   2. per-IP throttle
 *   3. code verification
 *   4. cookie issuance
 * A Space that isn't publicly available never gets to the code check at
 * all, regardless of what mode it's configured for - a lapsed Space's
 * code cannot be used to route around the commercial gate.
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

  const admin = createAdminClient();
  const ipHmac = await deriveRequestIpHmac();

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
