"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  archiveSpace,
  restoreSpace,
  replaceSpace,
  type LifecycleActionState,
} from "@/app/(site)/configurator/retreat/lifecycleActions";
import { INITIAL_LIFECYCLE_STATE } from "@/app/(site)/configurator/retreat/lifecycleActionsState";
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
/** TASK 032 paid-mode confirmation copy, translated server-side (billing namespace). */
export type PaidLifecycleCopy = { archiveBody: string; replaceBody: string; lang: string; dir: "ltr" | "rtl"; ui: LifecycleUiCopy };

/**
 * Buttons, labels and the dialog title, already translated on the server (billing namespace, account
 * locale). typeNameLabel has the Space name interpolated verbatim; the confirmation still compares the
 * typed text to the exact Space name (never a translation).
 */
export type LifecycleUiCopy = {
  archive: string; confirmArchive: string; archiving: string; restore: string; restoring: string; replace: string;
  replaceTitle: string; typeNameLabel: string; newNameLabel: string; discardReplace: string; replacing: string; cancel: string;
};

/** Legacy (paid checkout off) keeps the Task 011 English text. */
function legacyUi(name: string): LifecycleUiCopy {
  return {
    archive: "Archive", confirmArchive: "Confirm Archive", archiving: "Archiving…", restore: "Restore", restoring: "Restoring…", replace: "Replace",
    replaceTitle: "Replace this Space", typeNameLabel: `Type \u201c${name}\u201d to confirm`, newNameLabel: "New Space name", discardReplace: "Discard & Replace",
    replacing: "Replacing…", cancel: "Cancel",
  };
}

