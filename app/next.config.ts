import type { NextConfig } from "next";

/**
 * Conservative security headers - Post Migration Cleanup & Security
 * Hardening Batch 01. Deliberately NOT a Content-Security-Policy (that's
 * a separate, larger decision requiring careful testing against Supabase
 * Auth's redirect flow, next/image, and every product surface - out of
 * scope here). HSTS is intentionally omitted too: Vercel already applies
 * `strict-transport-security` at the platform level for verified custom
 * domains (confirmed live against https://innerdwes.com during the
 * Production Readiness Audit) - setting it here as well would only risk
 * disagreeing with that value, never improve on it.
 *
 * Permissions-Policy only disables browser capabilities confirmed unused
 * anywhere in this codebase (checked directly: no getUserMedia, no
 * navigator.geolocation/usb/bluetooth/clipboard/share, no
 * requestFullscreen, no payment/autoplay/encrypted-media/picture-in-
 * picture usage, no <iframe> anywhere) - nothing Supabase Auth, next/image,
 * the Studio, the Configurator, or Guest Spaces actually rely on today.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), fullscreen=()",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Next.js 16.3.3's default Server Action body limit is 1MB (confirmed
    // by the exact runtime error a >1MB request produces: "Body exceeded
    // 1 MB limit") - every image upload goes through a Server Action
    // (uploadBrandImage/uploadModuleItemPhoto in
    // src/app/configurator/retreat/actions.ts), so ANY image near or
    // above 1MB was being rejected by Next's own transport layer before
    // our 8MB product limit (MAX_IMAGE_BYTES, src/lib/media/path.ts) ever
    // got a chance to run - client validation, server validation, and
    // sharp optimization all happen strictly after the request body is
    // already fully received.
    //
    // This raises ONLY that transport ceiling, to 10MB - comfortably
    // above the 8MB product limit (an image this size travels as
    // multipart/form-data, not base64, so its encoded size is the raw
    // file size plus a few hundred bytes of multipart boundary/header
    // overhead per field - 10MB leaves ~2MB of headroom, far more than
    // that real overhead requires). It does NOT change what's actually
    // accepted: MAX_IMAGE_BYTES stays 8MB, unchanged, in both
    // clientValidation.ts (UX-only) and actions.ts's server-side
    // isFileSizeAllowed check (the real, unbypassable enforcement) - a
    // 9MB file still travels through this transport layer successfully,
    // then still gets rejected by the unchanged 8MB check right after.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
