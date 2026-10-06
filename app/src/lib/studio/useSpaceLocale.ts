"use client";

import { useCallback, useState } from "react";
import { DEFAULT_LOCALE, directionOf, type Direction, type Locale } from "@/lib/i18n";

/**
 * The Space's system language, as LIVE state rather than a server prop.
 *
 * THE BUG THIS FIXES. Both Studios took the locale as `initialLocale` /
 * `initial.locale` - a value read once, at server render, and then used
 * for every translator call and passed to the Live Draft Preview. The
 * language card saved the organizer's choice to the database and updated
 * only its OWN state, so the Studio shell and the preview both went on
 * speaking the previous language until the page happened to be reloaded.
 * The setting worked; only the screen disagreed with it.
 *
 * So the locale has to live in one piece of state the whole Studio reads
 * from, and the card has to hand its choice up to it. That is all this
 * hook is - plus the direction, which has to change with it: a Hebrew
 * Studio that stays `ltr` is a different half of the same bug.
 */
export function useSpaceLocale(initial: Locale = DEFAULT_LOCALE): {
  locale: Locale;
  dir: Direction;
  /** Pass to SpaceLanguageCard's `onChange`. */
  setLocale: (next: Locale) => void;
} {
  const [locale, setState] = useState<Locale>(initial);
  const setLocale = useCallback((next: Locale) => setState(next), []);
  return { locale, dir: directionOf(locale), setLocale };
}
