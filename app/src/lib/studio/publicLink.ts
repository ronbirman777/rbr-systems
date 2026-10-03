import { buildGuestSpaceUrl } from "@/lib/guestSpaceUrl";

/**
 * Public-link helpers shared by every Studio's Publish & Share surface.
 * The canonical URL itself stays buildGuestSpaceUrl (one URL system).
 */

export function publicSpaceUrl(tenantId: string, slug: string | null): string {
  return buildGuestSpaceUrl(tenantId, slug);
}

/** Same-origin path to open the Guest App (relative so previews stay on their own origin). */
export function guestAppPath(tenantId: string, slug: string | null): string {
  return slug ? `/s/${slug}` : `/g/${tenantId}`;
}

/** Display form: strip the scheme so the link reads cleanly. */
export function displayPublicUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function qrDownloadFileName(slug: string | null): string {
  const safe = (slug ?? "space").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "space";
  return `${safe}-qr.png`;
}

/** Same-origin, organizer-only QR PNG endpoint (generated on demand, never stored). */
export function qrImagePath(tenantId: string): string {
  return `/api/qr/${tenantId}`;
}

/** Clipboard write with a legacy textarea fallback; resolves true on success. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
