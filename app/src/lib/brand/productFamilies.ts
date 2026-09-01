import { INNERDWES_BRAND } from "./platform";

/**
 * Display-layer identity for InnerDweS's product families. Maps the
 * existing `tenants.product_type` values (unchanged in the database) to
 * how each product line presents itself within the InnerDweS system -
 * distinct accents, same underlying brand. Adding "sanctuary" here is
 * forward-looking only; nothing currently writes that product_type.
 */
export const PRODUCT_FAMILIES = {
  retreat: {
    name: "Time to Flow",
    tagline: "For retreats and wellness programs.",
    accent: INNERDWES_BRAND.clay,
  },
  client_hub: {
    name: "Time to Heal",
    tagline: "For practitioners and their clients.",
    accent: INNERDWES_BRAND.sage,
  },
  sanctuary: {
    name: "Time to Elevate",
    tagline: "Bespoke digital ecosystems for wellness organizations.",
    accent: INNERDWES_BRAND.forest,
  },
} as const;

export type ProductTypeKey = keyof typeof PRODUCT_FAMILIES;
