import type { CSSProperties } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayGuideline } from "@/lib/modules/guideline";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { FlowEmptyNote, FlowScreenHeader } from "./flow-screen-chrome";

export type GuidelinesScreenProps = {
  brand: BrandConfig;
  guidelines: DisplayGuideline[];
  locale?: Locale;
};

/**
 * Guidelines (TASK 029, P5).
 *
 * A plain read-through list, not an accordion. House rules are short and
 * a guest wants all of them at once - FAQ collapses because a guest is
 * looking for one answer among many, which is the opposite situation.
 * So there is nothing to open, nothing to toggle, and no client state:
 * this is a server component.
 */
export function GuidelinesScreen({ brand, guidelines, locale = DEFAULT_LOCALE }: GuidelinesScreenProps) {
  const { t } = createTranslator(locale);
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <FlowScreenHeader eyebrow={t("flow", "eyebrowGuidelines")} title={t("flow", "guidelines")} />

      {guidelines.length === 0 ? (
        <FlowEmptyNote>{t("flow", "nothingAddedYet")}</FlowEmptyNote>
      ) : (
        <div className="px-4 pb-10 space-y-2.5">
          {guidelines.map((g, i) => (
            <div
              key={i}
              className="rounded-3xl px-5 py-4"
              style={{
                background: "var(--rbr-cream)",
                border: "1px solid color-mix(in srgb, var(--rbr-sand) 35%, transparent)",
              }}
            >
              <h3
                dir="auto"
                className="text-[15px] leading-snug"
                style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}
              >
                {g.title}
              </h3>
              {g.description && (
                <p
                  dir="auto"
                  className="text-[13px] leading-relaxed mt-1.5 whitespace-pre-line"
                  style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}
                >
                  {g.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
