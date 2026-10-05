"use client";

import { useEffect, useState, useTransition } from "react";
import { loadSpaceSettings, saveSpaceSettings } from "@/app/space/spaceSettingsActions";
import { LOCALE_LABEL, SUPPORTED_LOCALES, recommendedLocales, type Locale } from "@/lib/i18n";

import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
/**
 * The Space's system language. Shared verbatim by Flow and Teach, and
 * ready for Heal - the setting is product-neutral, so the UI is too.
 *
 * Two rules this encodes:
 *
 *   Country recommends, never locks. When the Space has a country, the
 *   languages that country suggests are marked "Recommended" and listed
 *   first - but every supported language stays visible and selectable.
 *   Nothing is inferred about who the organizer is.
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
export function SpaceLanguageCard({ tenantId, uiLocale = DEFAULT_LOCALE }: { tenantId: string; uiLocale?: Locale }) {
  const { t } = createTranslator(uiLocale);
  const [locale, setLocale] = useState<Locale | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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
  // Recommended first, then everything else - ordered, never filtered.
  const ordered: Locale[] = [
    ...recommended,
    ...SUPPORTED_LOCALES.filter((l) => !recommended.includes(l)),
  ];

  function commit(next: Locale) {
    setLocale(next);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSpaceSettings(tenantId, { locale: next });
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: t("common", "saved") });
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
          const isRecommended = recommended.includes(code) && recommended.length > 1;
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
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
