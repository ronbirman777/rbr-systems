import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";

/**
 * Pure validation logic, deliberately kept OUT of featuredActions.ts:
 * every export from a "use server" file must itself be an async Server
 * Action (a real Next.js build-time constraint, confirmed directly -
 * `next build` fails otherwise), and this is a plain synchronous
 * function. Client-side validation here is a UX convenience only - the
 * same rules are enforced again by the database (is_valid_
 * additional_links + CHECK constraints on website/instagram/lengths),
 * which is the real, unbypassable gate.
 */
export function validateAdditionalLinks(
  links: { label: string; url: string }[],
  locale: Locale = DEFAULT_LOCALE
): string | null {
  const t = (key: "tooManyLinks" | "linkNeedsLabel" | "linkNeedsHttp") => translate(locale, "flow", key);
  if (links.length > 6) return t("tooManyLinks");
  for (const link of links) {
    if (!link.label || link.label.length > 60) return t("linkNeedsLabel");
    if (!link.url || link.url.length > 500 || !/^https?:\/\//i.test(link.url)) {
      return t("linkNeedsHttp");
    }
  }
  return null;
}
