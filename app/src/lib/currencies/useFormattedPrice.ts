"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { formatPrice, formatPriceFallback } from "./format";

const subscribe = () => () => {};

/**
 * False during SSR and hydration, true once mounted. Lets a client
 * component use Intl currency formatting without a hydration mismatch
 * (Node and browser ICU can disagree on symbols).
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

/**
 * The price string a client component should render.
 *
 * `serverLabel` (pre-formatted on the server for guests) always wins, so the
 * guest HTML and the hydrated DOM are byte-identical. Without one (the Studio
 * preview, marketing demos), the deterministic fallback renders first and
 * the full formatPrice output replaces it after mount.
 */
export function useFormattedPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
  serverLabel?: string | null
): string | null {
  const mounted = useHasMounted();
  if (serverLabel !== undefined) return serverLabel;
  return mounted ? formatPrice(amount, currency, locale) : formatPriceFallback(amount, currency, locale);
}
