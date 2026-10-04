/* eslint-disable @next/next/no-img-element -- Satori renders plain <img>; next/image has no meaning inside an ImageResponse. */
import "server-only";
import type { ReactElement } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { focalPointToObjectPosition } from "@/lib/media/focalPoint";
import { INNERDWES_BRAND } from "@/lib/brand/platform";
import type { SpaceSocialIdentity } from "./spaceSocial";
import { OG_SIZE, SHARE_CARD_SIZE, type ShareCardVariant } from "./shareCardSize";

export { OG_SIZE, SHARE_CARD_SIZE, type ShareCardVariant };

/**
 * The single share visual for every Space type, rendered deterministically
 * from data by Satori (next/og) - never a DOM screenshot, so the same
 * snapshot always produces byte-identical output and nothing depends on a
 * headless browser being available.
 *
 * Two sizes, one design:
 *   "og"    1200x1200  link preview (WhatsApp/social) - no QR, no CTA
 *   "card"  1080x1350  the downloadable Share Card - adds QR + CTA
 *
 * Typography uses a serif/sans stack with no runtime font fetch, exactly
 * as the marketing OG image already does: Satori falls back to its own
 * embedded face, so the card still reads as editorial through scale,
 * letterspacing and colour rather than through a downloaded webfont. A
 * real display serif can be added later via ImageResponse's `fonts`
 * option without touching this layout.
 *
 * The teacher's photo is the subject: it holds the top of the frame at
 * full bleed and is cropped through their own focal point, with a soft
 * scrim into the Space's own parchment so the type sits on calm ground
 * rather than in a boxed-off SaaS header.
 */

export const SHARE_CARD_CTA = "Scan to explore classes & connect";

type Props = {
  identity: SpaceSocialIdentity;
  variant: ShareCardVariant;
  /** Portrait bytes as a data URI, or null to fall back to a brand-tinted ground. */
  imageDataUri: string | null;
  /** QR as an SVG data URI. "card" only. */
  qrDataUri?: string | null;
  cta?: string;
};

function InnerDwesMark({ size, color, accent }: { size: number; color: string; accent: string }) {
  // Same geometry as the marketing OG mark - one definition of the shape,
  // re-tinted to sit quietly inside a customer-branded card.
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke={color}
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
        stroke={accent}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="11.31 214.88"
        transform="rotate(81 50 50)"
      />
      <circle cx="64" cy="36" r="4.5" fill={accent} />
    </svg>
  );
}

export function renderShareCard({ identity, variant, imageDataUri, qrDataUri, cta }: Props): ReactElement {
  const vars = deriveThemeVars(identity.brand);
  const primary = vars["--rbr-primary"];
  const secondary = vars["--rbr-secondary"];
  const background = vars["--rbr-background"];
  const text = vars["--rbr-text"];
  const muted = vars["--rbr-text-muted"];

  const card = variant === "card";
  const { width, height } = card ? SHARE_CARD_SIZE : OG_SIZE;
  const photoHeight = Math.round(height * (card ? 0.54 : 0.68));
  const pad = card ? 76 : 84;
  const nameSize = card ? 76 : 86;
  const roleSize = card ? 25 : 27;
  const locationSize = card ? 27 : 29;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: background,
        fontFamily: "Georgia, serif",
      }}
    >
      {/* Portrait, full bleed, cropped through the teacher's focal point. */}
      <div style={{ display: "flex", position: "relative", width: "100%", height: photoHeight, overflow: "hidden" }}>
        {imageDataUri ? (
          <img
            src={imageDataUri}
            alt=""
            width={width}
            height={photoHeight}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: focalPointToObjectPosition(identity.imagePosition) }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              backgroundImage: `linear-gradient(150deg, ${primary}, ${secondary})`,
            }}
          />
        )}
        {/* Scrim into the page ground: the photo dissolves instead of ending on a hard edge. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: Math.round(photoHeight * 0.34),
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0), ${background})`,
          }}
        />
      </div>

      {/* Identity */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          paddingLeft: pad,
          paddingRight: pad,
          paddingTop: card ? 4 : 10,
          paddingBottom: card ? 48 : 56,
        }}
      >
        {identity.role ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Arial, sans-serif",
              fontSize: roleSize,
              letterSpacing: roleSize * 0.17,
              textTransform: "uppercase",
              color: primary,
              marginBottom: 20,
            }}
          >
            {identity.role}
          </div>
        ) : null}

        <div style={{ display: "flex", fontSize: nameSize, color: text, lineHeight: 1.04, letterSpacing: -1 }}>
          {identity.name}
        </div>

        {identity.location ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Arial, sans-serif",
              fontSize: locationSize,
              color: muted,
              marginTop: 20,
            }}
          >
            {identity.location}
          </div>
        ) : null}

        {card ? (
          <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "space-between", marginTop: 36 }}>
            <div style={{ display: "flex", flexDirection: "column", maxWidth: 560, paddingBottom: 6 }}>
              <div style={{ display: "flex", width: 72, height: 3, backgroundColor: secondary, marginBottom: 28 }} />
              <div style={{ display: "flex", fontSize: 36, color: text, lineHeight: 1.25 }}>
                {cta ?? SHARE_CARD_CTA}
              </div>
            </div>
            {qrDataUri ? (
              <div
                style={{
                  display: "flex",
                  padding: 18,
                  backgroundColor: "#FFFFFF",
                  borderRadius: 28,
                  border: `1px solid ${secondary}`,
                }}
              >
                <img src={qrDataUri} alt="" width={260} height={260} style={{ width: 260, height: 260 }} />
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1 }} />
        )}

        {/* Quiet platform signature - never competes with the teacher. */}
        <div style={{ display: "flex", alignItems: "center", marginTop: card ? 40 : 0 }}>
          <InnerDwesMark size={42} color={muted} accent={INNERDWES_BRAND.clay} />
          <div
            style={{
              display: "flex",
              fontSize: 27,
              fontStyle: "italic",
              color: muted,
              marginLeft: 16,
            }}
          >
            InnerDweS
          </div>
        </div>
      </div>
    </div>
  );
}
