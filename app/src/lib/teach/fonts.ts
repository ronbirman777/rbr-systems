import { Cormorant_Garamond, Lora } from "next/font/google";

/**
 * The two extra display faces Time to Teach's "Serene" and "Modern"
 * typography pairings need. Loaded here (not in the root layout) so no other
 * product downloads them; applied as CSS variables on the Teach guest root.
 * DM Serif Display / DM Sans / Fraunces / Geist are already loaded globally.
 */
export const teachCormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-tt-cormorant",
  display: "swap",
});

export const teachLora = Lora({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-tt-lora",
  display: "swap",
});

export const TEACH_FONT_VARIABLES = `${teachCormorant.variable} ${teachLora.variable}`;
