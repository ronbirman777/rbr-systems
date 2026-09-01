"use client";

import { useActionState } from "react";
import { verifyPreviewAccess, type PreviewAccessState } from "./actions";

const initialState: PreviewAccessState = { error: null };

export function PreviewAccessForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(verifyPreviewAccess, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="password"
        type="password"
        required
        autoFocus
        placeholder="Preview password"
        className="w-full rounded-lg border border-idw-forest/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-idw-sage text-center"
      />
      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold uppercase tracking-wide py-3 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Enter InnerDweS"}
      </button>
    </form>
  );
}