export function SpaceLifecycleControls({
  tenantId,
  name,
  isArchived,
  showRestore,
  showReplace,
  billingLockedNote,
  untitledName,
  paidCopy = null,
}: {
  tenantId: string;
  name: string;
  isArchived: boolean;
  /** TASK 032 (B2): decided server-side by lifecycleControlsView() - slot-based in legacy mode, billing-based in paid mode. */
  showRestore: boolean;
  showReplace: boolean;
  /** Paid mode: billing must be resolved first. Already translated; null = nothing to say. */
  billingLockedNote: string | null;
  /** Product-specific default name (Space Type Registry copy.untitledName). */
  untitledName: string;
  /**
   * TASK 032: paid checkout is on. Each Space is its own subscription, so the
   * dialogs must not talk about "Space slots". Already translated on the server
   * (billing namespace, account locale, Space name interpolated) together with
   * the lang/dir it is written in. null (legacy) keeps the Task 011 text exactly.
   */
  paidCopy?: PaidLifecycleCopy | null;
}) {
  const [archiveState, archiveAction, archivePending] = useActionState(archiveSpace, INITIAL_LIFECYCLE_STATE);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreSpace, INITIAL_LIFECYCLE_STATE);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const ui = paidCopy?.ui ?? legacyUi(name);
  const langProps = paidCopy ? { lang: paidCopy.lang, dir: paidCopy.dir } : {};

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
      <div className="flex flex-wrap gap-2.5 items-start" {...langProps}>
        {showRestore && (
          <div className="flex flex-col gap-1">
            <form action={restoreAction}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <button type="submit" disabled={restorePending} className={safeChip}>
                {restorePending ? ui.restoring : ui.restore}
              </button>
            </form>
            {restoreState.error && (
              <span className="text-xs text-red-700 normal-case font-normal max-w-[220px]">
                {restoreState.error}
              </span>
            )}
          </div>
        )}
        {showReplace && (
          <>
            <ReplaceDialog tenantId={tenantId} name={name} untitledName={untitledName} paidCopy={paidCopy} open={replaceOpen} onOpenChange={setReplaceOpen} />
            <button type="button" onClick={() => setReplaceOpen(true)} className={safeChip}>
              {ui.replace}
            </button>
          </>
        )}
        {billingLockedNote && (
          <span className="text-xs text-idw-forest/60 normal-case font-normal max-w-[260px] self-center" role="note">
            {billingLockedNote}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2.5 items-start" {...langProps}>
      {!archiveConfirmOpen ? (
        <button type="button" onClick={() => setArchiveConfirmOpen(true)} className={safeChip}>
          {ui.archive}
        </button>
      ) : (
        <div className="rounded-xl border border-idw-forest/15 bg-idw-parchment/60 p-3 max-w-[260px] w-full">
          {paidCopy ? (
            <p lang={paidCopy.lang} dir={paidCopy.dir} className="text-xs text-idw-forest/70 normal-case font-normal">
              {paidCopy.archiveBody}
            </p>
          ) : (
            <p className="text-xs text-idw-forest/70 normal-case font-normal">
              Archiving &ldquo;{name}&rdquo; removes it from active/public use. It keeps using its
              Space slot — archiving does not free capacity for a new Space. Guests will no longer
              be able to reach it.
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <form action={archiveAction}>
              <input type="hidden" name="tenantId" value={tenantId} />
              <button type="submit" disabled={archivePending} className={destructiveChip}>
                {archivePending ? ui.archiving : ui.confirmArchive}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setArchiveConfirmOpen(false)}
              className="inline-flex items-center justify-center min-h-11 px-4 rounded-full text-idw-forest/60 active:scale-[0.97] active:bg-idw-forest/10 transition-transform"
            >
              {ui.cancel}
            </button>
          </div>
          {archiveState.error && <span className="text-xs text-red-700 block mt-1">{archiveState.error}</span>}
        </div>
      )}
      {showReplace && (
        <>
          <ReplaceDialog tenantId={tenantId} name={name} untitledName={untitledName} paidCopy={paidCopy} open={replaceOpen} onOpenChange={setReplaceOpen} />
          <button type="button" onClick={() => setReplaceOpen(true)} className={safeChip}>
            {ui.replace}
          </button>
        </>
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
  untitledName,
  paidCopy,
  open,
  onOpenChange,
}: {
  tenantId: string;
  name: string;
  untitledName: string;
  paidCopy: PaidLifecycleCopy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<LifecycleActionState, FormData>(replaceSpace, INITIAL_LIFECYCLE_STATE);
  const [typedName, setTypedName] = useState("");
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ui = paidCopy?.ui ?? legacyUi(name);

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
      <div role="dialog" aria-modal="true" aria-labelledby="replace-space-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" {...(paidCopy ? { lang: paidCopy.lang, dir: paidCopy.dir } : {})}>
        <h2 id="replace-space-title" className="text-[16px] text-idw-forest font-editorial italic">
          {ui.replaceTitle}
        </h2>
        {paidCopy ? (
          <p lang={paidCopy.lang} dir={paidCopy.dir} className="mt-2 text-[13px] leading-relaxed text-idw-forest/60">
            {paidCopy.replaceBody}
          </p>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-idw-forest/60">
            This discards &ldquo;{name}&rdquo;&apos;s existing content — its published version,
            schedule, and module content — and reuses the same Space slot for a new draft. This
            cannot be undone. Type the Space&apos;s current name to confirm.
          </p>
        )}
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="expectedName" value={name} />
          <div>
            <label htmlFor={`replace-confirm-${tenantId}`} className="text-xs font-semibold text-idw-forest/50 uppercase tracking-wide">
              {ui.typeNameLabel}
            </label>
            <input
              ref={inputRef}
              id={`replace-confirm-${tenantId}`}
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              name="confirmName"
              className="mt-1 w-full rounded-lg border border-idw-forest/20 px-3 py-2 text-sm"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`replace-newname-${tenantId}`} className="text-xs font-semibold text-idw-forest/50 uppercase tracking-wide">
              {ui.newNameLabel}
            </label>
            <input
              id={`replace-newname-${tenantId}`}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              name="newName"
              placeholder={untitledName}
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
              {ui.cancel}
            </button>
            <button
              type="submit"
              disabled={pending || typedName !== name}
              className="inline-flex items-center gap-1.5 min-h-11 text-[13px] font-medium px-4 rounded-xl bg-red-700 text-white disabled:opacity-40 active:scale-[0.97] transition-transform"
            >
              {pending && <InnerDweSMark size={14} className="idw-loading-breathe shrink-0" tone="on-dark" />}
              {pending ? ui.replacing : ui.discardReplace}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
