"use client";

import { useMemo } from "react";
import { useHasMounted } from "@/lib/currencies/useFormattedPrice";
import { fullTimezoneOptions, hydrationSafeTimezoneOptions } from "@/lib/timezone";

/**
 * Timezone <select> options that hydrate identically on every engine
 * (TASK 033 D4). Before mount: "UTC" + the selected value(s), independent of
 * ICU. After mount: the full Intl list of the running browser. Nobody can
 * open the select before hydration, so the swap is invisible.
 *
 * `extra` is a second stored value that must stay selectable (a Teach class
 * timezone that differs from the Space timezone).
 */
export function useTimezoneOptions(primary: string | null | undefined, extra?: string | null): string[] {
  const mounted = useHasMounted();
  return useMemo(
    () => (mounted ? fullTimezoneOptions(primary, extra) : hydrationSafeTimezoneOptions(primary, extra)),
    [mounted, primary, extra]
  );
}
