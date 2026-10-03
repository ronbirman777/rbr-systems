import { resolveSpaceType, type SpaceTypeId } from "./registry";

/**
 * Which Space types have a COMPLETE, safe publish path wired to the shared
 * "Publish / Republish" chip on My Spaces. A type is only `true` once its
 * whole publish path exists end to end (draft media snapshot, product SQL
 * builder in publish_space(), published-media handling). Anything else fails
 * closed: no Publish control is shown and the server action refuses.
 *
 * teach became true with migration 0028 (build_teach_payload + the Teach
 * branch of publish_space()) together with the versioned-media publish flow in
 * publishTeachSpace(). client_hub stays false: it has no publish path.
 */
const PUBLISH_READY: Record<SpaceTypeId, boolean> = {
  retreat: true,
  teach: true,
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
