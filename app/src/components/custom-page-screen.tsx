import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { DisplayCustomPage } from "@/lib/modules/customPage";
import { objectPositionStyle } from "@/lib/modules/imagePosition";
import type { CSSProperties } from "react";

import { BrandImage } from "@/components/shared/brand-image";
export type CustomPageScreenProps = {
  brand: BrandConfig;
  page: DisplayCustomPage;
};

/** One organizer-chosen page. Body is plain text (whitespace-pre-line) -
 * there is no rich-text/HTML surface anywhere in this codebase to render,
 * matching "no executable HTML" exactly by never introducing one. */
/** This product renders inside a fixed 390px device frame from `sm` up. */
const SIZES = "(min-width: 640px) 390px, 100vw";

export function CustomPageScreen({ brand, page }: CustomPageScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      {page.imageUrl && (
        <div className="relative h-[180px]">
          <BrandImage
            src={page.imageUrl}
            alt=""
            className="w-full h-full"
            sizes={SIZES}
            style={{ objectPosition: objectPositionStyle(page.imagePosition) }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.15), transparent 60%)" }} />
        </div>
      )}
      <div className="px-6 pt-7 pb-10">
        <h1 dir="auto" className="text-[24px] font-normal leading-tight" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          {page.title}
        </h1>
        {page.body && (
          <p className="text-[14px] leading-relaxed whitespace-pre-line mt-4" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-dusk)" }}>
            {page.body}
          </p>
        )}
      </div>
    </div>
  );
}
