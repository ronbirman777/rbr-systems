import { billingEn } from "./dictionaries/billing.en";
import { billingDe } from "./dictionaries/billing.de";
import { billingEs } from "./dictionaries/billing.es";
import { billingFr } from "./dictionaries/billing.fr";
import { billingHe } from "./dictionaries/billing.he";
import { billingTr } from "./dictionaries/billing.tr";
import { billingIt } from "./dictionaries/billing.it";
import { adminEn } from "./dictionaries/admin.en";
import { adminDe } from "./dictionaries/admin.de";
import { adminEs } from "./dictionaries/admin.es";
import { adminFr } from "./dictionaries/admin.fr";
import { adminHe } from "./dictionaries/admin.he";
import { adminTr } from "./dictionaries/admin.tr";
import { adminIt } from "./dictionaries/admin.it";
import { interpolate } from "./interpolate";
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
  admin: { en: adminEn, de: adminDe, es: adminEs, fr: adminFr, he: adminHe, tr: adminTr, it: adminIt },
} as const;

export type AccountNamespace = keyof typeof ACCOUNT;
export type AccountKey<N extends AccountNamespace> = keyof (typeof ACCOUNT)[N]["en"];
export type AccountValues = Record<string, string | number>;

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
