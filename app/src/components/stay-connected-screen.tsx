import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { StayConnected } from "@/lib/modules/stayConnected";
import { SOCIAL_PLATFORM_LABEL } from "@/lib/modules/socialLinks";
import { SocialIcon } from "./guest/social-icon";
import type { CSSProperties } from "react";

export type StayConnectedScreenProps = {
  brand: BrandConfig;
  stayConnected: StayConnected;
};

/** Only configured links ever reach this screen - the Studio editor never
 * saves an empty-url row (see stay-connected-step.tsx's handleSave). */
export function StayConnectedScreen({ brand, stayConnected }: StayConnectedScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;

  return (
    <div style={vars} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-7 pb-5">
        <p className="text-[10px] tracking-[0.18em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Keep in Touch
        </p>
        <h1 className="text-[24px] font-normal" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          Stay Connected
        </h1>
      </div>

      {stayConnected.links.length === 0 && (
        <div className="px-6 text-xs" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          Nothing here yet.
        </div>
      )}

      <div className="px-4 pb-10 space-y-2.5">
        {stayConnected.links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 rounded-2xl p-4"
            style={{ background: "var(--rbr-cream)", border: "1px solid color-mix(in srgb, var(--rbr-sand) 40%, transparent)" }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--rbr-parchment-deep)" }}>
              <SocialIcon platform={link.platform} style={{ color: "var(--rbr-text)" }} />
            </div>
            <span className="text-[14px] font-medium" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text)" }}>
              {SOCIAL_PLATFORM_LABEL[link.platform]}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
