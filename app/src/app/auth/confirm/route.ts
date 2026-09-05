import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

/**
 * Where the confirmation link in a signup email actually lands - see
 * signUp()'s emailRedirectTo. Supabase's email template must point here
 * with `token_hash` and `type` params (the default {{ .ConfirmationURL }}
 * template variable does this automatically once the redirect URL below
 * is allow-listed in the Supabase Auth settings - see the launch report
 * for the exact production configuration this still needs).
 *
 * verifyOtp() both confirms the account AND establishes a real session
 * (cookies written via the same server client every other route uses) -
 * one link click is enough to land the visitor back in the app already
 * signed in, continuing straight to Create Your Space.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/create";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/log-in?confirmError=1", origin));
}
