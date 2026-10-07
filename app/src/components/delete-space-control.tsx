"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteSpace } from "@/app/(site)/configurator/retreat/lifecycleActions";
import { INITIAL_LIFECYCLE_STATE } from "@/app/(site)/configurator/retreat/lifecycleActionsState";
import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Task 014 (item B) — a permanent-delete control for a My Spaces card.
 * Deliberately a standalone button positioned in the card's own top-right
 * corner, never nested inside another interactive element (the card
 * itself is a plain `<div>`, not a clickable/link wrapper - none of My
 * Spaces' existing action chips are nested either, so this follows the
 * same flat structure) - this is what keeps it from ever intercepting or
 * being intercepted by card-open navigation, and keeps keyboard/pointer
 * activation simple and correct.
 *
 * Reuses the exact confirmation-dialog shape and open/close ownership
 * already established by SpaceLifecycleControls' ReplaceDialog: `open`
 * state lives in this parent, is passed down as `open`/`onOpenChange`,
 * and the dialog component is always mounted (returning null while
 * closed) so its own "close on success" effect calls the `onOpenChange`
 * prop rather than local state in the same component - the same shape
 * Replace already uses, not a new one. The dialog's `<form
 * action={formAction}>` is a real Server-Action-bound form, so
 * `revalidatePath("/space")` inside deleteSpace() already refreshes this
 * Server Component route the same way Archive/Restore/Replace's own
 * form-bound actions already do - no separate client refresh call is
 * needed here either.
 */
export function DeleteSpaceControl({ tenantId, name }: { tenantId: string; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${name}`}
        className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-full text-idw-forest/40 hover:text-red-700 active:bg-red-700/10 active:scale-[0.97] transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m2 0-.6 9.4A1.5 1.5 0 0 1 11.9 17H8.1a1.5 1.5 0 0 1-1.5-1.6L6 6h8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <DeleteSpaceDialog tenantId={tenantId} name={name} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DeleteSpaceDialog({
  tenantId,
  name,
  open,
  onOpenChange,
}: {
  tenantId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(deleteSpace, INITIAL_LIFECYCLE_STATE);
  const [typedName, setTypedName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (state.success) onOpenChange(false);
  }, [state.success, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(27,46,36,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onOpenChange(false);
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="delete-space-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-space-title" className="text-[16px] text-idw-forest font-editorial italic">
          Delete this Space
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-idw-forest/60">
          This permanently deletes &ldquo;{name}&rdquo; — its content, published version, and Space
          slot. This cannot be undone. Type the Space&apos;s name to confirm.
        </p>
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="expectedName" value={name} />
          <div>
            <label className="text-xs font-semibold text-idw-forest/50 uppercase tracking-wide">
              Type &ldquo;{name}&rdquo; to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              name="confirmName"
              className="mt-1 w-full rounded-lg border border-idw-forest/20 px-3 py-2 text-sm"
              autoComplete="off"
            />
          </div>
          {state.error && (
            <p className="text-xs text-red-700" role="alert">
              {state.error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="min-h-11 text-[13px] font-medium px-4 rounded-xl text-idw-forest/50 active:bg-idw-forest/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || typedName !== name}
              className="inline-flex items-center gap-1.5 min-h-11 text-[13px] font-medium px-4 rounded-xl bg-red-700 text-white disabled:opacity-40 active:scale-[0.97] transition-transform"
            >
              {pending && <InnerDweSMark size={14} className="idw-loading-breathe shrink-0" tone="on-dark" />}
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
