import type { Metadata } from "next";
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
