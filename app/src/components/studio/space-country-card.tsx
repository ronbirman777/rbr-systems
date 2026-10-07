"use client";

import { useEffect, useState, useTransition } from "react";
import { CountrySelect } from "@/components/forms/country-select";
import { loadSpaceSettings, saveSpaceSettings } from "@/app/(site)/space/spaceSettingsActions";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
/**
 * Where this Space operates. Shared verbatim by Flow and Teach - the
 * setting is product-neutral, so the UI is too.
 *
 * It is explicitly a soft signal, and the copy says so: it suggests a
 * phone country for new numbers and, from CP3, a language. It never
 * rewrites a phone number an organizer already saved, and it is never a
 * lock on anything.
 *
 * The value is an ISO code chosen from the shared dataset; the server
 * re-validates it, so the posted value is never trusted.
 *
 * It loads its own value rather than taking one through each product's
 * Studio data pipeline. That costs one request on mount, and in exchange
 * the card drops into any product without threading a new field through
 * two unrelated loaders - which is the whole point of a shared setting.
 */
type SaveMessage = { ok: true } | { ok: false; text: string };

export function SpaceCountryCard({ tenantId, locale = DEFAULT_LOCALE }: { tenantId: string; locale?: Locale }) {
  const { t } = createTranslator(locale);
  const [country, setCountry] = useState("");
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
        setCountry(settings.country ?? "");
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function commit(next: string) {
    setCountry(next);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSpaceSettings(tenantId, { country: next || null });
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true });
    });
  }

  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5 flex flex-col gap-3" data-testid="space-country-card">
      <div className="flex flex-col gap-1">
        <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">{t("studio", "whereYouAre")}</p>
        <p className="text-[13px] text-[#6F6C66] leading-relaxed max-w-[52ch]">
          {t("studio", "countryCardHint")}
        </p>
      </div>

      <div className="max-w-[22rem]">
        <CountrySelect
          name="spaceCountry"
          label={t("common", "country")}
          value={country}
          onChange={commit}
          disabled={pending || !loaded}
          placeholder={t("studio", "searchCountries")}
        />
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-[12.5px] ${message.ok ? "text-[#3F6A4C]" : "text-[#8F3B3B]"}`}>
          {message.ok ? t("common", "saved") : message.text}
        </p>
      ) : null}
    </div>
  );
}
