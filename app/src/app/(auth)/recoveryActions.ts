"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/supabase/authErrors";
import { APP_URL } from "@/lib/site-url";
import { clearRecoveryFlowCookie, hasRecoveryFlowContext } from "@/lib/supabase/recovery";

/**
 * Task 012 - Password Recovery. Two independent Server Actions:
 * `requestPasswordReset` (the /forgot-password form) and `updatePassword`
 * (the /reset-password form), plus `finalizeRecoverySession` for the
 * post-success session cleanup (and its own retry, on a first cleanup
 * failure) - see its own comment for why that has to be a separate step.
 * Neither action accepts or trusts a caller-supplied user id/email for
 * which account to act on - both only ever act on whatever `getUser()`
 * returns for the caller's own real Supabase session.
 */

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RequestResetState = { status: "idle" | "sent" | "error"; message: string | null };

/**
 * Never branches the visible outcome on whether the email is registered -
 * that is the entire point of Supabase's own `resetPasswordForEmail`
 * design (it does not report existence either). Only a genuine
 * infrastructure/rate-limit failure gets a distinct message; every other
 * outcome (including an unrecognized error shape we've never observed
 * for this call) collapses to the same neutral "sent" state rather than
 * risk revealing anything account-specific.
 */
export async function requestPasswordReset(
  _prevState: RequestResetState,
  formData: FormData
): Promise<RequestResetState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email || !EMAIL_SHAPE.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  const supabase = await createClient();

  let errorMessage: string | null = null;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/auth/confirm`,
    });
    if (error) errorMessage = error.message;
  } catch {
    // A thrown (network-level) failure is exactly the same "safe retry,
    // no existence disclosure" case as a returned rate-limit error.
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (lower.includes("rate limit") || lower.includes("unable to validate email")) {
      return { status: "error", message: friendlyAuthError(errorMessage) };
    }
    // Any other error shape: do not surface it distinctly - see the
    // function comment above.
  }

  return { status: "sent", message: null };
}

export type UpdatePasswordState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" }
  | { status: "no_session" };

const MIN_PASSWORD_LENGTH = 8;

/**
 * Deliberately does NOT clear the recovery-flow cookie or sign out here,
 * even though the password change is already fully committed by the
 * time this returns - see `finalizeRecoverySession` below for why that
 * has to happen as a separate, later step rather than inline in this
 * same action.
 */
export async function updatePassword(
  _prevState: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // Never trim/normalize passwords (a leading/trailing space is a
  // legitimate character the user typed on purpose).
  if (!password || !confirmPassword) {
    return { status: "error", message: "Please fill in both password fields." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: "error", message: `Your password needs to be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmPassword) {
    return { status: "error", message: "Those passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "no_session" };

  // The session alone isn't enough - see recovery.ts. An ordinary
  // signed-in visitor who navigated here directly has a valid session
  // but no recovery-flow context, and must not be able to change their
  // password through this page (that would silently repurpose this task
  // as account settings).
  if (!(await hasRecoveryFlowContext(user.id))) {
    return { status: "no_session" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { status: "error", message: friendlyAuthError(error.message) };
  }

  return { status: "success" };
}

/**
 * Task 012, found only by running the real flow in a browser (mocked
 * unit tests cannot see this and gave no warning). Next.js's own docs
 * are explicit: "When you set or delete a cookie in a Server Action,
 * Next.js re-renders the current page and its layouts on the server so
 * the UI reflects the new cookie value" - and this applies to ANY
 * cookie-touching Server Action invoked from a page, not only ones bound
 * to a `<form action>`/`useActionState`. `/reset-password` is a Server
 * Component that (at the time this bug existed) re-checked
 * `hasRecoveryFlowContext()` on every one of those re-renders; if sign-
 * out/cookie-clearing happened inside `updatePassword` itself, that very
 * round-trip would flip the page's own gate to "no context" and replace
 * the whole tree - including the client form already showing "success" -
 * with the request-a-new-link state. Moving cleanup to this separate
 * function didn't fix that by itself (a plain imperative call still
 * triggers the same re-render - reproduced directly, twice, before the
 * real fix landed); what actually fixes it is that `/reset-password`
 * (see reset-password/page.tsx) and `UpdatePasswordForm`
 * (recovery-form.tsx) now capture the server's recovery-context verdict
 * into client state exactly once, at mount, via `useState`'s lazy
 * initializer - so a later page re-render triggered by THIS function's
 * own cookie mutation can update the prop Next.js passes down, but can
 * no longer retroactively change what the already-mounted client
 * component decided to render.
 *
 * Kept as a separate, later step regardless (rather than inlined back
 * into `updatePassword`) because it still needs its own independent
 * retry path: "try signing out again" after a first cleanup failure must
 * not re-run the whole password update.
 */
export async function finalizeRecoverySession(): Promise<{ status: "success" | "error" }> {
  const supabase = await createClient();

  // Scoped to THIS session only - auth-js defaults `signOut()` to
  // `scope: 'global'` (revokes every session for this user everywhere),
  // which would be a materially different, unrequested action and a
  // false "all devices signed out" implication neither offered nor
  // intended here.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return { status: "error" };

  // Only cleared once sign-out actually succeeds: while cleanup is still
  // failing/retrying, the recovery context must remain valid so a retry
  // is still possible at all (clearing it early would strand the caller
  // with no way back in without requesting an entirely new email link).
  await clearRecoveryFlowCookie();
  return { status: "success" };
}
