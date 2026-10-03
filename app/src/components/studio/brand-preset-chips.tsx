import type { BrandPreset } from "@/lib/brand/presets";

/**
 * Shared Brand preset picker: a row of named starting looks. Applying a
 * preset is the caller's job (it just populates the product's existing
 * colour fields), so this stays presentational and product-agnostic.
 */
export function BrandPresetChips({
  presets,
  activeKey,
  onApply,
  label = "Start from a preset",
}: {
  presets: readonly BrandPreset[];
  activeKey: string | null;
  onApply: (preset: BrandPreset) => void;
  label?: string;
}) {
  return (
    <div data-testid="brand-presets">
      <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84] mb-2">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
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
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
