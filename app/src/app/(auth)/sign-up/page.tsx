"use client";

import { useActionState } from "react";
import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { signUp, type AuthActionState } from "../actions";

const initialState: AuthActionState = { error: null };

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm">
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-[28px] tracking-[-0.01em] text-idw-forest">Create your account</h1>
        <p className="text-sm text-idw-forest/60 mt-2">
          You&apos;ll design your space before anything is charged.
        </p>

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
              minLength={8}
              autoComplete="new-password"
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
