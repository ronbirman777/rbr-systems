"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <main className="flex-1 flex items-center justify-center bg-[#FBF9F5] px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-[#1B2E24]">Create your account</h1>
        <p className="text-sm text-[#1B2E24]/60 mt-2">
          You&apos;ll design your space before anything is charged.
        </p>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-[#1B2E24]/70">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-[#1B2E24]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8A9A86]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase text-[#1B2E24]/70">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-[#1B2E24]/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8A9A86]"
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
            className="mt-2 rounded-full bg-[#1B2E24] text-[#FBF9F5] text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
          >
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-[#1B2E24]/60 mt-6">
          Already have a space?{" "}
          <Link href="/log-in" className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
