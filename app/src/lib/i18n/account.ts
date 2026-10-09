import { billingEn } from "./dictionaries/billing.en";
import { billingDe } from "./dictionaries/billing.de";
import { billingEs } from "./dictionaries/billing.es";
import { billingFr } from "./dictionaries/billing.fr";
import { billingHe } from "./dictionaries/billing.he";
import { billingTr } from "./dictionaries/billing.tr";
import { billingIt } from "./dictionaries/billing.it";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/**
 * ACCOUNT-LEVEL dictionaries: the customer billing funnel, the Billing/Plan page, billing
 * emails and the Admin console.
 *
 * Kept apart from the shared dictionaries (index.ts) on purpose. The shared dictionaries are
 * imported by the Guest Apps' client bundles; billing and Admin copy is only ever rendered on
 * the server (or handed to a client component already translated), so adding ~hundreds of keys
 * x 7 locales to the Guest bundles would be a performance regression for no benefit.
 *
 * Same rules as the shared translator: typed keys (checked against English), deterministic
 * fallback to English for a missing key, never a runtime/machine translation, user-authored
 * text never passes through here.
 */
const ACCOUNT = {
  billing: { en: billingEn, de: billingDe, es: billingEs, fr: billingFr, he: billingHe, tr: billingTr, it: billingIt },
} as const;

export type AccountNamespace = keyof typeof ACCOUNT;
export type AccountKey<N extends AccountNamespace> = keyof (typeof ACCOUNT)[N]["en"];
export type AccountValues = Record<string, string | number>;

function interpolate(template: string, values?: AccountValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in values ? String(values[name]) : m));
}

export function translateAccount<N extends AccountNamespace>(locale: Locale, namespace: N, key: AccountKey<N>, values?: AccountValues): string {
  const byLocale = ACCOUNT[namespace] as Record<Locale, Record<string, string>>;
  const localized = byLocale[locale]?.[key as string];
  const source = localized ?? byLocale[DEFAULT_LOCALE][key as string];
  return interpolate(source, values);
}

/** Every key an account namespace defines (English is the contract) - for parity tests. */
export function accountKeys<N extends AccountNamespace>(namespace: N): string[] {
  return Object.keys((ACCOUNT[namespace] as Record<Locale, Record<string, string>>).en);
}

export function accountDictionary<N extends AccountNamespace>(namespace: N, locale: Locale): Record<string, string> {
  return (ACCOUNT[namespace] as Record<Locale, Record<string, string>>)[locale];
}
