import { safeTextColor } from "@/lib/theme/contrast";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";

/**
 * TASK 033 branded loading: the colours the Guest loading screen paints,
 * taken from the PUBLISHED snapshot the root layout has already loaded, so
 * the loader sits on the same ground the Guest App will paint next - no
 * flash of a different palette at hand-over.
 *
 *   Time to Teach  modules.teach.settings.teachStyle.background (--tt-bg)
 *   Time to Flow   parchment. The Flow Guest App (published-space-screen
 *                  and the Studio preview) does not pass customSurface to
 *                  deriveThemeVars today, so it always paints parchment;
 *                  the loader matches what is actually painted (a finding
 *                  reported in docs/tasks/033 - not changed here).
 *   otherwise      parchment, exactly as before
 *
 * The text colour is whichever of cream/forest is AA on that ground; the
 * official symbol keeps its own colours, switching only to its existing
 * "on-dark" tone on a dark ground (same geometry, never redrawn).
 */
export type GuestLoaderProduct = "retreat" | "teach" | null;
export type GuestLoaderPalette = { background: string; text: string; tone: "on-light" | "on-dark" };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function loaderPaletteFor(background: string | null | undefined): GuestLoaderPalette {
  const bg = typeof background === "string" && HEX.test(background) ? background : GUEST_BASE_PALETTE.parchment;
  const text = safeTextColor(bg);
  return { background: bg, text, tone: text === "#FBF9F5" ? "on-dark" : "on-light" };
}

export function guestLoaderProduct(productType: unknown): GuestLoaderProduct {
  return productType === "retreat" || productType === "teach" ? productType : null;
}

/** The published ground colour for the loader, or null (parchment). Never throws on legacy/odd snapshots. */
export function publishedLoaderBackground(row: { product_type?: unknown; theme?: unknown; modules?: unknown } | null | undefined): string | null {
  if (!row) return null;
  try {
    if (row.product_type === "retreat") return null;
    if (row.product_type === "teach") {
      const bg = (row.modules as { teach?: { settings?: { teachStyle?: { background?: unknown } } } } | null)?.teach?.settings?.teachStyle?.background;
      return typeof bg === "string" && HEX.test(bg) ? bg : null;
    }
  } catch {
    /* fall through to parchment */
  }
  return null;
}
