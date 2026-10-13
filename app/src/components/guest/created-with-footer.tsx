import { createTranslator, type Locale } from "@/lib/i18n/core";

/** Canonical brand URL. Deliberately a constant: never a Vercel alias or SITE_URL. */
export const BRAND_URL = "https://innerdwes.com";
const BRAND = "InnerDweS";
const SENTINEL = "\u0000";

/**
 * The always-on Guest App signature ("Created with InnerDweS"). Low priority, in
 * normal flow (no overlap with navigation, no layout shift), no tracking: the only
 * parameter is a non-identifying source tag.
 */
export function CreatedWithFooter({ locale, source }: { locale: Locale; source: "teach" | "flow" }) {
  const { t } = createTranslator(locale);
  const [before = "", after = ""] = t("attribution", "createdWith", { brand: SENTINEL }).split(SENTINEL);
  return (
    <p
      className="flex-shrink-0 w-full text-center text-[11px] leading-4 py-2 px-4"
      style={{ color: "rgb(90 84 74)" }}
    >
      {before}
      <a
        href={`${BRAND_URL}/?ref=guest_app&src=${source}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("attribution", "linkLabel", { brand: BRAND })}
        className="inline-block min-h-6 underline underline-offset-2 font-medium"
      >
        {BRAND}
      </a>
      {after}
    </p>
  );
}
