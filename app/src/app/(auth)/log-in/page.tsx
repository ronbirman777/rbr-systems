"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

export default function LogInPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <main className="flex-1 flex items-center justify-center bg-[#FBF9F5] px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-[#1B2E24]">Log in</h1>

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
              autoComplete="current-password"
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
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-sm text-[#1B2E24]/60 mt-6">
          New here?{" "}
          <Link href="/sign-up" className="underline">
            Create your account
          </Link>
        </p>
      </div>
    </main>
  );
}
