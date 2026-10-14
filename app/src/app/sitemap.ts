import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";
import { LEGAL_BASE_PATH, LEGAL_DOCUMENTS, legalHref } from "@/lib/legal/documents";

/**
 * Intentionally lists only the three public marketing pages and the public
 * legal documents - no auth/Creator/configurator routes, no per-tenant guest
 * URLs. A legal page's lastModified is its registry lastUpdated date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/time-to-heal`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/time-to-elevate`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}${LEGAL_BASE_PATH}`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    ...LEGAL_DOCUMENTS.map((d) => ({
      url: `${SITE_URL}${legalHref(d.id)}`,
      lastModified: new Date(`${d.lastUpdated}T00:00:00Z`),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
