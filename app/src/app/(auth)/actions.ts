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

export async function signUp(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${APP_URL}/auth/confirm?next=/create` },
  });
  if (error) return { error: friendlyAuthError(error.message), checkEmail: false, email: null };

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
