import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { CSSProperties } from "react";

export type TodayScreenProps = {
  tenantName: string;
  brand: BrandConfig;
};

/**
 * The one real, data-driven screen this pass proves the preview-engine
 * architecture with: the exact same component renders inside the
 * configurator's live-preview pane and (once wired) the published app route,
 * from the exact same config shape. No screenshots, no drift.
 */
export function TodayScreen({ tenantName, brand }: TodayScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div
      style={{
        ...vars,
        background: "var(--rbr-background)",
        borderRadius: "var(--rbr-radius-lg)",
        padding: "var(--rbr-spacing-unit)",
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
      className="w-full h-full flex flex-col gap-4 overflow-hidden"
    >
      <div
        style={{
          background: "var(--rbr-primary)",
          color: "var(--rbr-on-primary)",
          borderRadius: "var(--rbr-radius-md)",
          padding: "var(--rbr-spacing-unit)",
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.16em] opacity-70">
          Today&apos;s Briefing
        </div>
        <div className="text-xl font-serif mt-1">Good morning.</div>
        <div className="text-xs opacity-80 mt-1">{tenantName || "Your space"}</div>
      </div>

      <div
        style={{
          background: "var(--rbr-surface)",
          borderRadius: "var(--rbr-radius-md)",
          padding: "var(--rbr-spacing-unit)",
        }}
        className="flex-1"
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-black/40">
          Happening Now
        </div>
        <div className="text-sm font-medium mt-2" style={{ color: "var(--rbr-primary)" }}>
          Morning Session
        </div>
        <div className="text-xs text-black/50 mt-0.5">9:00 AM</div>
      </div>
    </div>
  );
}
