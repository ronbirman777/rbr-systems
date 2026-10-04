"use client";

import { useEffect, useState, useTransition } from "react";
import { CountrySelect } from "@/components/forms/country-select";
import { loadSpaceSettings, saveSpaceSettings } from "@/app/space/spaceSettingsActions";

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
export function SpaceCountryCard({ tenantId }: { tenantId: string }) {
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
      setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: "Saved" });
    });
  }

  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5 flex flex-col gap-3" data-testid="space-country-card">
      <div className="flex flex-col gap-1">
        <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">Where you are</p>
        <p className="text-[13px] text-[#6F6C66] leading-relaxed max-w-[52ch]">
          Used to suggest a phone country for new numbers. It never changes a number you have already saved, and it is
          not shown to guests.
        </p>
      </div>

      <div className="max-w-[22rem]">
        <CountrySelect
          name="spaceCountry"
          label="Country"
          value={country}
          onChange={commit}
          disabled={pending || !loaded}
          placeholder="Search countries"
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
