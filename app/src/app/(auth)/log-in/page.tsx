"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { signIn, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

function ConfirmErrorNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("confirmError") !== "1") return null;

  return (
    <p className="text-sm text-idw-forest/70 bg-idw-forest/5 rounded-lg px-3 py-2.5 mt-4">
      That confirmation link is invalid or has expired. If you&apos;ve already confirmed your
      email, just log in below — otherwise{" "}
      <Link href="/sign-up" className="underline">
        sign up again
      </Link>{" "}
      to get a new confirmation email.
    </p>
  );
}

export default function LogInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm">
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-[28px] tracking-[-0.01em] text-idw-forest">Log in</h1>

        <Suspense fallback={null}>
          <ConfirmErrorNotice />
        </Suspense>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-idw-forest/70">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage"
            />
          </div>

          {state.error && (
            <p className="text-sm text-red-700" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
          >
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-sm text-idw-forest/60 mt-6">
          New here?{" "}
          <Link href="/sign-up" className="underline">
            Create your account
          </Link>
        </p>
      </div>
    </main>
  );
}
