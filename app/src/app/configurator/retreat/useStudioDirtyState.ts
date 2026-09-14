import { useCallback, useState } from "react";

/**
 * Distribution phase - real dirty-state tracking for Studio, confirmed
 * to not exist anywhere in the codebase before this (a full-repo grep
 * for beforeunload/isDirty/unsaved found zero matches). A Set of
 * currently-dirty section keys, not a single boolean - so navigating
 * within Studio can name exactly which unsaved edits are at risk, and
 * so a save in one section doesn't silently "clean" an unrelated one.
 *
 * Deliberately NOT wired into sections that already persist
 * immediately on every change (brand image upload/remove, module-item
 * photo upload/remove, add/remove item) - those have nothing to lose
 * client-side, and marking them dirty would be exactly the "fake dirty
 * state around an already-persisted action" the design explicitly
 * rules out.
 */
export function useStudioDirtyState() {
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set());

  const markDirty = useCallback((section: string) => {
    setDirtySections((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  }, []);

  const markClean = useCallback((section: string) => {
    setDirtySections((prev) => {
      if (!prev.has(section)) return prev;
      const next = new Set(prev);
      next.delete(section);
      return next;
    });
  }, []);

  return { dirtySections, markDirty, markClean, isDirtyAnywhere: dirtySections.size > 0 };
}
