import { setAccountLocaleAction } from "@/app/(site)/create/billingActions";
import { LOCALE_LABEL, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

/**
 * Account-level language picker. Each language is a tiny form posting setAccountLocaleAction(locale, currentPath);
 * the action validates the locale and only redirects to a same-site path. Works without JavaScript.
 * Language names are endonyms and carry their own lang attribute.
 */
export function LanguageSwitch({ current, path, label }: { current: Locale; path: string; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-idw-forest/50 me-1">{label}</span>
      {SUPPORTED_LOCALES.map((l) => {
        const active = l === current;
        return (
          <form key={l} action={setAccountLocaleAction.bind(null, l, path)}>
            <button
              type="submit"
              lang={l}
              aria-current={active ? "true" : undefined}
              className={`inline-flex items-center justify-center min-h-11 min-w-11 px-3 rounded-full text-xs font-semibold border transition-colors ${
                active ? "bg-idw-forest text-idw-parchment border-idw-forest" : "border-idw-forest/20 text-idw-forest hover:border-idw-forest/50 active:bg-idw-forest/10"
              }`}
            >
              {LOCALE_LABEL[l]}
            </button>
          </form>
        );
      })}
    </nav>
  );
}
