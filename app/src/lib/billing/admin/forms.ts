import type { CouponDraft } from "./policy";

/** FormData -> the raw object couponInputSchema validates. Empty strings become null; nothing is trusted. */
export function couponFormToRaw(fd: FormData): Record<string, unknown> {
  const text = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const orNull = (k: string) => (text(k) === "" ? null : text(k));
  const list = (k: string) => fd.getAll(k).map(String).filter(Boolean);
  const discountType = text("discountType");
  const dateTimeOrNull = (k: string) => {
    const v = text(k);
    if (!v) return null;
    const d = new Date(v); // <input type="datetime-local"> / date: interpreted as UTC when no offset is given
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  };
  return {
    code: text("code"),
    description: orNull("description"),
    discountType,
    percentOff: discountType === "percent" ? orNull("percentOff") : null,
    amountOffMinor: discountType === "fixed_amount" ? (text("amountOff") === "" ? null : Math.round(Number(text("amountOff")) * 100)) : null,
    currency: discountType === "fixed_amount" ? orNull("currency") : null,
    usageRule: text("usageRule"),
    durationType: text("durationType"),
    durationCycles: text("durationType") === "repeating" ? orNull("durationCycles") : null,
    validFrom: dateTimeOrNull("validFrom"),
    validUntil: dateTimeOrNull("validUntil"),
    globalMaxRedemptions: orNull("globalMaxRedemptions"),
    planKeys: list("planKeys").length ? list("planKeys") : null,
    spaceTypes: list("spaceTypes").length ? list("spaceTypes") : null,
  };
}

export function draftOfRaw(raw: Record<string, unknown>): CouponDraft {
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return {
    discountType: raw.discountType === "fixed_amount" ? "fixed_amount" : "percent",
    percentOff: num(raw.percentOff),
    amountOffMinor: num(raw.amountOffMinor),
    durationType: raw.durationType === "repeating" || raw.durationType === "forever" ? raw.durationType : "once",
  };
}
