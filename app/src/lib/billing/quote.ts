import { assertMinor, percentOffMinor, type Minor } from "./money";

/** The commercial terms of a discount, exactly as snapshotted onto a redemption. */
export type DiscountTerms = {
  discountType: "percent" | "fixed_amount";
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: string | null;
  durationType: "once" | "repeating" | "forever";
  durationCycles: number | null;
};

/** Number of billing cycles the discount covers. null = forever. */
export function discountCycleCount(t: Pick<DiscountTerms, "durationType" | "durationCycles">): number | null {
  if (t.durationType === "once") return 1;
  if (t.durationType === "repeating") {
    if (!t.durationCycles || t.durationCycles < 2) throw new Error("repeating discount needs >= 2 cycles");
    return t.durationCycles;
  }
  return null;
}

/** The recurring amount while the discount applies. Never below zero. */
export function discountedAmountMinor(base: Minor, t: DiscountTerms): Minor {
  assertMinor(base, "base");
  if (t.discountType === "percent") {
    if (t.percentOff == null) throw new Error("percent discount without percentOff");
    return base - percentOffMinor(base, t.percentOff);
  }
  if (t.amountOffMinor == null) throw new Error("fixed discount without amountOffMinor");
  return Math.max(0, base - assertMinor(t.amountOffMinor, "amountOff"));
}

export type Quote = {
  currency: string;
  baseMinor: Minor;
  /** Amount charged today (first payment). */
  todayMinor: Minor;
  /** Present when a discount applies. */
  discount: null | {
    /** Recurring amount while discounted. */
    discountedMinor: Minor;
    /** Cycles the discount covers; null = forever. */
    cycles: number | null;
    /** Amount after the discount ends (null when forever). */
    thenMinor: Minor | null;
  };
};

/**
 * The customer-facing price summary. SERVER-computed from the trusted plan and
 * the reserved coupon snapshot - the browser never supplies any input to it.
 * (Informational: Stripe's invoice is authoritative for what is actually
 * charged; tax, where enabled, is added by the single tax source.)
 */
export function buildQuote(plan: { amountMinor: Minor; currency: string }, terms: DiscountTerms | null): Quote {
  const baseMinor = assertMinor(plan.amountMinor, "plan amount");
  if (!terms) return { currency: plan.currency, baseMinor, todayMinor: baseMinor, discount: null };
  if (terms.discountType === "fixed_amount" && terms.currency && terms.currency.toUpperCase() !== plan.currency.toUpperCase()) {
    throw new Error("coupon currency differs from plan currency");
  }
  const discountedMinor = discountedAmountMinor(baseMinor, terms);
  const cycles = discountCycleCount(terms);
  return {
    currency: plan.currency,
    baseMinor,
    todayMinor: discountedMinor,
    discount: { discountedMinor, cycles, thenMinor: cycles == null ? null : baseMinor },
  };
}
