/* eslint-disable @next/next/no-img-element */
import { shareCardDownloadFileName, shareCardImagePath } from "@/lib/studio/publicLink";

/**
 * The designed Share Card: a generated, downloadable image carrying the
 * teacher's photo, name, role, the QR and a short CTA. Shared across
 * Studios - the card itself is rendered server-side from whatever the
 * Space type publishes, so this component never needs product-specific
 * copy of its own.
 *
 * The preview <img> and the Download button point at the same organizer-
 * only endpoint; the browser reuses the one response rather than
 * generating the image twice.
 */
export function ShareCardPanel({
  tenantId,
  slug,
  published,
}: {
  tenantId: string;
  slug: string | null;
  published: boolean;
}) {
  const src = shareCardImagePath(tenantId);
  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5 flex flex-col sm:flex-row gap-5 items-start" data-testid="share-card-panel">
      <div className={`shrink-0 rounded-xl border border-[#E2DACD] overflow-hidden ${published ? "" : "opacity-50"}`}>
        {published ? (
          <img src={src} alt="Your share card" width={176} height={220} className="block w-44 h-[220px] object-cover" />
        ) : (
          <div className="w-44 h-[220px] bg-[#F3EFE7]" />
        )}
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">Share card</p>
        <p className="text-[13px] text-[#6F6C66] leading-relaxed max-w-[44ch]">
          A ready-to-send card with your photo, your name and your QR code - for WhatsApp, email, social or printing.
          {published ? "" : " It will be ready once you publish."}
        </p>
        {published ? (
          <a
            href={src}
            download={shareCardDownloadFileName(slug)}
            className="inline-flex items-center justify-center self-start min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]"
            data-testid="download-share-card"
          >
            Download share card
          </a>
        ) : (
          <span className="inline-flex items-center self-start min-h-10 px-4 rounded-full border border-[#192B21]/10 text-[12.5px] font-semibold text-[#192B21]/40" aria-disabled="true">
            Download share card
          </span>
        )}
      </div>
    </div>
  );
}
