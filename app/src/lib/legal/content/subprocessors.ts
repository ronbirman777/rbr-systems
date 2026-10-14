import { L, MAIL, p, section, table, type LegalDocumentBody } from "./types";

export const subprocessorsBody: LegalDocumentBody = {
  intro: [
    p(
      `InnerDweS uses the third-party service providers below to operate the Service. Where they process Personal Data on our behalf they act as our processors or, for Creator Personal Data under our ${L.dpa}, as our subprocessors. This page forms part of our ${L.privacy} and ${L.dpa}.`,
    ),
  ],
  sections: [
    section("providers", "1. Service providers", [
      table(
        "InnerDweS service providers",
        ["Provider", "Purpose", "Data involved", "When it applies"],
        [
          [
            "Supabase",
            "Authentication, database, backend infrastructure, file storage and related platform services.",
            "Account data, Creator Content, Space configuration, billing records, security and technical data.",
            "Always: core platform.",
          ],
          [
            "Vercel",
            "Application hosting, deployment and delivery of the website, Studio and Guest Apps.",
            "Technical and request data (such as IP address and browser information) and content delivered through the Service.",
            "Always: core platform.",
          ],
          [
            "Backblaze B2",
            "Encrypted backup, disaster recovery and storage resilience.",
            "Copies of stored files and data held for backup.",
            "Always: backups.",
          ],
          [
            "GitHub",
            "Automation that runs our backup jobs. Files pass through temporary job environments during a backup and are not kept there.",
            "Stored files in transit during backup runs.",
            "Always: backup automation.",
          ],
          [
            "Stripe",
            "Payments, subscriptions, billing, fraud prevention, payment compliance, refunds and disputes.",
            "Billing and payment data, customer and subscription identifiers, and transaction records.",
            "When you purchase a Paid Plan through Stripe.",
          ],
          [
            "Shopify",
            "Commerce, checkout, merchant services, and order or transaction processing where applicable.",
            "Order, billing and payment data and related customer details.",
            "When you make a purchase through a Shopify-powered checkout.",
          ],
          [
            "Resend",
            "Transactional email, including account notifications, billing notices and security notices. Open and link tracking are not enabled.",
            "Email address, name and the content of the message.",
            "When we send you transactional email through it.",
          ],
          [
            "Cloudflare",
            "Infrastructure services, depending on configuration. These may include DNS, content delivery (CDN), proxy, web application firewall (WAF), Turnstile bot protection, Workers, R2 storage or related infrastructure.",
            "Depending on the product used: technical and request data, and content stored or delivered through it.",
            "Depending on configuration.",
          ],
        ],
      ),
    ]),
    section("cloudflare", "2. Cloudflare", [
      p(
        "Cloudflare's role depends on which of its products are used and how they are configured. We review the Cloudflare products in use and update this page when that changes the Personal Data Cloudflare processes for us.",
      ),
    ]),
    section("ai-tools", "3. AI development tools", [
      p(
        "We use AI tools from providers such as OpenAI and Anthropic internally as development and business tools. They are not listed above because the Service does not send Creator Content or customer Personal Data to them. If that changes, we will add the relevant provider to this page and to our Privacy Policy before it happens.",
      ),
    ]),
    section("transfers", "4. International transfers", [
      p(
        "Our providers may process Personal Data in several countries. Where the law requires, we rely on appropriate transfer mechanisms, such as Standard Contractual Clauses, Binding Corporate Rules, adequacy decisions, recognized transfer frameworks or other lawful transfer mechanisms.",
      ),
    ]),
    section("changes", "5. Changes to this page", [
      p(
        "We update this page before a new provider begins processing Creator Personal Data, and each version shows its version number and effective date. Creators who have a reasonable data protection objection to a new subprocessor can raise it as described in our Data Processing Addendum.",
      ),
    ]),
    section("contact", "6. Contact", [p(`Questions about our service providers can be sent to ${MAIL}.`)]),
  ],
};
