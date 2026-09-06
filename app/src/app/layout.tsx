import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
