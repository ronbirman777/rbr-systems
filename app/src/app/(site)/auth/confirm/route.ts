import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";
import { setRecoveryFlowCookie } from "@/lib/supabase/recovery";

const SUPPORTED_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type EmailOtpType = (typeof SUPPORTED_OTP_TYPES)[number];

function isSupportedOtpType(value: string | null): value is EmailOtpType {
  return !!value && (SUPPORTED_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Where the confirmation link in a signup email actually lands - see
 * signUp()'s emailRedirectTo - and, since Task 012, where the password
 * recovery email link lands too (`resetPasswordForEmail`'s `redirectTo`,
 * see (auth)/recoveryActions.ts). Supabase's email template must point
 * here with `token_hash` and `type` params.
 *
 * Correction to this file's own previous comment: allow-listing this
 * redirect URL in Supabase Auth settings does NOT by itself make the
 * default `{{ .ConfirmationURL }}` template variable deliver `token_hash`
 * here - `{{ .ConfirmationURL }}` is Supabase's own hosted verification
 * redirect and can hand back `code`/fragment data this route does not
 * consume. The email template's anchor must explicitly use
 * `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` (or
 * `&type=signup` for the signup template) for this route's contract to
 * actually receive anything - template and callback must agree. This is
 * a required hosted-configuration prerequisite, not verified or changed
 * by this task (see TASK-012-IMPLEMENTATION-REPORT.md).
 *
 * verifyOtp() both confirms the token AND establishes a real session
 * (cookies written via the same server client every other route uses).
 * For `type=recovery`, that session belongs to whichever account the
 * token was actually issued for - never the browser's prior session, if
 * any (Supabase's own verifyOtp behavior, not something this route
 * layers on) - so binding the recovery-flow-context cookie to
 * `data.user.id` from THIS verifyOtp response, not any previously-known
 * id, is what prevents a signed-in browser silently reusing its own
 * identity for someone else's reset link.
 *
 * `next` is attacker-influenceable (it's a URL query param, and this link
 * is emailed out): validated via safeInternalRedirectPath for the
 * non-recovery case so a tampered value can never send a freshly-
 * authenticated visitor's browser off this site. Recovery success
 * deliberately ignores `next` entirely and always lands on the fixed
 * `/reset-password` destination - a recovery link must never be usable
 * as an open redirect to an attacker-chosen internal path either.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const isRecoveryAttempt = rawType === "recovery";
  const next = safeInternalRedirectPath(searchParams.get("next"), "/create");

  if (tokenHash && isSupportedOtpType(rawType)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: rawType, token_hash: tokenHash });
    if (!error) {
      if (rawType === "recovery") {
        if (data.user) await setRecoveryFlowCookie(data.user.id);
        return sensitiveRedirect(new URL("/reset-password", origin));
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Missing token, an unsupported/unrecognized `type` value, a tampered
  // token, an expired/already-used link, or a provider error-query-param
  // callback (e.g. `?error=...&error_description=...` instead of
  // `token_hash`/`type`, which this route never reads or renders) all
  // fail the same safe way: no session is established, nothing is
  // reported as success, and a recovery-flavored attempt (any `type=
  // recovery` request, even one this route otherwise couldn't act on) is
  // routed to the request-a-new-link screen rather than the unrelated
  // signup confirmation-error notice.
  if (isRecoveryAttempt) {
    return sensitiveRedirect(new URL("/forgot-password?recoveryError=1", origin));
  }
  return NextResponse.redirect(new URL("/log-in?confirmError=1", origin));
}

/** Sensitive callback responses (recovery success/failure) get no-store
 * caching and no-referrer so the token-bearing request URL is never
 * cached or leaked via a Referer header on whatever the destination page
 * links to next. */
function sensitiveRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
