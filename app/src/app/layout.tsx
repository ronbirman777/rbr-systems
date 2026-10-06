import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, DM_Serif_Display, DM_Sans } from "next/font/google";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

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

/**
 * `viewportFit: "cover"` is what makes env(safe-area-inset-*) resolve to
 * anything other than zero.
 *
 * Without it the page is laid out inside the notch-safe rectangle and
 * every inset reads 0, which is why the Guest App's existing
 * `pb-[max(env(safe-area-inset-bottom),14px)]` had been silently
 * collapsing to a flat 14px on every device since it was written. Opting
 * in means the page now extends under the notch and the home indicator,
 * so everything that sits against an edge has to pad itself with the real
 * inset - which the Guest shells now do.
 *
 * `interactiveWidget: "resizes-content"` keeps the on-screen keyboard
 * from floating a fixed bottom bar over the field being typed into.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  // Required so page-level openGraph/twitter image paths (see the
  // marketing route group's opengraph-image.tsx) resolve to an absolute
  // URL for social crawlers rather than a bare relative path.
  metadataBase: new URL(SITE_URL),
  title: "InnerDweS · Digital Wellness Solutions",
  description: "We are giving digital solutions to the wellness world.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${dmSerifDisplay.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
