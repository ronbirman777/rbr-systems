"use client";

import { useEffect, useRef, useState } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { StudioHeading, StudioIntro } from "./studio-ui";
import { publicSpaceUrl, guestAppPath, qrImagePath } from "@/lib/studio/publicLink";
import { StatusPill } from "@/components/studio/status-pill";
import { PublicLinkCard } from "@/components/studio/public-link-card";
import { QrCodeCard } from "@/components/studio/qr-code-card";
import { CARD_WIDTH, CARD_HEIGHT, drawShareCard, canvasToPngBlob } from "./shareCard";
import { GuestAccessPanel } from "./guest-access-panel";
import type { GuestAccessSettings } from "./guestAccessActions";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
export type ShareSpaceStatus = "live" | "draft" | "inactive";

export type ShareSpaceStepProps = {
  tenantId: string;
  name: string;
  slug: string | null;
  spaceImageUrl: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  primaryHex: string;
  secondaryHex: string;
  status: ShareSpaceStatus;
  initialGuestAccessSettings: GuestAccessSettings;
  /** The Space's system language. */
  locale?: Locale;
};

const STATUS_COPY: Record<ShareSpaceStatus, { label: string; pill: "draft" | "published"; detail: string }> = {
  live: {
    label: "Published",
    pill: "published",
    detail: "Guests can open your app at this link right now.",
  },
  draft: {
    label: "Draft",
    pill: "draft",
    detail: "Publish your Space first - this link won't work for guests until then.",
  },
  inactive: {
    label: "Inactive",
    pill: "draft",
    detail: "This Space was published, but isn't currently publicly available. Check your commercial access.",
  },
};

/**
 * Distribution phase - the one organizer-facing place to get the real
 * public link, its branded Share Card, and an accurate status once a
 * Space is built. Reuses the exact same /s/[slug] -> /g/[tenantId] URL
 * every other t("flow", "viewLiveGuestApp") link in Studio already uses
 * (buildGuestSpaceUrl) - no second URL system. `status` is computed
 * server-side in the page component from published_spaces +
 * isSpacePubliclyAvailable, the same authority the guest routes
 * themselves gate on, so this can never claim "Live" for a Space guests
 * can't actually reach - and Share/Save Image are disabled whenever
 * status isn't "live", so Share can never imply an inactive/unpublished
 * Space is publicly accessible.
 */
