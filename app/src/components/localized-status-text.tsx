"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

/**
 * TASK 033 branded loading - the Studio route loaders' message in the
 * visitor's account language, WITHOUT making loading.tsx dynamic.
 *
 * A route's loading.tsx must stay static so Next can prefetch it for every
 * <Link> (the instant-feedback guarantee of TASK 031 W3); reading cookies
 * there would make it dynamic. So the static server component passes every
 * locale's string (from the dictionaries) and this picks one on the client:
 * the `idw_locale` cookie (the account language choice), else the browser
 * language, else English - the same order as getAccountLocale(). The server
 * render and hydration show the English fallback; useSyncExternalStore then
 * switches without a hydration mismatch. On a client-side navigation (the
 * common case) the right language renders immediately.
 */


export function pickClientLocale(cookie: string, languages: readonly string[]): Locale {
  const fromCookie = /(?:^|;\s*)idw_locale=([^;]+)/.exec(cookie)?.[1];
  if (isSupportedLocale(fromCookie)) return fromCookie;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split("-")[0];
    const normalised = primary === "iw" ? "he" : primary;
    if (isSupportedLocale(normalised)) return normalised;
  }
  return DEFAULT_LOCALE;
}

const noopSubscribe = () => () => {};

export function LocalizedStatusText({ messages, className }: { messages: Record<Locale, string>; className?: string }) {
  const locale = useSyncExternalStore(
    noopSubscribe,
    () => pickClientLocale(document.cookie, navigator.languages ?? [navigator.language]),
    () => DEFAULT_LOCALE
  );
  return (
    <p className={className} lang={locale}>
      {messages[locale] ?? messages[DEFAULT_LOCALE]}
    </p>
  );
}
