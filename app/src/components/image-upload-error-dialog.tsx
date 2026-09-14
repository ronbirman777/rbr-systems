"use client";

import { useEffect, useRef } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";

export type ImageUploadErrorDialogProps = {
  open: boolean;
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimary: () => void;
  onCancel: () => void;
  cancelLabel?: string;
};

/**
 * The one dialog every image-upload entry point in Studio uses for a
 * rejected file - oversized, wrong format, or a server-side processing
 * failure (see clientValidation.ts). Never a native `alert()`: a real
 * accessible application dialog - focus-trapped, closes on Escape or a
 * backdrop click, and returns focus to whatever was focused before it
 * opened once it closes, in either direction (Cancel or the primary
 * action).
 */
export function ImageUploadErrorDialog({
  open,
  title,
  body,
  primaryLabel = "Choose another image",
  onPrimary,
  onCancel,
  cancelLabel = "Cancel",
}: ImageUploadErrorDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
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
        aria-labelledby="image-upload-error-title"
        aria-describedby="image-upload-error-body"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2
          id="image-upload-error-title"
          className="text-[16px]"
          style={{ fontFamily: "var(--font-dm-serif-display), serif", color: GUEST_BASE_PALETTE.forest }}
        >
          {title}
        </h2>
        <p id="image-upload-error-body" className="mt-2 text-[13px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.dusk }}>
          {body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[13px] font-medium px-4 py-2 rounded-xl transition-colors"
            style={{ color: GUEST_BASE_PALETTE.mist }}
          >
            {cancelLabel}
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={onPrimary}
            className="text-[13px] font-medium px-4 py-2 rounded-xl transition-colors"
            style={{ background: GUEST_BASE_PALETTE.forest, color: "white" }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
