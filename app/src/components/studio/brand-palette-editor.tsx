"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { BrandPreset } from "@/lib/brand/presets";
import { PRESET_LABEL } from "@/lib/brand/presetLabels";
import { customSectionStartsOpen, nextPresetIndex, type PaletteSelection } from "@/lib/brand/paletteEditor";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { ColorField } from "./studio-fields";

export type PaletteRole = "primary" | "accent" | "surface";

/**
 * TASK 033 Brand editor simplification - the ONE colour editor shared by
 * the Time to Flow and Time to Teach Brand steps.
 *
 * 1. The eight preset palette cards are the primary choice (the Teach
 *    cards, styling unchanged: preset surface, two 24px dots, the name in
 *    the preset's text colour, 2px forest border when selected). A
 *    radiogroup with roving focus; the selected card also shows a check
 *    mark and "Selected" text, so the state is never colour-only.
 * 2. "Customize colors" (aria-expanded / aria-controls) opens exactly
 *    Primary colour, Accent colour and Background tint. Collapsed when a
 *    preset (or a legacy default) is in use, open when the Space already
 *    has custom colours - which then also shows a selected "Custom
 *    colours" card.
 * 3. Applying a preset or editing a colour only reports the change; the
 *    product saves it through its existing Save (no auto-save, never
 *    publish). Navigation and text colours are not edited here: a preset
 *    writes them as before, a custom edit leaves them as saved.
 *
 * Keep-last-custom: when `onRestore` is given (the parent remembered the
 * custom colours the organizer left by picking a preset), a "Restore my
 * custom colours" button is offered inside the custom section.
 */
export function BrandPaletteEditor({
  presets,
  selection,
  colors,
  onApplyPreset,
  onChange,
  onRestore,
  hints,
  locale = DEFAULT_LOCALE,
  dir,
  children,
}: {
  presets: readonly BrandPreset[];
  selection: PaletteSelection;
  /** The effective colours shown in the custom section. */
  colors: Record<PaletteRole, string>;
  onApplyPreset: (preset: BrandPreset) => void;
  onChange: (role: PaletteRole, hex: string) => void;
  onRestore?: () => void;
  hints?: Partial<Record<PaletteRole, string>>;
  locale?: Locale;
  dir?: "ltr" | "rtl";
  /** Rendered under the custom section (e.g. the shared contrast feedback). */
  children?: ReactNode;
}) {
  const { t } = createTranslator(locale);
  const sectionId = useId();
  const [open, setOpen] = useState(() => customSectionStartsOpen(selection));
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const custom = selection.mode === "custom";
  // Radio items: the presets, plus the "Custom colours" card while custom is in use.
  const count = presets.length + (custom ? 1 : 0);
  const checkedIndex = custom ? presets.length : presets.findIndex((p) => p.key === selection.selectedKey);
  const tabIndexFor = (i: number) => (i === (checkedIndex >= 0 ? checkedIndex : 0) ? 0 : -1);

  function activate(i: number) {
    if (i < presets.length) onApplyPreset(presets[i]);
    else setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = cardRefs.current.findIndex((el) => el === document.activeElement);
    const next = nextPresetIndex(current < 0 ? 0 : current, e.key, count, dir === "rtl");
    if (next === null) return;
    e.preventDefault();
    cardRefs.current[next]?.focus();
    activate(next);
  }

  const swatches = (role: "primary" | "accent" | "surface") => presets.map((p) => ({ label: t("studio", PRESET_LABEL[p.key]), hex: p[role] }));
  const check = (
    <span aria-hidden="true" className="absolute top-2 end-2 w-5 h-5 rounded-full bg-[#192B21] text-white text-[11px] leading-5 text-center">
      ✓
    </span>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="brand-palette-editor">
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
        role="radiogroup"
        aria-label={t("studio", "palettePresets")}
        data-testid="brand-presets"
        onKeyDown={onKeyDown}
      >
        {presets.map((p, i) => {
          const selected = selection.mode === "preset" && selection.selectedKey === p.key;
          return (
            <button
              key={p.key}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={tabIndexFor(i)}
              data-preset={p.key}
              onClick={() => activate(i)}
              className="relative flex flex-col gap-2 p-3 min-h-11 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192B21]"
              style={{ background: p.surface, border: selected ? "2px solid #192B21" : "1px solid #E2DACD" }}
            >
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="w-6 h-6 rounded-full" style={{ background: p.primary }} />
                <span className="w-6 h-6 rounded-full" style={{ background: p.accent }} />
              </span>
              <span className="text-[13px] font-semibold" style={{ color: p.text }}>
                {t("studio", PRESET_LABEL[p.key])}
                {selected ? <span className="sr-only">, {t("studio", "paletteSelected")}</span> : null}
              </span>
              {selected ? check : null}
            </button>
          );
        })}
        {custom ? (
          <button
            ref={(el) => {
              cardRefs.current[presets.length] = el;
            }}
            type="button"
            role="radio"
            aria-checked
            tabIndex={0}
            data-preset="custom"
            onClick={() => activate(presets.length)}
            className="relative flex flex-col gap-2 p-3 min-h-11 rounded-xl text-left bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192B21]"
            style={{ border: "2px solid #192B21" }}
          >
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="w-6 h-6 rounded-full" style={{ background: colors.primary }} />
              <span className="w-6 h-6 rounded-full" style={{ background: colors.accent }} />
            </span>
            <span className="text-[13px] font-semibold text-[#192B21]">
              {t("studio", "customColours")}
              <span className="sr-only">, {t("studio", "paletteSelected")}</span>
            </span>
            {check}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={sectionId}
        onClick={() => setOpen((v) => !v)}
        data-testid="customize-colours"
        className="self-start min-h-11 inline-flex items-center gap-2 px-4 rounded-full border border-[#192B21]/20 bg-white text-[13px] font-semibold text-[#192B21] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#192B21]"
      >
        {t("studio", "customizeColours")}
        <span aria-hidden="true" className={`inline-block transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {/* Height animates with grid rows (0fr -> 1fr); `inert` keeps the
          collapsed fields out of the tab order and the accessibility tree. */}
      <div
        id={sectionId}
        className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        inert={!open}
        data-open={open ? "true" : "false"}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-4 sm:grid-cols-2 pt-1 pb-1 px-0.5">
            <ColorField
              locale={locale}
              label={t("studio", "primaryColour")}
              value={colors.primary}
              checkWhiteText
              swatches={swatches("primary")}
              hint={hints?.primary}
              onChange={(hex) => onChange("primary", hex)}
            />
            <ColorField
              locale={locale}
              label={t("studio", "accentColour")}
              value={colors.accent}
              swatches={swatches("accent")}
              hint={hints?.accent}
              onChange={(hex) => onChange("accent", hex)}
            />
            <div className="sm:col-span-2">
              <ColorField
                locale={locale}
                label={t("studio", "backgroundTint")}
                value={colors.surface}
                swatches={swatches("surface")}
                hint={hints?.surface}
                onChange={(hex) => onChange("surface", hex)}
              />
            </div>
            {onRestore ? (
              <button
                type="button"
                onClick={onRestore}
                className="sm:col-span-2 self-start min-h-11 px-1 text-[13px] font-semibold underline text-[#192B21]"
              >
                {t("studio", "restoreCustomColours")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
