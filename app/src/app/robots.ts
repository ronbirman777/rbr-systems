import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Only the three public marketing pages are meant to be crawled. Everything
 * else - auth, Creator/configurator, the private preview-access gate, and
 * the UUID-based public guest route (published but not meant to be
 * search-indexed by tenant ID) - is explicitly disallowed rather than left
 * to whatever a crawler infers from links alone.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/time-to-heal", "/time-to-elevate"],
      disallow: [
        "/sign-up",
        "/log-in",
        "/create",
        "/configurator",
        "/configurator/",
        "/space",
        "/preview-access",
        "/g/",
        "/api/",
        "/auth/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
