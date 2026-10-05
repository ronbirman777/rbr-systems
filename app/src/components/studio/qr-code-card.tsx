/* eslint-disable @next/next/no-img-element */
import { qrDownloadFileName, qrImagePath } from "@/lib/studio/publicLink";

import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
/**
 * QR code for the public link, with Download QR. The image is the
 * organizer-only, on-demand /api/qr/[tenantId] PNG (never stored), so it
 * always follows the current slug. Shared across Studios.
 */
export function QrCodeCard({
  tenantId,
  slug,
  published,
  locale = DEFAULT_LOCALE,
}: {
  tenantId: string;
  slug: string | null;
  published: boolean;
  locale?: Locale;
}) {
  const { t } = createTranslator(locale);
  const src = qrImagePath(tenantId);
  return (
    <div className="rounded-2xl border border-[#E2DACD] bg-white p-4 sm:p-5 flex flex-col sm:flex-row gap-5 items-start" data-testid="qr-code-card">
      <div className={`shrink-0 rounded-xl border border-[#E2DACD] bg-[#F3EFE7] p-2 ${published ? "" : "opacity-50"}`}>
        <img src={src} alt={t("studio", "qrCodeAlt")} width={160} height={160} className="block w-40 h-40" />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <p className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[#8C8A84]">{t("studio", "qrCode")}</p>
        <p className="text-[13px] text-[#6F6C66] leading-relaxed max-w-[44ch]">
          Print it or show it on a screen - guests scan it to open your Guest App.
          {published ? "" : " It will work once you publish."}
        </p>
        {published ? (
          <a
            href={src}
            download={qrDownloadFileName(slug)}
            className="inline-flex items-center justify-center self-start min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]"
          >
            {t("studio", "downloadQr")}
          </a>
        ) : (
          <span className="inline-flex items-center self-start min-h-10 px-4 rounded-full border border-[#192B21]/10 text-[12.5px] font-semibold text-[#192B21]/40" aria-disabled="true">
            {t("studio", "downloadQr")}
          </span>
        )}
      </div>
    </div>
  );
}
