import { resolveSpaceType, type SpaceTypeId } from "./registry";

/**
 * Which Space types have a COMPLETE, safe publish path wired to the shared
 * "Publish / Republish" chip on My Spaces. A type is only `true` once its
 * whole publish path exists end to end (draft media snapshot, product SQL
 * builder in publish_space(), published-media handling). Anything else fails
 * closed: no Publish control is shown and the server action refuses.
 *
 * teach is false on purpose: its publish path needs the versioned-media audio
 * work and the Teach-aware publish_space() (later TASK 027.5 phases). Flip it
 * only when both have landed and are covered by tests.
 */
const PUBLISH_READY: Record<SpaceTypeId, boolean> = {
  retreat: true,
  teach: false,
  client_hub: false,
};

export type PublishAvailability = { available: true } | { available: false; message: string };

export function getPublishAvailability(productType: string | null | undefined): PublishAvailability {
  const resolved = resolveSpaceType(productType);
  if (resolved.kind !== "known") return { available: false, message: "This Space type can't be published here." };
  if (!PUBLISH_READY[resolved.type.id]) {
    return { available: false, message: `Publishing for ${resolved.type.product.name} isn't available yet.` };
  }
  return { available: true };
}
