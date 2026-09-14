import { APP_URL } from "./site-url";

/**
 * The one real, canonical public Guest App URL for a Space - used by
 * Share Your Space, its QR code, and the post-publish share moment.
 * Mirrors the exact fallback every existing call site already inlines
 * (space/page.tsx, retreat-configurator.tsx): /s/[slug] once a slug is
 * reserved, /g/[tenantId] before that. No second URL system - this reads
 * the same two routes that already serve real guest traffic today.
 *
 * Absolute, not relative: a QR code and a "Copy Link" action both need a
 * real origin, unlike the existing in-app `<a href="/s/...">` links that
 * can stay relative because they're rendered inside the app itself.
 * Uses APP_URL (where Studio and today's /s and /g routes are actually
 * served) rather than SITE_URL (the marketing apex) - re-point this at a
 * slug subdomain builder once the Domain Phase 2 <slug>.innerdwes.com
 * cutover in hostname.ts actually goes live.
 */
export function buildGuestSpaceUrl(tenantId: string, slug: string | null): string {
  const path = slug ? `/s/${slug}` : `/g/${tenantId}`;
  return `${APP_URL}${path}`;
}
