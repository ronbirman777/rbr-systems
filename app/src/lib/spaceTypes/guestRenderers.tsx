import "server-only";
import type { ReactElement } from "react";
import { PublishedSpaceScreen, type PublishedSpaceRow } from "@/components/guest/published-space-screen";
import { TeachPublishedSpaceScreen } from "@/components/teach/teach-published-screen";
import { resolveSpaceType, type GuestRendererKey } from "./registry";

/**
 * Server-only map from a registry `guest.renderer` key to the component that
 * renders a published snapshot. Kept out of registry.ts so guest components
 * never enter client bundles through the registry.
 */
const GUEST_RENDERERS: Record<GuestRendererKey, (props: { space: PublishedSpaceRow }) => ReactElement> = {
  retreat: ({ space }) => <PublishedSpaceScreen space={space} />,
  teach: ({ space }) => <TeachPublishedSpaceScreen space={space} />,
};

/**
 * Renders a published Space by its DB product_type. Returns null for an
 * unknown type or a type without a guest app - the caller must then fail
 * visibly (notFound), never render another product's app.
 */
export function renderPublishedSpace(productType: string | null | undefined, space: PublishedSpaceRow): ReactElement | null {
  const resolved = resolveSpaceType(productType);
  if (resolved.kind !== "known" || !resolved.type.guest) return null;
  const Renderer = GUEST_RENDERERS[resolved.type.guest.renderer];
  return <Renderer space={space} />;
}
