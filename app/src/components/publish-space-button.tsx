"use client";

import { useActionState } from "react";
import { publishSpace, type PublishState } from "@/app/configurator/retreat/actions";

const initialState: PublishState = { error: null, publishedAt: null };

/**
 * The same publishSpace server action the configurator's own Publish step
 * already calls (see actions.ts) - just exposed directly on the My Spaces
 * list too, so Republishing a live edit doesn't require opening the
 * configurator first. No new publish mechanism, no new RLS: this is the
 * existing owner-scoped RPC, called from a second place.
 */
export function PublishSpaceButton({ tenantId, isLive }: { tenantId: string; isLive: boolean }) {
  const [state, formAction, pending] = useActionState(publishSpace, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="tenantId" value={tenantId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-semibold uppercase tracking-wide text-idw-clay-text disabled:opacity-50"
      >
        {pending ? "Publishing…" : state.publishedAt ? "Published ✓" : isLive ? "Republish" : "Publish"}
      </button>
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
