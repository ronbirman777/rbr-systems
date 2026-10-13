"use client";

import { useEffect, useState, useTransition } from "react";
import { loadSpaceSettings, saveSpaceSettings } from "@/app/(site)/space/spaceSettingsActions";
import { CurrencySelect } from "@/components/forms/currency-select";
import { DEFAULT_SPACE_CURRENCY } from "@/lib/currencies";
import { setSpaceCurrency, useSpaceDefaultCurrency as useStoreDefault } from "@/lib/currencies/spaceCurrencyStore";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * The Space default currency for pre-filling new priced items: EUR until
 * loaded and when unset. Follows the card above live (shared client store).
 */
export function useSpaceDefaultCurrency(tenantId: string): string {
  return useStoreDefault(tenantId, loadSpaceSettings);
}

type SaveMessage = { ok: true } | { ok: false; text: string };

/**
 * The Space's default currency (TASK 033, D-CC3). Shared by Flow and Teach,
 * mounted next to the Space language card.
 *
 *   - Unset resolves to EUR, and the card says so.
 *   - It only PRE-FILLS new priced items (Flow Treatments & Extras, Teach My
 *     Retreats). Existing items keep their own currency; amounts are never
 *     converted. There is deliberately no bulk "apply to existing" here.
 *   - It writes through the same merging action as the language card, so
 *     saving a currency cannot clear the locale or country.
 *
 * Retreat-item pricing only - this has nothing to do with InnerDweS billing.
 */
export function SpaceCurrencyCard({ tenantId, uiLocale = DEFAULT_LOCALE }: { tenantId: string; uiLocale?: Locale }) {
  const { t } = createTranslator(uiLocale);
  const [stored, setStored] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<SaveMessage | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadSpaceSettings(tenantId)
      .then((settings) => {
        if (cancelled) return;
        setStored(settings.currency ?? null);
        setSpaceCurrency(tenantId, settings.currency);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function commit(code: string) {
    const previous = stored;
    setStored(code);
    setSpaceCurrency(tenantId, code);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSpaceSettings(tenantId, { currency: code });
      if (result.error) {
        setStored(previous);
        setSpaceCurrency(tenantId, previous);
        setMessage({ ok: false, text: result.error });
      } else {
        setMessage({ ok: true });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5 flex flex-col gap-3" data-testid="space-currency-card">
      <div className="flex flex-col gap-1">
        <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">{t("studio", "spaceCurrencyTitle")}</p>
        <p className="text-[13px] text-[#6F6C66] leading-relaxed max-w-[52ch]">{t("studio", "spaceCurrencyHint")}</p>
      </div>

      <div className="max-w-sm">
        <CurrencySelect
          label={t("studio", "spaceCurrencyTitle")}
          locale={uiLocale}
          value={stored ?? DEFAULT_SPACE_CURRENCY}
          onChange={commit}
          disabled={pending || !loaded}
        />
      </div>

      {stored === null && loaded ? (
        <p className="text-[12px] text-[#8C8A84]">{t("studio", "spaceCurrencyNotSet", { code: DEFAULT_SPACE_CURRENCY })}</p>
      ) : null}

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-[12.5px] ${message.ok ? "text-[#3F6A4C]" : "text-[#8F3B3B]"}`}>
          {message.ok ? t("common", "saved") : message.text}
        </p>
      ) : null}
    </div>
  );
}
