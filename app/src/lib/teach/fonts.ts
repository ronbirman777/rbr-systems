import { Cormorant_Garamond, Lora } from "next/font/google";

/**
 * The two extra display faces Time to Teach's "Serene" and "Modern"
 * typography pairings need. Loaded here (not in the root layout) so no other
 * product downloads them; applied as CSS variables on the Teach guest root.
 * DM Serif Display / DM Sans / Fraunces / Geist are already loaded globally.
 *
 * TASK 033 (P5 font diet): not preloaded. Only Spaces that chose the
 * serene or modern pairing ever render them, so preloading them made every
 * Guest page (Flow included) download four font files it would not use.
 * They still self-host and load on first use with `display: swap`.
 * `latin-ext` is declared for explicit Turkish coverage (ğ ş ı İ); in
 * next/font `subsets` only selects preloads, and every subset is
 * self-hosted behind its unicode-range regardless - see
 * app/(guest)/guest-fonts.ts.
 */
export const teachCormorant = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-tt-cormorant",
  display: "swap",
  preload: false,
});

export const teachLora = Lora({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-tt-lora",
  display: "swap",
  preload: false,
});

export const TEACH_FONT_VARIABLES = `${teachCormorant.variable} ${teachLora.variable}`;
