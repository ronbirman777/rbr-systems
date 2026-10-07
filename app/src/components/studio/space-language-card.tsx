"use client";

import { useEffect, useState, useTransition } from "react";
import { loadSpaceSettings, saveSpaceSettings } from "@/app/(site)/space/spaceSettingsActions";
import { LOCALE_LABEL, SUPPORTED_LOCALES, recommendedLocales, type Locale } from "@/lib/i18n";

import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
/**
 * The Space's system language. Shared verbatim by Flow and Teach, and
 * ready for Heal - the setting is product-neutral, so the UI is too.
 *
 * Two rules this encodes:
 *
 *   Country recommends, never locks and never reorders. When the Space
 *   has a country, the language that country suggests is marked
 *   "Recommended" - but the list itself is always in the same order and
 *   every supported language stays visible and selectable. Nothing is
 *   inferred about who the organizer is.
 *
 *   Changing the language changes the interface only. Everything the
 *   organizer typed - biography, class descriptions, readings - is left
 *   exactly as written, and the copy says so, because that is the thing
 *   people are right to worry about before clicking.
 *
 * It writes through the same merging action as the country card, so
 * saving a language cannot clear the country.
 */
/**
 * `uiLocale` is what this card RENDERS in; `locale` below is the Space
 * locale it EDITS. They are deliberately different names: the two are
 * the same value in steady state, but while a change is in flight they
 * are not, and conflating them is how a card like this ends up
 * half-switching mid-save.
 */
type SaveMessage = { ok: true } | { ok: false; text: string };

export function SpaceLanguageCard({
  tenantId,
  uiLocale = DEFAULT_LOCALE,
  onChange,
}: {
  tenantId: string;
  uiLocale?: Locale;
  /**
   * Hands the chosen language up to whoever owns the Studio's locale
   * state (see lib/studio/useSpaceLocale.ts).
   *
   * Called OPTIMISTICALLY, before the save resolves, because that is the
   * behaviour the organizer is owed: pressing a language button should
   * change the interface at once, not after a round trip. If the save
   * then fails the message below says so and the stored value is
   * unchanged - the interface is ahead of the database for a moment,
   * which is the right way round for a setting whose only effect is
   * which words are on screen.
   */
  onChange?: (next: Locale) => void;
}) {
  const { t } = createTranslator(uiLocale);
  const [locale, setLocale] = useState<Locale | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /**
   * The success case stores NO text - only the fact that a save
   * succeeded - so `t("common", "saved")` is resolved at RENDER time,
   * against the locale currently on screen.
   *
   * It used to store `text: t("common", "saved")`, resolved inside the
   * transition. `t` is bound to the locale of the render that created the
   * handler, and `setLocale(next)` has not re-rendered by then, so the
   * confirmation froze in the PREVIOUS language: switching to French said
   * "Guardado", switching to Hebrew said "Enregistré". Production QA,
   * TASK 029.
   *
   * The error case still carries its text, because that string comes back
   * from the server action and there is no key to re-resolve it from. It
   * reflects the locale of the request that produced it, which is the
   * closest thing to correct that is available here.
   */
  const [message, setMessage] = useState<SaveMessage | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadSpaceSettings(tenantId)
      .then((settings) => {
        if (cancelled) return;
        setLocale((settings.locale as Locale | null) ?? null);
        setCountry(settings.country);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const recommended = recommendedLocales(country);
  /**
   * The canonical selector order, always - never reordered by country.
   *
   * A recommendation is a BADGE on an option, not a different list. The
   * earlier version put recommended languages first, which meant the
   * same selector presented its five options in a different order
   * depending on the Space's country; an organizer who had learned where
   * their language sits would have to find it again. See
   * `recommendedLocales` for the rest of that reasoning.
   */
  const ordered: Locale[] = [...SUPPORTED_LOCALES];

  function commit(next: Locale) {
    setLocale(next);
    onChange?.(next);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSpaceSettings(tenantId, { locale: next });
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true });
    });
  }

  const effective: Locale = locale ?? "en";

  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5 flex flex-col gap-3" data-testid="space-language-card">
      <div className="flex flex-col gap-1">
        <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">{t("common", "language")}</p>
        <p className="text-[13px] text-[#6F6C66] leading-relaxed max-w-[52ch]">
          {t("studio", "languageCardHint")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("studio", "systemLanguage")}>
        {ordered.map((code) => {
          const active = effective === code;
          // English is in every recommendation list, so badging it would
          // make the badge meaningless. Only the country's own language
          // is marked.
          const isRecommended = recommended.length > 1 && code !== "en" && recommended.includes(code);
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending || !loaded}
              onClick={() => commit(code)}
              data-locale={code}
              className={`min-h-11 px-4 rounded-full border text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                active ? "border-[#192B21] bg-[#192B21] text-white" : "border-[#D9D1C3] bg-white text-[#192B21]"
              }`}
            >
              <span lang={code}>{LOCALE_LABEL[code]}</span>
              {isRecommended && !active ? (
                <span className="ms-2 text-[11px] font-medium text-[#8C8A84]">{t("common", "recommended")}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {locale === null && loaded ? (
        <p className="text-[12px] text-[#8C8A84]">{t("studio", "languageNotSetYet")}</p>
      ) : null}

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-[12.5px] ${message.ok ? "text-[#3F6A4C]" : "text-[#8F3B3B]"}`}>
          {message.ok ? t("common", "saved") : message.text}
        </p>
      ) : null}
    </div>
  );
}
