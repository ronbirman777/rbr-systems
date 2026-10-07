"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteAccount, type DeleteAccountState } from "@/app/(site)/(auth)/actions";
import { InnerDweSMark } from "@/components/brand/wordmark";

const INITIAL_STATE: DeleteAccountState = { error: null };

/**
 * Task 017 (Part C — User UX). Deliberately reuses the exact confirmation-
 * dialog shape and open/close ownership already established by
 * DeleteSpaceControl (same file structure, same `open` state lives in the
 * parent, same always-mounted-while-open dialog) - not a new pattern for
 * an even more destructive action than the one that pattern already
 * guards. On success this dialog does NOT close itself: deleteAccount()
 * ends in `redirect("/log-in?accountDeleted=1")`, which navigates the
 * whole page away before any "success" state could ever reach this
 * component - there is nothing to close.
 */
export function DeleteAccountControl({ email, spaceCount }: { email: string; spaceCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center min-h-11 px-4 rounded-full border border-red-700/20 text-red-700 text-xs font-semibold uppercase tracking-wide active:bg-red-700/10 active:scale-[0.97] transition-transform"
      >
        Delete account
      </button>
      <DeleteAccountDialog email={email} spaceCount={spaceCount} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DeleteAccountDialog({
  email,
  spaceCount,
  open,
  onOpenChange,
}: {
  email: string;
  spaceCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(deleteAccount, INITIAL_STATE);
  const [typedEmail, setTypedEmail] = useState("");
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(27,46,36,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="delete-account-title" className="text-[16px] text-idw-forest font-editorial italic">
          Delete your account
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-idw-forest/60">
          This permanently deletes your account
          {spaceCount > 0
            ? `, all ${spaceCount} of your Space${spaceCount === 1 ? "" : "s"}, their published content, and every uploaded image`
            : " and everything associated with it"}
          . This cannot be undone. Type your email (<span className="font-medium text-idw-forest">{email}</span>)
          to confirm.
        </p>
        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-idw-forest/50 uppercase tracking-wide">
              Type your email to confirm
            </label>
            <input
              ref={inputRef}
              type="email"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              name="confirmEmail"
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
              disabled={pending || typedEmail.toLowerCase() !== email.toLowerCase()}
              className="inline-flex items-center gap-1.5 min-h-11 text-[13px] font-medium px-4 rounded-xl bg-red-700 text-white disabled:opacity-40 active:scale-[0.97] transition-transform"
            >
              {pending && <InnerDweSMark size={14} className="idw-loading-breathe shrink-0" tone="on-dark" />}
              {pending ? "Deleting…" : "Delete my account permanently"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
