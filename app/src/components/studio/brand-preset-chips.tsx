import type { BrandPreset, BrandPresetKey } from "@/lib/brand/presets";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/**
 * The preset NAMES live in the dictionary, not in presets.ts. The preset
 * data is shared with the publish path and with brand.test.ts, which pins
 * the English labels, so the data keeps its `label` and the chip renders
 * the translation of the preset's key instead. A preset name is design
 * vocabulary, like the typography and corner options, so it is written in
 * the reader's own language rather than left in English.
 */
const PRESET_LABEL: Record<BrandPresetKey, "presetSoftSky" | "presetSageLight" | "presetDeepNavy" | "presetWarmKhaki" | "presetEarthBrown" | "presetDustyRose" | "presetTerracotta" | "presetForest"> = {
  softSky: "presetSoftSky",
  sageLight: "presetSageLight",
  deepNavy: "presetDeepNavy",
  warmKhaki: "presetWarmKhaki",
  earthBrown: "presetEarthBrown",
  dustyRose: "presetDustyRose",
  terracotta: "presetTerracotta",
  forest: "presetForest",
};
/**
 * Shared Brand preset picker: a row of named starting looks. Applying a
 * preset is the caller's job (it just populates the product's existing
 * colour fields), so this stays presentational and product-agnostic.
 */
export function BrandPresetChips({
  presets,
  activeKey,
  onApply,
  label,
  customActive,
  onCustom,
  locale = DEFAULT_LOCALE,
}: {
  presets: readonly BrandPreset[];
  activeKey: string | null;
  onApply: (preset: BrandPreset) => void;
  label?: string;
  /** Renders the separate "Custom colors" option when onCustom is given. */
  customActive?: boolean;
  onCustom?: () => void;
  locale?: Locale;
}) {
  const { t } = createTranslator(locale);
  return (
    <div data-testid="brand-presets">
      <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84] mb-2">{label ?? t("studio", "startFromPreset")}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label ?? t("studio", "startFromPreset")}>
        {presets.map((p) => {
          const active = p.key === activeKey;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onApply(p)}
              aria-pressed={active}
              className={`min-h-11 inline-flex items-center gap-2 pl-2.5 pr-3.5 rounded-full border text-[12.5px] transition-colors ${
                active
                  ? "border-[#192B21] bg-white font-semibold text-[#192B21] shadow-sm"
                  : "border-[#E2DACD] bg-white/60 text-[#4A4A44] hover:bg-white"
              }`}
            >
              <span className="flex" aria-hidden="true">
                <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: p.primary }} />
                <span className="w-4 h-4 rounded-full border border-black/10 -ml-1.5" style={{ background: p.accent }} />
              </span>
              {t("studio", PRESET_LABEL[p.key])}
            </button>
          );
        })}
        {onCustom ? (
          <button
            type="button"
            onClick={onCustom}
            aria-pressed={Boolean(customActive)}
            className={`min-h-11 inline-flex items-center gap-2 px-3.5 rounded-full border border-dashed text-[12.5px] transition-colors ${
              customActive
                ? "border-[#192B21] bg-white font-semibold text-[#192B21] shadow-sm"
                : "border-[#CFC4B4] bg-white/60 text-[#4A4A44] hover:bg-white"
            }`}
          >
            {t("teach", "customColours")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
