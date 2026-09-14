/**
 * The single source of truth for Time to Flow subscription pricing.
 * Nothing outside this module should hardcode 25/19/50/69/etc - every
 * price shown anywhere (My Spaces, Share Your Space, a future Stripe
 * checkout, marketing copy data) must be derived from here, so the
 * pricing model can change in one place. A future Stripe integration
 * should treat this as the server-authoritative rule its own
 * quantity-based subscription price is validated against, not a second
 * independent definition of the same numbers.
 *
 * Model: spaces 1-2 are priced individually at the base price; the 3rd
 * space and every one after it add a flat, cheaper increment. This is a
 * deliberate volume-discount curve, not a simple `quantity * price`.
 */

export const BASE_MONTHLY_PRICE_USD = 25;
export const ADDITIONAL_SPACE_PRICE_USD = 19;
const FLAT_TIER_SPACE_COUNT = 2;

/** Done For You Setup - optional, one-time, per Space. Never a required fee. */
export const DONE_FOR_YOU_SETUP_PRICE_USD = 99;

/**
 * quantity is the number of ACTIVE / commercially-enabled Spaces an
 * account is entitled to - not the number of Space rows it owns (an
 * account may own more Spaces than it currently pays to keep active;
 * see the Distribution/Access phase report's multi-Space architecture
 * section for how that distinction is enforced).
 */
export function monthlyPriceForSpaces(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`monthlyPriceForSpaces: quantity must be a non-negative integer, got ${quantity}`);
  }
  if (quantity === 0) return 0;
  if (quantity <= FLAT_TIER_SPACE_COUNT) return quantity * BASE_MONTHLY_PRICE_USD;
  return FLAT_TIER_SPACE_COUNT * BASE_MONTHLY_PRICE_USD + (quantity - FLAT_TIER_SPACE_COUNT) * ADDITIONAL_SPACE_PRICE_USD;
}

/**
 * The "here's what happens if you add one more Space" preview required
 * before an organizer confirms Add Another Space - shows the real
 * before/after subscription total, never just "+$19".
 */
export function pricingPreviewForAddingSpace(currentActiveSpaces: number): {
  currentQuantity: number;
  currentMonthly: number;
  nextQuantity: number;
  nextMonthly: number;
  monthlyIncrease: number;
} {
  const currentQuantity = currentActiveSpaces;
  const nextQuantity = currentActiveSpaces + 1;
  const currentMonthly = monthlyPriceForSpaces(currentQuantity);
  const nextMonthly = monthlyPriceForSpaces(nextQuantity);
  return {
    currentQuantity,
    currentMonthly,
    nextQuantity,
    nextMonthly,
    monthlyIncrease: nextMonthly - currentMonthly,
  };
}

export function formatUsdPerMonth(amountUsd: number): string {
  return `$${amountUsd}/month`;
}
