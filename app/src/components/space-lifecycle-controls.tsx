"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  archiveSpace,
  restoreSpace,
  replaceSpace,
  type LifecycleActionState,
} from "@/app/configurator/retreat/lifecycleActions";
import { INITIAL_LIFECYCLE_STATE } from "@/app/configurator/retreat/lifecycleActionsState";
import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Task 011 owner-only lifecycle controls for a My Spaces card. Server-side
 * enforcement (is_tenant_owner() inside archive_space()/restore_space()/
 * replace_space(), 0017_space_management_slots.sql) is the real authority;
 * this component is only ever rendered for the caller's own owned Spaces
 * (My Spaces already scopes its query to is_tenant_member/created_by), and
 * a non-owner member simply never sees these buttons - but even if they
 * did, the RPCs would reject them.
 */
export function SpaceLifecycleControls({
  tenantId,
  name,
  isArchived,
  slotsAvailable,
}: {
  tenantId: string;
  name: string;
  isArchived: boolean;
  slotsAvailable: number;
}) {
  const [archiveState, archiveAction, archivePending] = useActionState(archiveSpace, INITIAL_LIFECYCLE_STATE);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreSpace, INITIAL_LIFECYCLE_STATE);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  // Task 011, revised after real-iPhone QA: >=44px chip targets and
  // visible :active press feedback everywhere here too, same chip
  // language as the primary action row on this page. Archive/Replace
  // stay visually distinct (red) as destructive-adjacent actions -
  // unchanged behaviorally, only sized/pressed-feedback improved.
  const safeChip =
    "inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-idw-forest/20 text-idw-forest active:scale-[0.97] active:bg-idw-forest/10 transition-transform disabled:opacity-50 disabled:active:scale-100";
  const destructiveChip =
    "inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-red-700/30 text-red-700 active:scale-[0.97] active:bg-red-700/10 transition-transform disabled:opacity-50 disabled:active:scale-100";

  if (isArchived) {
    return (
      <div className="flex flex-wrap gap-2.5 items-start">
        <div className="flex flex-col gap-1">
          <form action={restoreAction}>
            <input type="hidden" name="tenantId" value={tenantId} />
            <button type="submit" disabled={restorePending} className={safeChip}>
              {restorePending ? "Restoring…" : "Restore"}
            </button>
          </form>
          {restoreState.error && (
            <span className="text-xs text-red-700 normal-case font-normal max-w-[220px]">
              {restoreState.error}
            </span>
          )}
        </div>
        <ReplaceDialog tenantId={tenantId} name={name} open={replaceOpen} onOpenChange={setReplaceOpen} />
        <button type="button" onClick={() => setReplaceOpen(true)} className={safeChip}>
          Replace
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2.5 items-start">
      {!archiveConfirmOpen ? (
        <button type="button" onClick={() => setArchiveConfirmOpen(true)} className={safeChip}>
          Archive
        </button>
      ) : (
        <div className="rounded-xl border border-idw-forest/15 bg-idw-parchment/60 p-3 max-w-[260px] w-full">
          <p className="text-xs text-idw-forest/70 normal-case font-normal">
            Archiving &ldquo;{name}&rdquo; removes it from active/public use. It keeps using its
            Space slot — archiving does not free capacity for a new Space. Guests will no longer
            be able to reach it.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <form action={archiveAction}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <button type="submit" disabled={archivePending} className={destructiveChip}>
                {archivePending ? "Archiving…" : "Confirm Archive"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setArchiveConfirmOpen(false)}
              className="inline-flex items-center justify-center min-h-11 px-4 rounded-full text-idw-forest/60 active:scale-[0.97] active:bg-idw-forest/10 transition-transform"
            >
              Cancel
            </button>
          </div>
          {archiveState.error && <span className="text-xs text-red-700 block mt-1">{archiveState.error}</span>}
        </div>
      )}
      <ReplaceDialog tenantId={tenantId} name={name} open={replaceOpen} onOpenChange={setReplaceOpen} />
      {slotsAvailable <= 0 && (
        <button type="button" onClick={() => setReplaceOpen(true)} className={safeChip}>
          Replace
        </button>
      )}
    </div>
  );
}

/**
 * Strong, typed-name confirmation before a destructive Replace (Task 011:
 * "irreversible delete requires typed Space name or equivalent strong
 * confirmation" - Replace is the closest thing to delete this task ships,
 * see the lifecycle review). Same hand-rolled dialog shape as
 * UnsavedChangesDialog/ImageUploadErrorDialog: focus on open, Escape to
 * cancel, backdrop click closes.
 */
function ReplaceDialog({
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
  const [state, formAction, pending] = useActionState<LifecycleActionState, FormData>(replaceSpace, INITIAL_LIFECYCLE_STATE);
  const [typedName, setTypedName] = useState("");
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (state.success) onOpenChange(false);
  }, [state.success, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(27,46,36,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="replace-space-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="replace-space-title" className="text-[16px] text-idw-forest font-editorial italic">
          Replace this Space
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-idw-forest/60">
          This discards &ldquo;{name}&rdquo;&apos;s existing content — its published version,
          schedule, and module content — and reuses the same Space slot for a new draft. This
          cannot be undone. Type the Space&apos;s current name to confirm.
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
          <div>
            <label className="text-xs font-semibold text-idw-forest/50 uppercase tracking-wide">
              New Space name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              name="newName"
              placeholder="Untitled Retreat"
              className="mt-1 w-full rounded-lg border border-idw-forest/20 px-3 py-2 text-sm"
            />
          </div>
          {state.error && <p className="text-xs text-red-700">{state.error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-11 text-[13px] font-medium px-4 rounded-xl text-idw-forest/50 active:bg-idw-forest/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || typedName !== name}
              className="inline-flex items-center gap-1.5 min-h-11 text-[13px] font-medium px-4 rounded-xl bg-red-700 text-white disabled:opacity-40 active:scale-[0.97] transition-transform"
            >
              {pending && <InnerDweSMark size={14} className="idw-loading-breathe shrink-0" tone="on-dark" />}
              {pending ? "Replacing…" : "Discard & Replace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
