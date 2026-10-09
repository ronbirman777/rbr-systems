"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { interpolate } from "@/lib/i18n/interpolate";
import type { AdminCtx, AdminKey } from "@/lib/billing/admin/ui/labels";
import type { Locale } from "@/lib/i18n/locales";

const Ctx = createContext<AdminCtx | null>(null);

/**
 * Hands client components the already-resolved Admin strings for the account locale. The dictionary is chosen on
 * the server, so no locale tables ship to the client from here and nothing is machine-translated at runtime.
 */
export function AdminI18nProvider({ dict, locale, children }: { dict: Record<string, string>; locale: Locale; children: ReactNode }) {
  const value = useMemo<AdminCtx>(() => ({ locale, t: (key: AdminKey, values) => interpolate(dict[key as string] ?? (key as string), values) }), [dict, locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminI18n(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminI18n must be used inside AdminI18nProvider");
  return v;
}
