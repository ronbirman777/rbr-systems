import { z } from "zod";
import { socialLinksSchema } from "./socialLinks";

/**
 * "stayConnected" module_key - module_settings singleton (same table/
 * pattern as arrivalInfo). data = { links: [{platform, url}, ...] } - an
 * array of typed link objects, not one fixed-key object with
 * instagram/facebook/... as named fields, so a future platform needs
 * only a code change (widen SOCIAL_PLATFORMS), never a migration.
 */
export const stayConnectedSchema = z.object({
  links: socialLinksSchema,
});

export type StayConnected = z.infer<typeof stayConnectedSchema>;

export const EMPTY_STAY_CONNECTED: StayConnected = { links: [] };
