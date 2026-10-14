import { L, MAIL, p, section, table, ul, type LegalDocumentBody } from "./types";

export const billingBody: LegalDocumentBody = {
  intro: [
    p(
      `This Billing, Cancellation & Refund Policy applies if you purchase a Paid Plan for InnerDweS, such as a subscription for a Space or a one-time setup service. It forms part of our ${L.terms}. Mandatory consumer rights that apply to you are not affected by anything in this policy.`,
    ),
  ],
  sections: [
    section("scope", "1. Scope", [
      p(
        "This policy covers subscriptions, renewals, payment methods, taxes, upgrades and downgrades, coupons, cancellation, refunds, statutory withdrawal rights and failed payments. Features that do not require payment are not affected by it.",
      ),
    ]),
    section("plans-prices", "2. Plans and prices", [
      p(
        "Paid Plans are generally priced per Space per month. Our current base price is shown on our website and in the Service. The price, currency, billing frequency and entitlements shown at checkout govern your purchase.",
      ),
      p(
        "If we change the price of an existing subscription, we will give you reasonable advance notice before the change applies to your next renewal, and you may cancel before it takes effect.",
      ),
    ]),
    section("renewal", "3. Billing period and automatic renewal", [
      p(
        "Subscriptions are billed in advance for each billing period and **renew automatically** at the end of each period until you cancel. By purchasing a subscription, you authorize us and our payment processor to charge the payment method you provide for each renewal.",
      ),
    ]),
    section("payment-processing", "4. Payment methods and processors", [
      p(
        `Payments are processed by our payment providers (such as Stripe and, where a purchase is made through it, Shopify). Your payment details are handled by them under their own terms and privacy notices; we do not receive or store full card numbers. See our ${L.subprocessors} page.`,
      ),
    ]),
    section("taxes", "5. Taxes", [
      p(
        "VAT, GST or similar government taxes are displayed and collected only where there is a real tax obligation, any registration required for it exists, and the collection is legally justified. Where tax applies, it is shown at checkout before you pay. Each transaction has a single tax calculation; tax is never calculated twice for the same purchase.",
      ),
    ]),
    section("bank-fx-charges", "6. Bank, card and foreign exchange charges", [
      p(
        "Your bank, card issuer or payment provider may charge its own fees, including foreign exchange or cross-border fees, independently of us. These charges are not set or received by InnerDweS.",
      ),
    ]),
    section("upgrades-downgrades", "7. Upgrades and downgrades", [
      ul(
        "Upgrades may take effect immediately and may be prorated where supported.",
        "Downgrades may take effect at the next renewal.",
      ),
      p("The effect of a change and any amount due are shown before you confirm it."),
    ]),
    section("coupons", "8. Coupons and promotions", [
      p(
        "Coupons and promotional offers are subject to the conditions shown with them, have no cash value, cannot be exchanged for cash, and may not be combined unless stated otherwise.",
      ),
    ]),
    section("no-overage", "9. No undisclosed usage charges", [
      p(
        "We do not impose undisclosed usage-based overage charges. Any limit or additional charge that applies to a Paid Plan is shown before you buy it.",
      ),
    ]),
    section("cancellation", "10. Cancellation", [
      p(
        `You may cancel a subscription at any time, using the cancellation options available in your account where provided, or by contacting us at ${MAIL}. Cancellation generally takes effect at the **end of the current paid billing period**: when you cancel a paid subscription, it remains active until the end of the billing period you have already paid for, and until then the paid features of the Space, including its Guest App, remain available. Section 11 explains what happens next.`,
      ),
    ]),
    section("after-cancellation", "11. What happens after cancellation", [
      p("When you cancel a paid subscription for a Space, the following steps apply to that Space:"),
      table(
        "Cancellation timeline",
        ["When", "What happens"],
        [
          ["Until the end of the paid billing period", "The subscription remains active. The Space and its Guest App stay available as before."],
          ["When the paid billing period ends", "The paid features for the Space end and the Space becomes unavailable to guests. You keep access to billing and reactivation for the Space."],
          ["For 30 days after the end of the paid billing period", "The Space content is preserved. It is not deleted during this time."],
          ["After those 30 days", "The Space becomes eligible for deletion from our active systems, subject to applicable legal obligations and any notices we are required to give."],
        ],
      ),
      p(
        "If you reactivate the Space by subscribing again before it is deleted, it is restored without data loss. Content that has already been deleted from our active systems may not be recoverable.",
      ),
      p(
        "A cancellation affects only the Space it relates to: other Spaces in your Account are not automatically deleted. This cancellation timeline is separate from the failed-payment process in section 15, which applies only when a payment fails and has its own timeline.",
      ),
      p(
        "You can delete a Space or your Account at any time; deleted content is removed from our active systems within approximately 30 days, and residual copies may remain in backups until the applicable backup lifecycle expires.",
      ),
    ]),
    section("refunds", "12. Refunds", [
      p("Subscription payments are generally **non-refundable**, and we do not normally give prorated refunds for unused time, including after cancellation."),
      p("Exceptions may include:"),
      ul(
        "duplicate charges;",
        "billing errors;",
        "incorrect charges;",
        "cases where mandatory consumer rights give you a right to a refund;",
        "discretionary goodwill refunds, credits or extensions that we may offer in individual cases.",
      ),
      p(
        `To ask about a refund, contact us at ${MAIL} with the email address of your Account and the date and amount of the charge. Approved refunds are returned to the original payment method where possible.`,
      ),
    ]),
    section("setup-fees", "13. Setup and onboarding fees", [
      p(
        "Setup or onboarding fees (for example a one-time service where we set up a Space for you) are non-refundable once the associated work has begun, except where mandatory law requires otherwise.",
      ),
    ]),
    section("withdrawal", "14. Statutory withdrawal rights", [
      p(
        "If you are a consumer with a statutory right of withdrawal (for example under the laws of the European Union), you keep that right, and we do not ask you to waive all refund rights. Where such a right applies, we will ask you at checkout:",
      ),
      ul(
        "to give your **explicit consent requesting that the Service is activated immediately**, before the statutory withdrawal period expires; and, separately,",
        "to **acknowledge that your statutory right of withdrawal may be reduced or lost once the Service has been fully performed**, to the extent permitted by applicable law.",
      ),
      p(
        "We keep a record of the exact wording you were shown, its version, the time, your Account and the purchase concerned. If you withdraw after the Service has started but before it has been fully performed, we may charge a proportionate amount for the Service provided up to the time of withdrawal, where the law permits.",
      ),
    ]),
    section("failed-payments", "15. Failed payments", [
      p(
        "If a payment for a Space fails, the following steps apply to the affected Space. Where possible, only the affected Space is suspended, not other Spaces owned by the same Account. This failed-payment process is separate from a cancellation you make yourself, described in sections 10 and 11.",
      ),
      table(
        "Failed payment timeline",
        ["When", "What happens"],
        [
          ["Day 0", "The payment failure is detected. Payment recovery may begin (for example a retry of the payment), and we send you an email notice."],
          ["After approximately 24 hours", "The Guest App for the affected Space becomes unavailable, and we notify you."],
          ["Day 7", "Creator access to the affected Space is suspended. Billing and reactivation remain available. Content is not deleted at this stage. We send you a suspension notice."],
          ["Day 12 or 13", "We send you a final deletion warning."],
          ["Day 14", "The Space becomes eligible for deletion from our active systems. Where feasible, we preserve the Space's identifier and address through the retention period."],
        ],
      ),
      p("Day counts start from the first failed payment. Outstanding amounts remain payable."),
    ]),
    section("restoration", "16. Restoring a Space after payment", [
      p(
        "If the outstanding payment succeeds before the Space is deleted, we cancel any pending suspension and deletion actions and restore the affected Space. Content that has already been deleted from our active systems may not be recoverable.",
      ),
    ]),
    section("outages", "17. Outages and delays", [
      p(
        "Service outages, publishing delays and failures of third-party infrastructure do not automatically entitle you to a refund or credit. No service credits apply unless we have expressly granted them in writing. Mandatory consumer rights are not affected.",
      ),
    ]),
    section("billing-questions", "18. Billing questions and disputes", [
      p(
        `If you believe a charge is wrong, please contact us at ${MAIL} before disputing it with your bank or card issuer, so that we can investigate and correct it quickly. This does not limit any right you have to dispute a charge.`,
      ),
    ]),
    section("changes", "19. Changes to this policy", [
      p(
        "We may update this policy from time to time. Each version shows its version number and effective date. Material changes are notified in advance and do not apply retroactively to a billing period you have already paid for.",
      ),
    ]),
    section("contact", "20. Contact", [p(`Billing questions and refund requests: ${MAIL}.`)]),
  ],
};
