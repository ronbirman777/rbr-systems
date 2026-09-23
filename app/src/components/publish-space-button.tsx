"use client";

import { useActionState } from "react";
import { publishSpace, type PublishState } from "@/app/configurator/retreat/actions";
import { InnerDweSMark } from "@/components/brand/wordmark";

const initialState: PublishState = { error: null, publishedAt: null };

/**
 * The same publishSpace server action the configurator's own Publish step
 * already calls (see actions.ts) - just exposed directly on the My Spaces
 * list too, so Republishing a live edit doesn't require opening the
 * configurator first. No new publish mechanism, no new RLS: this is the
 * existing owner-scoped RPC, called from a second place.
 *
 * `canPublish` (Time to Flow Commercial Access Phase 1) disables the
 * button and shows why - a UX convenience only. The real enforcement is
 * server-side inside publish_space() itself and cannot be bypassed by
 * removing or spoofing this prop.
 */
export function PublishSpaceButton({
  tenantId,
  isLive,
  canPublish = true,
}: {
  tenantId: string;
  isLive: boolean;
  canPublish?: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishSpace, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="tenantId" value={tenantId} />
      {/* Task 011, revised after real-iPhone QA: same >=44px chip target
          and :active press feedback as My Spaces' other action chips, plus
          the InnerDweS mark itself (not a generic spinner) as the pending
          indicator - real pending state from useActionState, never a fixed
          delay. */}
      <button
        type="submit"
        disabled={pending || !canPublish}
        className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border border-idw-clay/30 text-idw-clay-text active:scale-[0.97] active:bg-idw-clay/10 transition-transform disabled:opacity-50 disabled:active:scale-100"
      >
        {pending && <InnerDweSMark size={14} className="idw-loading-breathe shrink-0" />}
        {pending ? "Publishing…" : state.publishedAt ? "Published ✓" : isLive ? "Republish" : "Publish"}
      </button>
      {!canPublish && (
        <span className="text-xs text-idw-forest/50 normal-case font-normal">
          Needs active access to publish
        </span>
      )}
      {state.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
