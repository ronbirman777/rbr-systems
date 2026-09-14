"use client";

import { useEffect, useRef, useState } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";

export type UnsavedChangesDialogProps = {
  open: boolean;
  /** Attempts to save every currently-dirty section. Returns true only
   * if every save genuinely succeeded - the dialog only navigates on a
   * true result, exactly like Save Draft's own success/failure handling
   * elsewhere in Studio (a failed save must remain dirty). */
  onSaveAndContinue: () => Promise<boolean>;
  onLeaveWithoutSaving: () => void;
  onCancel: () => void;
};

/**
 * Same hand-rolled dialog structure as ImageUploadErrorDialog (the only
 * other dialog in the codebase) - focus trap, Escape-to-cancel, backdrop
 * click closes, focus restored on close. Three actions instead of two.
 */
export function UnsavedChangesDialog({ open, onSaveAndContinue, onLeaveWithoutSaving, onCancel }: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    // saveFailed itself is reset at the start of handleSaveAndContinue
    // (a regular event-handler state update), not here - setState
    // directly inside an effect body causes an extra cascading render.
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    primaryButtonRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  async function handleSaveAndContinue() {
    setSaving(true);
    setSaveFailed(false);
    const succeeded = await onSaveAndContinue();
    setSaving(false);
    if (!succeeded) setSaveFailed(true);
    // On success, the caller (retreat-configurator.tsx) is responsible
    // for actually navigating and closing this dialog - this component
    // never navigates on its own.
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(27,46,36,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-body"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2
          id="unsaved-changes-title"
          className="text-[16px]"
          style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}
        >
          You have unsaved changes
        </h2>
        <p id="unsaved-changes-body" className="mt-2 text-[13px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.dusk }}>
          Your draft hasn&apos;t been saved yet. What would you like to do?
        </p>
        {saveFailed && (
          <p className="mt-2 text-[12px]" role="alert" style={{ color: "#B23B3B" }}>
            Couldn&apos;t save your changes. Please try again.
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-[13px] font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            style={{ color: GUEST_BASE_PALETTE.mist }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onLeaveWithoutSaving}
            disabled={saving}
            className="text-[13px] font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            style={{ color: "#B23B3B" }}
          >
            Leave without saving
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={handleSaveAndContinue}
            disabled={saving}
            className="text-[13px] font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            style={{ background: GUEST_BASE_PALETTE.forest, color: "white" }}
          >
            {saving ? "Saving…" : "Save & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
