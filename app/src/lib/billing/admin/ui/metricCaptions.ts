/** One-line definitions shown under each Overview metric. Mirrors the definitions in ../metrics.ts. */
export const METRIC_CAPTIONS = {
  paidSubscriptions: "Active or trialing, not exempt. Past-due ones are counted under Payment failures.",
  paidSpaces: "Distinct Spaces with a non-exempt, not-ended subscription (includes past due).",
  mrrList: "Gross list value: sum of base plan prices of paid subscriptions, before any discount.",
  mrrCurrent: "Current recurring amount after discounts in force, same subscriptions as list value.",
  discounted: "Paid subscriptions with a coupon discount still running.",
  paymentFailures: "Open payment-failure episode on a subscription that has not ended.",
  guestSuspended: "Failure unresolved for 24 hours or more: the Guest App is unavailable.",
  studioSuspended: "Failure unresolved for 7 days or more: Studio is suspended.",
  scheduledCancellations: "Active subscriptions set to end at the period end.",
  deletionEligible: "Failure unresolved for 14 days: eligible for the deletion workflow (never an instant delete).",
  exempt: "Internal/legacy Spaces kept operational without a subscription. Not counted as paying; never in revenue.",
  openCheckouts: "Checkouts started and awaiting payment.",
  failedEvents: "Stripe webhook events that failed processing.",
  stuckCheckouts: "Paid or provisioning checkouts that have not finished creating a Space.",
  paidCheckoutFlag: "Whether customers can buy a paid Space right now.",
} as const;
