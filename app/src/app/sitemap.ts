import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Intentionally lists only the three public marketing pages - no
 * auth/Creator/configurator routes, no per-tenant guest URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/time-to-heal`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/time-to-elevate`, lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
