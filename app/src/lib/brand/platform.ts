/**
 * InnerDweS platform brand - fixed, non-configurable colors for the
 * platform's OWN chrome (marketing, auth, Create Your Space, the
 * configurator's shell, dashboards). This is deliberately independent
 * from src/lib/theme/tokens.ts, which defines colors a CUSTOMER can choose
 * for their generated app. Nothing in this file should be imported by, or
 * referenced from, the customer theme engine, and vice versa.
 */
export const INNERDWES_BRAND = {
  forest: "#192B21", // primary
  parchment: "#F3EFE7", // primary ground
  clay: "#A86750", // restrained accent only - never a dominant surface color
  sage: "#BAC5B2",
  graphite: "#232926",
  linen: "#EBE1D5",
} as const;
