import { Geist, Geist_Mono, Fraunces, DM_Serif_Display, DM_Sans } from "next/font/google";

/**
 * The fonts of the (site) root - marketing, auth, My Spaces, both Studios.
 * Moved verbatim out of document-shell.tsx (TASK 033) so that the Guest
 * roots no longer import, and therefore no longer preload, them. Behaviour
 * for every (site) route is unchanged. See document-shell.tsx.
 */

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for the InnerDweS wordmark and deliberately expressive
// brand moments only (font-brand / font-editorial) - see globals.css.
// Not applied globally to interface headings; see the brand implementation
// plan for why.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "500", "600"],
});

// Time to Flow Visual Fidelity Phase 1 - the Guest App's own two-role
// typography system (src/lib/theme/tokens.ts's GUEST_FONT_DISPLAY /
// GUEST_FONT_UI), distinct from InnerDweS's own font-brand/font-editorial
// above. DM Serif Display only ships weight 400 (normal + italic) on
// Google Fonts - Figma's source never uses another weight for it either.
const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const SITE_FONT_VARIABLES = `${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${dmSerifDisplay.variable} ${dmSans.variable}`;
