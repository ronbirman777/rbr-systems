import { ImageResponse } from "next/og";
import { INNERDWES_BRAND } from "@/lib/brand/platform";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "InnerDweS · Digital Wellness Solutions";

/**
 * Social share image for the public marketing routes only (colocated in
 * the (marketing) route group, so private/product pages never inherit it).
 * Built entirely from existing InnerDweS tokens/mark geometry - no new
 * photography, no new logo. Text uses a serif fallback stack rather than
 * fetching Fraunces at request time, to keep this generation simple and
 * dependency-free; still reads as an editorial serif, just not a pixel
 * match for the site's own webfont.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: INNERDWES_BRAND.forest,
          fontFamily: "Georgia, serif",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 100 100" style={{ marginBottom: 36 }}>
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke={INNERDWES_BRAND.parchment}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="199.05 27.14"
            transform="rotate(111.6 50 50)"
          />
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke={INNERDWES_BRAND.clay}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="11.31 214.88"
            transform="rotate(81 50 50)"
          />
          <circle cx="64" cy="36" r="4.5" fill={INNERDWES_BRAND.clay} />
        </svg>
        <div
          style={{
            fontSize: 64,
            fontStyle: "italic",
            color: INNERDWES_BRAND.parchment,
            letterSpacing: "-0.01em",
          }}
        >
          InnerDweS
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 22,
            fontFamily: "Arial, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            fontWeight: 600,
            color: INNERDWES_BRAND.clay,
          }}
        >
          Digital Wellness Solutions
        </div>
      </div>
    ),
    { ...size }
  );
}
