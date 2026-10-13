import { Geist, Geist_Mono, Fraunces, DM_Serif_Display, DM_Sans } from "next/font/google";

/**
 * TASK 033 (plan 4.6, P5 "font diet") - the fonts of the Guest roots.
 *
 * Same five families and the same CSS variables as the (site) root
 * (app/site-fonts.ts), so every Guest typography token resolves exactly as
 * before. What changes is only WHICH files are preloaded: before, all 11
 * font files (≈350 KB) were preloaded on every Guest page and fetched
 * alongside the CSS, competing with the hero image.
 *
 * Preloaded - the faces above the fold of BOTH products' default look:
 *   DM Sans (normal)                    Flow's UI face; Teach body text
 *                                       for the classic/editorial/serene
 *                                       pairings. Variable font: one file.
 *   DM Serif Display (normal + italic)  Flow's display face; Teach's
 *                                       default ("classic") display face.
 *                                       Static 400: two files.
 *   = 3 preloaded files (asserted by app/guestFonts.test.ts; target <= 3).
 *
 * Not preloaded (still self-hosted and loaded on first use, display swap):
 *   Fraunces  - Teach "editorial" display; the InnerDweS wordmark.
 *   Geist     - Teach "modern" body; the document's default body face,
 *               which every Guest App overrides with its own.
 *   Geist Mono- not used by any Guest surface.
 *   Cormorant Garamond / Lora (lib/teach/fonts.ts) - Teach "serene" and
 *               "modern" display faces, only for Spaces that chose them.
 *
 * Turkish (and every other latin-ext language): `subsets` in next/font
 * only selects which files are PRELOADED - the generated @font-face CSS
 * self-hosts every subset Google serves, each behind its unicode-range
 * (verified in next/dist/compiled/@next/font/dist/google/loader.js: the
 * CSS is never filtered by subset; findFontFilesInCss only flags preloads).
 * So ğ ş ı İ already render in the right face. latin-ext is declared below
 * for every face that is not preloaded, to make that coverage explicit at
 * no cost; it is deliberately NOT added to the three preloaded faces, which
 * would double the preload budget for glyphs only Turkish Spaces use (tr is
 * not yet selectable - SPACE_SELECTABLE_LOCALES). A Turkish page fetches the
 * small latin-ext file on first use.
 */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
  preload: false,
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  weight: ["300", "500", "600"],
  preload: false,
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
  preload: true,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  preload: true,
});

export const GUEST_FONT_VARIABLES = `${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${dmSerifDisplay.variable} ${dmSans.variable}`;
