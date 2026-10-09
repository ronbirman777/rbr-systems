"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminForMfaPages } from "@/lib/billing/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";

/**
 * Authenticator-app (TOTP) MFA through Supabase Auth's own implementation. InnerDweS never generates, stores or
 * checks an OTP secret itself: the provider holds the factor, verifies the code, and issues the AAL2 session whose
 * `amr` claim carries the verification timestamp used for step-up. Only an authenticated user who is ALREADY
 * authorised in admin_users can reach these actions (a stranger cannot even enrol a factor against Admin).
 */
export type EnrollState = { ok: true; factorId: string; qrSvg: string; secret: string } | { ok: false; error: string };
export type VerifyState = { ok: false; error: string } | null;

const code = z.string().trim().regex(/^\d{6}$/);

export async function startMfaEnrollmentAction(): Promise<EnrollState> {
  await requireAdminForMfaPages();
  const supabase = await createClient();
  // A previous abandoned (unverified) enrolment would otherwise collide on the friendly name.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `InnerDweS Admin ${Date.now()}` });
  if (error || !data) return { ok: false, error: "enroll_failed" };
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** First code of a new factor: marks it verified AND upgrades this session to AAL2. */
export async function completeMfaEnrollmentAction(factorId: string, _prev: VerifyState, fd: FormData): Promise<VerifyState> {
  await requireAdminForMfaPages();
  const parsed = code.safeParse(fd.get("code"));
  if (!parsed.success || !z.string().uuid().safeParse(factorId).success) return { ok: false, error: "invalid_code" };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
  if (error) return { ok: false, error: "invalid_code" };
  redirect("/admin/billing");
}

/** Sign-in challenge AND step-up share this: verifying a fresh code refreshes the session's TOTP timestamp. */
export async function verifyMfaAction(next: string, _prev: VerifyState, fd: FormData): Promise<VerifyState> {
  await requireAdminForMfaPages();
  const parsed = code.safeParse(fd.get("code"));
  if (!parsed.success) return { ok: false, error: "invalid_code" };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) redirect("/admin/mfa/enroll");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data });
  if (error) return { ok: false, error: "invalid_code" };
  redirect(safeInternalRedirectPath(next, "/admin/billing"));
}
