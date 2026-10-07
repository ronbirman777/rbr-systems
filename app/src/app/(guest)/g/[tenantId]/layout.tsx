import { DocumentShell, sharedMetadata, sharedViewport } from "../../../document-shell";
import { directionOf } from "@/lib/i18n";
import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { socialSpaceByTenantId } from "@/lib/share/publishedSocialSpace";

/**
 * Root layout for the tenant-id-addressed Guest App - the same contract
 * as (guest)/s/[slug]/layout.tsx, keyed by tenant id. See that file for
 * why the Guest document's language has to be server-rendered.
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
    <DocumentShell lang={locale} dir={directionOf(locale)}>
      {children}
    </DocumentShell>
  );
}
