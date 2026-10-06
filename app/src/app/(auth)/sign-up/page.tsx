"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { BackToHomeLink } from "@/components/back-to-home-link";
import { signUp, resendConfirmationEmail, type SignUpState } from "../actions";
import { CountrySelect } from "@/components/forms/country-select";
import { PhoneField, type PhoneFieldValue } from "@/components/forms/phone-field";

const initialState: SignUpState = { error: null, checkEmail: false, email: null };
const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage";
const LABEL_CLASS = "text-xs font-semibold tracking-wide uppercase text-idw-forest/70";

function CheckEmailState({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [resendResult, setResendResult] = useState<"idle" | "sent" | "error">("idle");

  function handleResend() {
    startTransition(async () => {
      const result = await resendConfirmationEmail(email);
      setResendResult(result.error ? "error" : "sent");
    });
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <InnerDweSMark size={28} className="mx-auto mb-6" />
        <h1 className="font-ui text-[26px] tracking-[-0.01em] text-idw-forest">Check your email</h1>
        <p className="text-sm text-idw-forest/60 mt-3 leading-relaxed">
          We sent a confirmation link to <span className="font-medium text-idw-forest">{email}</span>.
          Open it to confirm your account — you&apos;ll come straight back here and continue to
          Create Your Space.
        </p>

        <button
          type="button"
          onClick={handleResend}
          disabled={pending || resendResult === "sent"}
          className="mt-8 text-xs font-semibold uppercase tracking-wide text-idw-forest underline disabled:opacity-50 disabled:no-underline"
        >
          {pending ? "Sending…" : resendResult === "sent" ? "Confirmation email sent" : "Resend confirmation email"}
        </button>
        {resendResult === "error" && (
          <p className="text-sm text-red-700 mt-3" role="alert">
            Couldn&apos;t resend that email. Please try again in a moment.
          </p>
        )}

        <p className="text-sm text-idw-forest/60 mt-8">
          Already confirmed?{" "}
          <Link href="/log-in" className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  // Task 015: client-side mirror of the server-enforced password-match gate,
  // used only to disable Submit before any request is made. The Server Action
  // re-checks it independently (actions.ts) as the real boundary.
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState<PhoneFieldValue>({ country: "", number: "" });

  const passwordsMismatch = confirmTouched && confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  if (state.checkEmail && state.email) {
    return <CheckEmailState email={state.email} />;
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm">
        <BackToHomeLink />
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-[28px] tracking-[-0.01em] text-idw-forest">Create your account</h1>
        <p className="text-sm text-idw-forest/60 mt-2">
          You&apos;ll design your space before anything is charged.
        </p>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          {/* 1. Full Name */}
          <div>
            <label className={LABEL_CLASS}>Full Name</label>
            <input name="fullName" type="text" required autoComplete="name" className={INPUT_CLASS} />
          </div>

          {/* 2. Email */}
          <div>
            <label className={LABEL_CLASS}>Email</label>
            <input name="email" type="email" required autoComplete="email" className={INPUT_CLASS} />
          </div>

          {/* 3. Password */}
          <div>
            <label className={LABEL_CLASS}>Password</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          {/* 4. Confirm Password - validation-only, never persisted (see actions.ts) */}
          <div>
            <label className={LABEL_CLASS}>Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              aria-invalid={passwordsMismatch}
              className={INPUT_CLASS}
            />
            {passwordsMismatch && (
              <p className="text-xs text-red-700 mt-1" role="alert">
                Passwords don&apos;t match.
              </p>
            )}
          </div>

          {/* 5. Country - searchable, valid-only; the stored value is the
              ISO code, never the typed text. */}
          <div>
            <CountrySelect
              name="country"
              label="Country"
              required
              value={country}
              onChange={setCountry}
              placeholder="Search countries"
            />
          </div>

          {/* 6. Phone Number - the phone country is an ISO code, not a
              calling code: "+1" is 26 territories, so a dial code cannot
              identify one. The Space/profile country only suggests it. */}
          <div>
            <PhoneField
              countryName="phoneCountry"
              numberName="phoneNumber"
              label="Phone Number"
              countryLabel="Phone country"
              required
              value={phone}
              onChange={setPhone}
              suggestedCountry={country}
            />
          </div>

          {/* 7. Optional: Business / Retreat / Practice Name - visually
              grouped below every required field,
              per the task's exact layout requirement. */}
          <div className="mt-2 pt-4 border-t border-idw-forest/10">
            <label className={LABEL_CLASS}>
              Business / Retreat / Practice Name <span className="text-idw-forest/40 normal-case font-normal">(optional)</span>
            </label>
            <input name="businessName" type="text" autoComplete="organization" className={INPUT_CLASS} />
          </div>

          {state.error && (
            <p className="text-sm text-red-700" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="mt-2 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
          >
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-idw-forest/60 mt-6">
          Already have a space?{" "}
          <Link href="/log-in" className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
