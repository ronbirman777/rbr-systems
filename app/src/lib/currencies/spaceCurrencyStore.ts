"use client";

import { useEffect, useSyncExternalStore } from "react";
import { resolveSpaceCurrency } from "./index";

/**
 * Client-side cache of each Space's default currency (spaceSettings.currency),
 * shared by the Space currency card and the item editors that pre-fill from
 * it, so a change in the card reaches "add a priced item" without a reload
 * and without threading props through the Studio shells.
 *
 * `null` = not loaded yet; callers then fall back to EUR (D-CC3), which is
 * also what an unset Space resolves to. Loading is injected so this module
 * stays free of server-action imports (and testable).
 */

const values = new Map<string, string>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setSpaceCurrency(tenantId: string, code: unknown) {
  values.set(tenantId, resolveSpaceCurrency(code));
  emit();
}

export function getSpaceCurrency(tenantId: string): string | null {
  return values.get(tenantId) ?? null;
}

/** Test-only reset. */
export function resetSpaceCurrencyStore() {
  values.clear();
  inflight.clear();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ensureSpaceCurrencyLoaded(tenantId: string, load: (tenantId: string) => Promise<{ currency?: unknown }>) {
  if (!tenantId || values.has(tenantId) || inflight.has(tenantId)) return;
  inflight.add(tenantId);
  load(tenantId)
    .then((settings) => {
      if (!values.has(tenantId)) setSpaceCurrency(tenantId, settings?.currency);
    })
    .catch(() => {
      // Leave unset: callers fall back to the EUR default.
    })
    .finally(() => inflight.delete(tenantId));
}

/** The Space default currency for pre-filling new priced items (EUR until loaded / when unset). */
export function useSpaceDefaultCurrency(tenantId: string, load: (tenantId: string) => Promise<{ currency?: unknown }>): string {
  const value = useSyncExternalStore(
    subscribe,
    () => getSpaceCurrency(tenantId),
    () => null
  );
  useEffect(() => {
    ensureSpaceCurrencyLoaded(tenantId, load);
  }, [tenantId, load]);
  return value ?? resolveSpaceCurrency(null);
}
