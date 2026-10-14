import type { CSSProperties } from "react";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { GuestDesktopShell } from "./guest-desktop-shell";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { DEFAULT_PUBLISHED_THEME } from "@/lib/modules/publishedTheme";
import { translate } from "@/lib/i18n";

/**
 * TASK 033 owner rule: every Guest page lives in the mobile-app shell -
 * including the 404 for an unknown, unpublished or unavailable Space, which
 * used to render the bare framework page outside it. Rendered by the Guest
 * routes' not-found.tsx, so the HTTP status stays a real 404 (decided
 * before any streaming, see guestGate.ts). It cannot see which Space was
 * asked for, so it uses the platform palette and English, and reveals
 * nothing about whether a Space exists.
 */
export function GuestNotFound() {
  const vars = deriveThemeVars({
    name: "InnerDweS",
    logoRef: null,
    palette: DEFAULT_PUBLISHED_THEME.palette,
    customPrimary: null,
    customSecondary: null,
    customNavigation: null,
    customText: null,
    atmosphere: DEFAULT_PUBLISHED_THEME.atmosphere,
    imageStyle: "rounded",
  }) as CSSProperties;
  return (
    <GuestDesktopShell vars={vars} locale="en" heroWait={false} as="main" lang="en" dir="ltr" columnStyle={{ background: "var(--rbr-background)" }}>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center" data-testid="guest-not-found" style={{ minHeight: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <InnerDweSMark size={44} />
        <h1 className="text-[26px] leading-tight" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          {translate("en", "common", "guestNotFoundTitle")}
        </h1>
        <p className="text-[14px] leading-relaxed max-w-[30ch]" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-text-subtle)" }}>
          {translate("en", "common", "guestNotFoundBody")}
        </p>
      </div>
    </GuestDesktopShell>
  );
}
