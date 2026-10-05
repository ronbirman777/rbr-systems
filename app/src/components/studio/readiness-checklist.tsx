import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

export type ReadinessItem = { ok: boolean; label: string; hint?: string };

/** "Ready to publish?" checklist - ticks for done items, a warning mark for gaps. */
export function ReadinessChecklist({ items, locale = DEFAULT_LOCALE }: { items: readonly ReadinessItem[]; locale?: Locale }) {
  const { t } = createTranslator(locale);
  return (
    <ul className="flex flex-col gap-2.5" data-testid="readiness-checklist">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-3 text-[13px]">
          <span
            aria-hidden="true"
            className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] ${
              item.ok ? "bg-[#E4EEE4] text-[#2D4A3E]" : "bg-[#F6E7DC] text-[#9A5B2F]"
            }`}
          >
            {item.ok ? "✓" : "!"}
          </span>
          <span className={item.ok ? "text-[#192B21]" : "text-[#8A4F27]"}>
            <span className="sr-only">{item.ok ? t("studio", "doneLabel") : t("studio", "needsAttentionLabel")}{" "}</span>
            {item.label}
            {!item.ok && item.hint ? <span className="block text-[12px] text-[#8C8A84]">{item.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
