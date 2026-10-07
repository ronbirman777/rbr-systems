import { DocumentShell, sharedMetadata, sharedViewport } from "../document-shell";

/**
 * Root layout for everything that is not a published Guest App: the
 * marketing pages, auth, My Spaces, both Studios and the preview gate.
 *
 * These surfaces are English-chrome by default. The Studio is the one
 * exception - its interface follows the Space's language - but that is
 * CLIENT state that changes with no server round trip, so the document's
 * own `lang`/`dir` are kept in step from lib/studio/useSpaceLocale.ts
 * rather than from here. See that hook for why an effect is the correct
 * mechanism there and server-rendered markup is the correct one for the
 * Guest roots below.
 */
export const viewport = sharedViewport;
export const metadata = sharedMetadata;

export default function SiteRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <DocumentShell lang="en" dir="ltr">
      {children}
    </DocumentShell>
  );
}
