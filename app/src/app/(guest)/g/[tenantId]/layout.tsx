import { Suspense } from "react";
import { DocumentShell, sharedMetadata, sharedViewport } from "../../../document-shell";
import { directionOf } from "@/lib/i18n";
import { socialSpaceByTenantId } from "@/lib/share/publishedSocialSpace";
import { GuestLoadingScreen } from "@/components/guest/guest-loading-screen";
import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { GUEST_FONT_VARIABLES } from "../../guest-fonts";
import { guestGate } from "../../guestGate";

/**
 * Root layout for the tenant-id-addressed Guest App - the same contract
 * as (guest)/s/[slug]/layout.tsx, keyed by tenant id. See that file for
 * why the Guest document's language has to be server-rendered, and for the
 * TASK 033 gate-before-stream structure this mirrors exactly (access is
 * decided before any Suspense boundary, so denials keep a real 404).
 *
 * TASK 033 also removed this route's double access chain: the page used to
 * run its own published_spaces read and resolveGuestAccess() after this
 * layout had already run socialSpaceByTenantId(). Both now use that one
 * React-cached loader, so the chain executes once per request.
 */
export const viewport = sharedViewport;
export const metadata = sharedMetadata;

export default async function GuestTenantRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const loaded = await socialSpaceByTenantId(tenantId);
  const locale = localeFromPublishedModules(loaded?.modules ?? null);
  return (
    <DocumentShell lang={locale} dir={directionOf(locale)} fontVariables={GUEST_FONT_VARIABLES}>
      {guestGate(loaded) === "app" ? <Suspense fallback={<GuestLoadingScreen locale={locale} />}>{children}</Suspense> : children}
    </DocumentShell>
  );
}
