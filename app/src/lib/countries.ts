/**
 * Task 015 - signup Country + Phone fields. No existing country list or
 * calling-code convention exists anywhere in this repository (confirmed
 * by search before writing this file) - this is a new, minimal, self-
 * contained dataset, not a new dependency. ISO 3166-1 alpha-2 code is the
 * stored `country` value (compact, unambiguous, and the same code doubles
 * as the lookup key for the phone calling code) rather than the display
 * name, which can be localized/changed without touching stored data.
 */
export type Country = { code: string; name: string; dialCode: string };

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dialCode: "+1" },
  { code: "CA", name: "Canada", dialCode: "+1" },
  { code: "GB", name: "United Kingdom", dialCode: "+44" },
  { code: "IE", name: "Ireland", dialCode: "+353" },
  { code: "IL", name: "Israel", dialCode: "+972" },
  { code: "AU", name: "Australia", dialCode: "+61" },
  { code: "NZ", name: "New Zealand", dialCode: "+64" },
  { code: "DE", name: "Germany", dialCode: "+49" },
  { code: "FR", name: "France", dialCode: "+33" },
  { code: "ES", name: "Spain", dialCode: "+34" },
  { code: "PT", name: "Portugal", dialCode: "+351" },
  { code: "IT", name: "Italy", dialCode: "+39" },
  { code: "NL", name: "Netherlands", dialCode: "+31" },
  { code: "BE", name: "Belgium", dialCode: "+32" },
  { code: "CH", name: "Switzerland", dialCode: "+41" },
  { code: "AT", name: "Austria", dialCode: "+43" },
  { code: "SE", name: "Sweden", dialCode: "+46" },
  { code: "NO", name: "Norway", dialCode: "+47" },
  { code: "DK", name: "Denmark", dialCode: "+45" },
  { code: "FI", name: "Finland", dialCode: "+358" },
  { code: "PL", name: "Poland", dialCode: "+48" },
  { code: "CZ", name: "Czechia", dialCode: "+420" },
  { code: "GR", name: "Greece", dialCode: "+30" },
  { code: "TR", name: "Turkey", dialCode: "+90" },
  { code: "RO", name: "Romania", dialCode: "+40" },
  { code: "HU", name: "Hungary", dialCode: "+36" },
  { code: "UA", name: "Ukraine", dialCode: "+380" },
  { code: "RU", name: "Russia", dialCode: "+7" },
  { code: "IN", name: "India", dialCode: "+91" },
  { code: "CN", name: "China", dialCode: "+86" },
  { code: "JP", name: "Japan", dialCode: "+81" },
  { code: "KR", name: "South Korea", dialCode: "+82" },
  { code: "SG", name: "Singapore", dialCode: "+65" },
  { code: "TH", name: "Thailand", dialCode: "+66" },
  { code: "ID", name: "Indonesia", dialCode: "+62" },
  { code: "PH", name: "Philippines", dialCode: "+63" },
  { code: "VN", name: "Vietnam", dialCode: "+84" },
  { code: "MY", name: "Malaysia", dialCode: "+60" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { code: "EG", name: "Egypt", dialCode: "+20" },
  { code: "ZA", name: "South Africa", dialCode: "+27" },
  { code: "NG", name: "Nigeria", dialCode: "+234" },
  { code: "KE", name: "Kenya", dialCode: "+254" },
  { code: "MA", name: "Morocco", dialCode: "+212" },
  { code: "MX", name: "Mexico", dialCode: "+52" },
  { code: "BR", name: "Brazil", dialCode: "+55" },
  { code: "AR", name: "Argentina", dialCode: "+54" },
  { code: "CL", name: "Chile", dialCode: "+56" },
  { code: "CO", name: "Colombia", dialCode: "+57" },
  { code: "PE", name: "Peru", dialCode: "+51" },
  { code: "CR", name: "Costa Rica", dialCode: "+506" },
  { code: "PA", name: "Panama", dialCode: "+507" },
  { code: "JM", name: "Jamaica", dialCode: "+1876" },
  { code: "IS", name: "Iceland", dialCode: "+354" },
  { code: "HR", name: "Croatia", dialCode: "+385" },
  { code: "RS", name: "Serbia", dialCode: "+381" },
  { code: "BG", name: "Bulgaria", dialCode: "+359" },
  { code: "SK", name: "Slovakia", dialCode: "+421" },
  { code: "SI", name: "Slovenia", dialCode: "+386" },
  { code: "LT", name: "Lithuania", dialCode: "+370" },
  { code: "LV", name: "Latvia", dialCode: "+371" },
  { code: "EE", name: "Estonia", dialCode: "+372" },
  { code: "CY", name: "Cyprus", dialCode: "+357" },
  { code: "MT", name: "Malta", dialCode: "+356" },
  { code: "LU", name: "Luxembourg", dialCode: "+352" },
  { code: "PK", name: "Pakistan", dialCode: "+92" },
  { code: "BD", name: "Bangladesh", dialCode: "+880" },
  { code: "LK", name: "Sri Lanka", dialCode: "+94" },
  { code: "NP", name: "Nepal", dialCode: "+977" },
  { code: "QA", name: "Qatar", dialCode: "+974" },
  { code: "KW", name: "Kuwait", dialCode: "+965" },
  { code: "BH", name: "Bahrain", dialCode: "+973" },
  { code: "OM", name: "Oman", dialCode: "+968" },
  { code: "JO", name: "Jordan", dialCode: "+962" },
  { code: "LB", name: "Lebanon", dialCode: "+961" },
  { code: "XX", name: "Other / Not Listed", dialCode: "+" },
];

export const COUNTRY_BY_CODE: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c])
);

/** Digits-only national-number check, deliberately permissive (4-14
 * digits covers the real-world range of national significant numbers
 * without pretending to be a full per-country length table, which does
 * not exist anywhere in this repository to reuse). */
export function isLikelyValidNationalNumber(value: string): boolean {
  return /^[0-9]{4,14}$/.test(value.trim());
}

/** Combines a dial code and a national number into the single normalized
 * string persisted in `profiles.phone` (e.g. "+972501234567") - storage-
 * side, this is one plain string column, not a structured type, matching
 * every other free-text profile field in this schema. */
export function formatPhone(dialCode: string, nationalNumber: string): string {
  return `${dialCode}${nationalNumber.trim()}`;
}
