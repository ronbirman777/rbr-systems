import QRCode from "qrcode";

/**
 * Shared QR generation for every Space type's Publish & Share surface.
 *
 * Deterministic by construction: a QR is produced from a URL string by the
 * `qrcode` library, never by screenshotting DOM. The same URL always
 * yields the same bytes, which is what lets the share card be regenerated
 * server-side instead of captured from a browser.
 *
 * Callers pass a URL that THEY derived server-side from their own stored
 * data. Nothing here fetches or validates a URL, so the one security rule
 * for every call site is: never pass a URL that arrived in the request.
 */

export const QR_DARK = "#1B2E24";
export const QR_LIGHT = "#F3EFE7";

export type QrOptions = {
  dark?: string;
  light?: string;
  /** Quiet-zone width in modules. 2 is the practical minimum that still scans. */
  margin?: number;
  width?: number;
};

export async function qrPngBuffer(url: string, opts: QrOptions = {}): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: opts.margin ?? 2,
    width: opts.width ?? 640,
    color: { dark: opts.dark ?? QR_DARK, light: opts.light ?? QR_LIGHT },
  });
}

/**
 * An `<img src=...>`-ready SVG data URI. Satori (next/og) cannot run the
 * canvas/PNG path, but it does render an <img> whose src is an inline SVG,
 * so this is how a QR gets into a generated share card or OG image.
 */
export async function qrSvgDataUri(url: string, opts: QrOptions = {}): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: opts.margin ?? 2,
    color: { dark: opts.dark ?? QR_DARK, light: opts.light ?? QR_LIGHT },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/** Download filename for a Space's QR/share card: "<slug>-qr.png". */
export function shareFileName(slug: string | null, suffix: string): string {
  const safe = (slug ?? "space").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "space";
  return `${safe}-${suffix}.png`;
}
