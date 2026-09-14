"use client";

import { useEffect, useRef } from "react";

/**
 * Shared contract that wires every Studio module editor into the single
 * dirty-state guard owned by retreat-configurator.tsx
 * (see useStudioDirtyState.ts + UnsavedChangesDialog).
 *
 * Before this existed the guard covered only the sections whose state the
 * configurator itself owns end-to-end (identity/brand, modules, schedule,
 * facilitators). The seven module editors below each kept local edits that
 * an in-Studio navigation could silently discard. They all follow the same
 * "parent-owned array/record + the editor's own Save" shape, so they share
 * one contract rather than seven divergent solutions.
 */
export type StudioModuleSection =
  | "meals"
  | "treatments"
  | "facilities"
  | "faq"
  | "customPages"
  | "stayConnected"
  | "arrival";

/** Save order is the Studio step order - a Save-and-continue that touches
 * several sections applies them in the order the organizer sees them. */
export const STUDIO_MODULE_SECTIONS: readonly StudioModuleSection[] = [
  "meals",
  "treatments",
  "facilities",
  "arrival",
  "faq",
  "customPages",
  "stayConnected",
] as const;

/**
 * Props every module editor receives so the shared guard can observe and
 * drive it. Required (not optional) on purpose: TypeScript then proves at
 * compile time that each editor is actually wired, rather than a shared
 * hook merely existing somewhere in the tree.
 */
export type StudioSectionEditorProps = {
  /** Call on a meaningful, user-visible edit that is not already persisted. */
  onDirty: () => void;
  /** Call only after a save that actually succeeded. */
  onSaved: () => void;
  /** Publish this editor's save so the Unsaved Changes dialog's
   * "Save and continue" can run it; pass null to withdraw it. */
  registerSave: (save: (() => Promise<boolean>) | null) => void;
};

/**
 * Registers an editor's save with the parent for as long as the editor is
 * mounted. The handler is read through a ref on every call, so the parent
 * always invokes the latest closure - registering `handleSave` directly
 * would capture the render it was registered in and save stale content.
 */
export function useRegisteredSave(
  registerSave: StudioSectionEditorProps["registerSave"],
  handleSave: () => Promise<boolean>
): void {
  const latest = useRef(handleSave);

  // Kept current in an effect rather than during render (a render-phase ref
  // write is a lint error and unsafe under concurrent rendering). The saver
  // is only ever invoked from an event handler, long after effects flush,
  // so it always sees the latest closure.
  useEffect(() => {
    latest.current = handleSave;
  });

  useEffect(() => {
    registerSave(() => latest.current());
    return () => registerSave(null);
  }, [registerSave]);
}
