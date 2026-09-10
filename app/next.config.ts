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
