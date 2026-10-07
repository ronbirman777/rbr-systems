"use client";

import { useCallback, useEffect, useState } from "react";
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
  const dir = directionOf(locale);

  /**
   * Keep the DOCUMENT's own language and direction in step with the
   * Studio's.
   *
   * The Studio renders its own `dir` on an inner container, so the layout
   * already mirrors correctly. What stayed wrong is `<html lang>`: the
   * root layout hardcodes "en" for every route, so a fully German or
   * Hebrew Studio still announced itself as English to a screen reader,
   * and `lang`-dependent typography (hyphenation, quotation marks, font
   * fallback) resolved against the wrong language. Production QA, TASK 029.
   *
   * This is an effect rather than server-rendered markup ON PURPOSE, and
   * the distinction matters:
   *
   *   - The GUEST document's locale is known at request time, so it
   *     belongs in server-rendered markup, not here. See the Phase D note
   *     in the task report - it needs a per-branch root layout, which is a
   *     routing change, not a one-line one.
   *   - The STUDIO's locale is client state that changes with no server
   *     round trip at all: pressing "Deutsch" must re-language the
   *     interface immediately. There is no render pass on the server to
   *     carry that, so the only correct mechanism is to write the
   *     attributes after the switch. Writing them in an effect also keeps
   *     the server and the first client render byte-identical, so it
   *     cannot introduce a hydration mismatch.
   *
   * The cleanup restores whatever was there before, so navigating out of
   * the Studio - to My Spaces, say - does not leave the rest of the app
   * claiming to be Hebrew.
   */
  useEffect(() => {
    const root = document.documentElement;
    const previousLang = root.getAttribute("lang");
    const previousDir = root.getAttribute("dir");
    root.setAttribute("lang", locale);
    root.setAttribute("dir", dir);
    return () => {
      if (previousLang === null) root.removeAttribute("lang");
      else root.setAttribute("lang", previousLang);
      if (previousDir === null) root.removeAttribute("dir");
      else root.setAttribute("dir", previousDir);
    };
  }, [locale, dir]);

  return { locale, dir, setLocale };
}
