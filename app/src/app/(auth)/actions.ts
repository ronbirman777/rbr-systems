"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyAuthError } from "@/lib/supabase/authErrors";
import { APP_URL } from "@/lib/site-url";
import { isSupportedCountry } from "@/lib/countries";
import { toE164 } from "@/lib/phone";
import { deleteSpaceCompletely } from "@/app/configurator/retreat/lifecycleActions";

/**
 * Task 014: `unconfirmedEmail` is set from the RAW Supabase error message
 * (before it's transformed into the friendly display string below), not
 * by re-matching the already-localized UI copy on the client - a more
 * robust way for /log-in to know when "Resend confirmation email" is the
 * genuinely relevant recovery action, without re-deriving it from
 * display text that could change independently of this check.
 */
export type AuthActionState = { error: string | null; unconfirmedEmail?: boolean };

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
 * Task 015: server-side re-validation of every required signup field -
 * the real enforcement boundary (a Server Action can always be invoked
 * directly, bypassing whatever the client already checked), not a
 * duplicate of the client's own inline messages. `confirmPassword` is
 * read here ONLY to re-check the match (it arrives in the POST body
 * regardless, the same way any form field does) - it is never written
 * into `metadata`, never passed to `signUp()`, never persisted anywhere,
 * and never logged; it falls out of scope the moment this function
 * returns.
 */
export async function signUp(
  _prevState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const country = String(formData.get("country") ?? "");
  const phoneCountry = String(formData.get("phoneCountry") ?? "");
  const nationalNumber = String(formData.get("phoneNumber") ?? "").trim();
  const businessName = String(formData.get("businessName") ?? "").trim();

  if (!fullName) return { error: "Enter your full name.", checkEmail: false, email: null };
  if (password !== confirmPassword) {
    return { error: "Passwords don't match.", checkEmail: false, email: null };
  }
  // Valid-only: an arbitrary typed/tampered country code is never saved.
  if (!isSupportedCountry(country)) return { error: "Choose your country.", checkEmail: false, email: null };
  // One canonical parser decides what a phone number is (lib/phone). The
  // posted dialCode selects the phone country; the national part is
  // parsed against it, so a trunk prefix or a pasted international number
  // both resolve to the same E.164 value.
  const phoneE164 = toE164(nationalNumber, { defaultCountry: isSupportedCountry(phoneCountry) ? phoneCountry : country });
  if (!phoneE164) {
    return { error: "Enter a valid phone number.", checkEmail: false, email: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${APP_URL}/auth/confirm?next=/create`,
      // Task 015: the only channel that can carry these values through to
      // a durable profile row before any session/RLS context exists (see
      // 0019_signup_profile.sql's handle_new_user_profile() trigger,
      // which reads this same raw_user_meta_data at insert time) -
      // confirmPassword is deliberately absent from this object.
      data: {
        full_name: fullName,
        country,
        phone: phoneE164,
        business_name: businessName || null,
      },
    },
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
  if (error) {
    return {
      error: friendlyAuthError(error.message),
      unconfirmedEmail: error.message.toLowerCase().includes("email not confirmed"),
    };
  }

  redirect("/space");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/log-in");
}

export type DeleteAccountState = { error: string | null };

/**
 * Task 017 (Account Deletion). Real, permanent account deletion - the
 * gap the TASK 016 Privacy/Vendor Facts Audit identified ("no
 * account-deletion capability exists anywhere in this codebase").
 *
 * Order matters and is fixed, for two independent safety reasons:
 *
 *  1. Every Space this user OWNS is deleted first, through
 *     deleteSpaceCompletely() (lifecycleActions.ts) - the exact same
 *     Storage-then-database routine the single-Space "Delete this Space"
 *     control already uses, not a second implementation. Only once every
 *     owned Space is confirmed gone do we touch auth.users at all.
 *  2. Deleting owned tenants first is also what keeps this from ever
 *     hitting the `tenants.created_by` foreign key from the OTHER side -
 *     the schema fix (0022_account_deletion_fk_safety.sql, ON DELETE SET
 *     NULL) is a safety net for cases this ordering cannot reach on its
 *     own (a Space this user doesn't own, or an access-code-redemption /
 *     featured-listing-review row referencing them), not a substitute
 *     for deleting what they DO own before the account itself.
 *
 * If any owned Space fails to delete completely, the whole operation
 * stops there and reports failure - auth.users is never touched, so
 * nothing has been destroyed that cannot simply be retried. Only once
 * every owned Space is gone does this call the service-role ADMIN client
 * (lib/supabase/admin.ts) to delete the auth.users row itself - the one
 * step no ordinary user session can ever perform on its own (Supabase
 * exposes no client-callable "delete my own account" API), and exactly
 * why this whole function is a Server Action, not client code: the
 * SUPABASE_SECRET_KEY-backed admin client is never created, referenced,
 * or reachable anywhere outside this trusted server-side environment.
 *
 * Isolation: the account being deleted is always `user.id` from this
 * request's own verified session (`auth.getUser()`) - never a
 * client-supplied id - so this can never be pointed at another account,
 * and the owned-Space lookup is scoped to that same id.
 */
export async function deleteAccount(
  _prevState: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const confirmEmail = String(formData.get("confirmEmail") ?? "").trim();
  if (!user.email || confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    return { error: "Type your account email exactly to confirm deleting your account." };
  }

  const { data: ownedRows, error: ownedError } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("role", "owner");
  if (ownedError) return { error: "Couldn't check your Spaces. Please try again." };

  for (const row of ownedRows ?? []) {
    const result = await deleteSpaceCompletely(supabase, user.id, row.tenant_id);
    if (!result.ok) {
      return {
        error:
          "Couldn't fully delete one of your Spaces, so your account was not deleted. Please try again, or contact contact@innerdwes.com if this keeps happening.",
      };
    }
  }

  const admin = createAdminClient();
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    return {
      error:
        "Your Spaces were removed, but we couldn't finish deleting your account. Please try again, or contact contact@innerdwes.com.",
    };
  }

  await supabase.auth.signOut();
  redirect("/log-in?accountDeleted=1");
}
