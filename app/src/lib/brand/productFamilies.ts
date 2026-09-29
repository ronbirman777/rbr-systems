import { INNERDWES_BRAND } from "./platform";
import { SPACE_TYPES } from "@/lib/spaceTypes/registry";

/**
 * Display-layer identity for InnerDweS's product families. The Space types
 * (retreat / client_hub / teach) are derived from the Space Type Registry
 * (src/lib/spaceTypes/registry.ts), which is their source of truth.
 * "sanctuary" (Time to Elevate) is a marketing-only family, not a Space type
 * anyone can create, so it stays defined here.
 */
const fromRegistry = (id: keyof typeof SPACE_TYPES) => ({
  name: SPACE_TYPES[id].product.name,
  tagline: SPACE_TYPES[id].product.tagline,
  accent: SPACE_TYPES[id].product.accent,
});

export const PRODUCT_FAMILIES = {
  retreat: fromRegistry("retreat"),
  client_hub: fromRegistry("client_hub"),
  teach: fromRegistry("teach"),
  sanctuary: {
    name: "Time to Elevate",
    tagline: "Bespoke digital ecosystems for wellness organizations.",
    accent: INNERDWES_BRAND.forest,
  },
} as const;

export type ProductTypeKey = keyof typeof PRODUCT_FAMILIES;
