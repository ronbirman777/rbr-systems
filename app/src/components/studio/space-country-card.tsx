"use client";

import { useEffect, useState, useTransition } from "react";
import { CountrySelect } from "@/components/forms/country-select";
import { loadSpaceSettings, saveSpaceSettings } from "@/app/space/spaceSettingsActions";

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
export function SpaceCountryCard({ tenantId, locale = DEFAULT_LOCALE }: { tenantId: string; locale?: Locale }) {
  const { t } = createTranslator(locale);
  const [country, setCountry] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: t("common", "saved") });
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
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
