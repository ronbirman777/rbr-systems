"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/supabase/authErrors";
import { APP_URL } from "@/lib/site-url";

export type AuthActionState = { error: string | null };

/**
 * Signup has three real outcomes, not two: an error, a session (email
 * confirmation off, or already-confirmed), or - the case the old code
 * treated as success and silently wasn't - no error and no session,
 * meaning Supabase accepted the signup but is waiting on email
 * confirmation. `checkEmail` is how the page distinguishes that third
 * case and shows a real "confirm your email" state instead of bouncing
 * the visitor into /create with no explanation (a genuine dead end this
 * fixes - see the Time to Flow launch audit).
 */
export type SignUpState = { error: string | null; checkEmail: boolean; email: string | null };

/**
 * TEMPORARY - Vercel Signup Diagnostic Batch 01. Extracts only
 * non-sensitive metadata from a caught error: name, message, status/code
 * if present - never the raw error object (which could carry arbitrary
 * extra properties), never anything from the request itself (no email,
 * no env var values, no keys/tokens). Remove alongside the console
 * calls in signUp() below once the real failure is identified from a
 * live Vercel log and fixed.
 */
function sanitizeDiagError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      constructorName: e.constructor && "name" in (e.constructor as object) ? (e.constructor as { name?: string }).name : undefined,
      name: e.name !== undefined ? String(e.name) : undefined,
      message: e.message !== undefined ? String(e.message) : undefined,
      status: e.status !== undefined ? e.status : undefined,
      code: e.code !== undefined ? e.code : undefined,
      cause: e.cause !== undefined ? String(e.cause) : undefined,
      // Own enumerable key NAMES only, never values - cheap extra signal
      // if the named fields above are unexpectedly absent.
      ownKeys: Object.keys(e),
    };
  }
  return { typeofErr: typeof err, stringified: String(err) };
}

export async function signUp(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // --- TEMPORARY diagnostic logging - Vercel Signup Diagnostic Batch 01 ---
  // Stage markers plus safe booleans/sanitized error metadata only - see
  // sanitizeDiagError's own comment for exactly what "sanitized" means.
  // Never the env var values themselves, never a key/token/password, never
  // the visitor's email. Remove once the real failure is confirmed from a
  // live log and fixed - this is not meant to ship long-term.
  // A single string argument, with the payload JSON-embedded, deliberately -
  // found locally that at least one console capture pipeline (Next's dev
  // log file) silently drops or mis-serializes a second object argument to
  // console.log/error, rendering it as a bare "{}" regardless of actual
  // content. Embedding JSON directly in the message string sidesteps
  // whatever that platform's own log formatter does with extra arguments.
  console.log(
    "[signup-diag] stage=start " +
      JSON.stringify({
        hasSupabaseUrlEnv: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabasePublishableKeyEnv: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        hasSiteUrlEnv: !!process.env.NEXT_PUBLIC_SITE_URL,
        hasAppUrlEnv: !!process.env.NEXT_PUBLIC_APP_URL,
        // A boolean comparison, never the resolved value itself - confirms
        // whether APP_URL actually resolved to the real production Studio
        // origin in this runtime, without printing any URL.
        appUrlMatchesExpectedProductionValue: APP_URL === "https://app.innerdwes.com",
      })
  );

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    console.log("[signup-diag] stage=client_constructed");
  } catch (err) {
    console.error("[signup-diag] stage=client_construction_threw " + JSON.stringify(sanitizeDiagError(err)));
    return { error: "Something went wrong. Please try again.", checkEmail: false, email: null };
  }

  let signUpResult: Awaited<ReturnType<typeof supabase.auth.signUp>>;
  try {
    console.log("[signup-diag] stage=calling_auth_signup");
    signUpResult = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${APP_URL}/auth/confirm?next=/create` },
    });
    console.log(
      "[signup-diag] stage=auth_signup_returned " +
        JSON.stringify({
          hasError: !!signUpResult.error,
          hasSession: !!signUpResult.data?.session,
          hasUser: !!signUpResult.data?.user,
        })
    );
  } catch (err) {
    // Confirms/denies whether auth.signUp() can throw before ever making
    // (or completing) its network request, as opposed to always resolving
    // to a { data, error } result - see the diagnostic batch report.
    console.error("[signup-diag] stage=auth_signup_threw " + JSON.stringify(sanitizeDiagError(err)));
    return { error: "Something went wrong. Please try again.", checkEmail: false, email: null };
  }

  const { data, error } = signUpResult;
  if (error) {
    console.error("[signup-diag] stage=auth_signup_returned_error " + JSON.stringify(sanitizeDiagError(error)));
    return { error: friendlyAuthError(error.message), checkEmail: false, email: null };
  }
  // --- end temporary diagnostic logging ---

  if (data.session) {
    // Email confirmation is off, or this address was already confirmed -
    // a real session exists already, so there's nothing to wait on.
    redirect("/create");
  }

  return { error: null, checkEmail: true, email };
}

export async function resendConfirmationEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${APP_URL}/auth/confirm?next=/create` },
  });
  if (error) return { error: friendlyAuthError(error.message) };
  return { error: null };
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyAuthError(error.message) };

  redirect("/space");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/log-in");
}
