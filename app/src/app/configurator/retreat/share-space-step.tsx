"use client";

import { useEffect, useRef, useState } from "react";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { StudioHeading, StudioIntro } from "./studio-ui";
import { buildGuestSpaceUrl } from "@/lib/guestSpaceUrl";
import { CARD_WIDTH, CARD_HEIGHT, drawShareCard, canvasToPngBlob } from "./shareCard";
import { GuestAccessPanel } from "./guest-access-panel";
import type { GuestAccessSettings } from "./guestAccessActions";

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
};

const STATUS_COPY: Record<ShareSpaceStatus, { label: string; dotClass: string; detail: string }> = {
  live: {
    label: "Live",
    dotClass: "bg-idw-sage",
    detail: "Guests can open your app at this link right now.",
  },
  draft: {
    label: "Draft",
    dotClass: "bg-idw-clay",
    detail: "Publish your Space first - this link won't work for guests until then.",
  },
  inactive: {
    label: "Inactive",
    dotClass: "bg-idw-forest/30",
    detail: "This Space was published, but isn't currently publicly available. Check your commercial access.",
  },
};

/**
 * Distribution phase - the one organizer-facing place to get the real
 * public link, its branded Share Card, and an accurate status once a
 * Space is built. Reuses the exact same /s/[slug] -> /g/[tenantId] URL
 * every other "View live guest app" link in Studio already uses
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
}: ShareSpaceStepProps) {
  const [copied, setCopied] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const url = buildGuestSpaceUrl(tenantId, slug);
  const qrSrc = `/api/qr/${tenantId}`;
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable - the URL is still
      // fully visible and selectable in the field below, so there's
      // nothing more useful to do than leave the button unchanged.
    }
  }

  async function handleSaveImage() {
    setActionError(null);
    setBusy("save");
    try {
      const blob = await renderFullCard();
      downloadBlob(blob);
    } catch {
      setActionError("Could not generate the Share Card. Try again.");
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
      setActionError("Could not share the Share Card. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <StudioHeading>Share Your Space</StudioHeading>
      <StudioIntro>Everything you need to send your retreat app to guests, in one place.</StudioIntro>

      <div className="rounded-2xl border p-5 flex items-center gap-4" style={{ borderColor: "rgba(45,74,62,0.12)" }}>
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
          <p className="text-[15px] font-medium truncate" style={{ color: GUEST_BASE_PALETTE.forest }}>
            {name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-2 h-2 rounded-full ${copy.dotClass}`} />
            <span className="text-xs font-semibold" style={{ color: GUEST_BASE_PALETTE.forest }}>
              {copy.label}
            </span>
          </div>
        </div>
      </div>
      <p className="text-xs mt-2 leading-relaxed" style={{ color: GUEST_BASE_PALETTE.mist }}>
        {copy.detail}
      </p>

      <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "rgba(45,74,62,0.12)" }}>
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: GUEST_BASE_PALETTE.mist }}>
          Guest App URL
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 text-[13px] bg-transparent outline-none"
            style={{ color: GUEST_BASE_PALETTE.forest }}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-full border"
            style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-[12px] underline"
          style={{ color: GUEST_BASE_PALETTE.forest }}
        >
          Open Guest App ↗
        </a>
      </div>

      <GuestAccessPanel tenantId={tenantId} initialSettings={initialGuestAccessSettings} />

      <div className="mt-6 flex flex-col sm:flex-row gap-6 items-start">
        <div className="shrink-0 mx-auto sm:mx-0">
          <div
            className="rounded-2xl overflow-hidden shadow-lg relative"
            style={{ width: 300, height: 375, background: GUEST_BASE_PALETTE.parchmentDeep }}
          >
            <canvas ref={previewRef} style={{ width: 300, height: 375, display: previewReady ? "block" : "none" }} />
            {!previewReady && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px]" style={{ color: GUEST_BASE_PALETTE.mist }}>
                Rendering preview…
              </div>
            )}
          </div>
          <p className="text-[10px] text-center mt-2" style={{ color: GUEST_BASE_PALETTE.mist }}>
            Share Card preview
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-relaxed" style={{ color: GUEST_BASE_PALETTE.dusk }}>
            A finished, branded invitation card for guests - your retreat name, logo, and a large scannable QR code,
            ready to send directly.
          </p>

          {!canShareOrSave && (
            <p className="text-xs mt-3 rounded-xl px-3 py-2" style={{ background: `${GUEST_BASE_PALETTE.sand}40`, color: GUEST_BASE_PALETTE.dusk }}>
              {status === "draft"
                ? "Publish your Space before sharing this card - the QR won't work for guests until then."
                : "This Space isn't currently publicly available, so sharing this card would be misleading. Check your commercial access."}
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
              {busy === "share" ? "Preparing…" : "Share"}
            </button>
            <button
              type="button"
              onClick={handleSaveImage}
              disabled={!canShareOrSave || busy !== null}
              className="text-[13px] font-semibold uppercase tracking-wide px-5 py-2.5 rounded-full border disabled:opacity-50"
              style={{ color: GUEST_BASE_PALETTE.forest, borderColor: "rgba(45,74,62,0.2)" }}
            >
              {busy === "save" ? "Preparing…" : "Save Image"}
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