export function ShareSpaceStep({
  tenantId,
  name,
  slug,
  spaceImageUrl,
  logoUrl,
  heroImageUrl,
  primaryHex,
  secondaryHex,
  status,
  initialGuestAccessSettings,
  locale = DEFAULT_LOCALE,
}: ShareSpaceStepProps) {
  const { t } = createTranslator(locale);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const url = publicSpaceUrl(tenantId, slug);
  const qrSrc = qrImagePath(tenantId);
  const copy = STATUS_COPY[status];
  const canShareOrSave = status === "live";

  const cardOptions = { name, logoUrl, heroImageUrl, qrUrl: qrSrc, primaryHex, secondaryHex };

  useEffect(() => {
    const visible = previewRef.current;
    if (!visible) return;
    let cancelled = false;

    // Draws into a private, per-effect-run offscreen canvas rather than
    // the shared visible one directly. drawShareCard awaits image loads
    // mid-draw, so two overlapping invocations (React Strict Mode's
    // dev-only double effect-invoke, or a fast prop change re-firing
    // this effect before the previous run finished) would otherwise
    // interleave their clear+draw calls on the SAME canvas and produce
    // exactly the doubled/overlapping render this fixed - only the last
    // still-valid run's finished result ever gets blitted onto the
    // visible canvas, so a superseded run can never corrupt it.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const offscreen = document.createElement("canvas");
    offscreen.width = 300 * dpr;
    offscreen.height = 375 * dpr;

    drawShareCard(offscreen, cardOptions).then(() => {
      if (cancelled) return;
      visible.width = offscreen.width;
      visible.height = offscreen.height;
      const ctx = visible.getContext("2d");
      ctx?.drawImage(offscreen, 0, 0);
      setPreviewReady(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, logoUrl, heroImageUrl, primaryHex, secondaryHex, tenantId]);

  async function renderFullCard(): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    await drawShareCard(canvas, cardOptions);
    return canvasToPngBlob(canvas);
  }

  function downloadBlob(blob: Blob) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${slug ?? tenantId}-share-card.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function handleSaveImage() {
    setActionError(null);
    setBusy("save");
    try {
      const blob = await renderFullCard();
      downloadBlob(blob);
    } catch {
      setActionError(t("studio", "shareCardFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    setActionError(null);
    setBusy("share");
    try {
      const blob = await renderFullCard();
      const file = new File([blob], `${slug ?? tenantId}-share-card.png`, { type: "image/png" });
      const shareText = "Scan to open the retreat app";

      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name, text: shareText });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return; // organizer cancelled - not an error
          // fall through to the next fallback below
        }
      }

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ url, title: name, text: shareText });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      // No Web Share API support at all (most desktop browsers) -
      // download the card instead of failing silently.
      downloadBlob(blob);
    } catch {
      setActionError(t("studio", "shareFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <StudioHeading>{t("studio", "shareYourSpace")}</StudioHeading>
      <StudioIntro>{t("studio", "shareStepBody")}</StudioIntro>

      <div className="rounded-2xl border border-[#E2DACD] bg-white p-5 flex items-center gap-4" data-testid="share-status-card">
        <div
          className="w-16 h-16 rounded-xl overflow-hidden shrink-0"
          style={{ background: GUEST_BASE_PALETTE.parchmentDeep }}
        >
          {spaceImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={spaceImageUrl} alt={name} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium truncate text-[#192B21]">{name}</p>
          <div className="mt-1.5">
            <StatusPill state={copy.pill} label={copy.label} />
          </div>
        </div>
      </div>
      <p className="text-xs mt-2 leading-relaxed text-[#6F6C66]">{copy.detail}</p>

      <div className="mt-6 flex flex-col gap-4">
        <PublicLinkCard url={url} openHref={guestAppPath(tenantId, slug)} published={status !== "draft"} />
        <QrCodeCard tenantId={tenantId} slug={slug} published={status === "live"} />
      </div>

      <GuestAccessPanel tenantId={tenantId} initialSettings={initialGuestAccessSettings} locale={locale} />

      <div className="mt-6 flex flex-col sm:flex-row gap-6 items-start">
        <div className="shrink-0 mx-auto sm:mx-0">
          <div
            className="rounded-2xl overflow-hidden shadow-lg relative"
            style={{ width: 300, height: 375, background: GUEST_BASE_PALETTE.parchmentDeep }}
          >
            <canvas ref={previewRef} style={{ width: 300, height: 375, display: previewReady ? "block" : "none" }} />
            {!previewReady && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                {t("studio", "renderingPreview")}
              </div>
            )}
          </div>
          <p className="text-[10px] text-center mt-2" style={{ color: GUEST_BASE_PALETTE.mist }}>
            {t("studio", "shareCardPreview")}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.dusk }}>
            {t("studio", "shareCardBody")}
          </p>

          {!canShareOrSave && (
            <p className="text-xs mt-3 rounded-xl px-3 py-2" style={{ background: `${GUEST_BASE_PALETTE.sand}40`, color: GUEST_BASE_PALETTE.dusk }}>
              {status === "draft"
                ? t("studio", "publishBeforeSharing")
                : t("studio", "notPubliclyAvailableShare")}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleShare}
              disabled={!canShareOrSave || busy !== null}
              className="text-[13px] font-semibold uppercase tracking-wide px-5 py-2.5 rounded-full disabled:opacity-50"
              style={{ background: GUEST_BASE_PALETTE.forest, color: "white" }}
            >
              {busy === "share" ? t("common", "preparing") : "Share"}
            </button>
            <button
              type="button"
              onClick={handleSaveImage}
              disabled={!canShareOrSave || busy !== null}
              className="text-[13px] font-semibold uppercase tracking-wide px-5 py-2.5 rounded-full border disabled:opacity-50"
              style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
            >
              {busy === "save" ? t("common", "preparing") : t("common", "saveImage")}
            </button>
          </div>
          {actionError && (
            <p className="text-xs text-red-700 mt-2" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
