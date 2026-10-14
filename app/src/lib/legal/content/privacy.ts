import { L, MAIL, p, section, sub, table, ul, type LegalDocumentBody } from "./types";

export const privacyBody: LegalDocumentBody = {
  intro: [
    p(
      `This Privacy Policy explains how InnerDweS (**InnerDweS**, **we**, **us**) collects, uses, shares and protects Personal Data when you use the InnerDweS website, the Studio, Spaces, Guest Apps and related services (the **Service**), and the rights you have. Terms with capital letters have the meaning given in our ${L.terms}.`,
    ),
    p("InnerDweS does not sell Personal Data and does not use Personal Data for targeted advertising."),
  ],
  sections: [
    section("scope", "1. Scope", [
      p("This policy applies to Personal Data of:"),
      ul(
        "people who visit our website;",
        "Creators and other account holders who use the Studio;",
        "guests who open a Guest App;",
        "people who contact us, including for support, privacy requests or complaints.",
      ),
      p(
        "It does not cover how Creators themselves use Personal Data they collect or publish in their Spaces. Creators are responsible for that, as explained in section 7.",
      ),
    ]),
    section("who-we-are", "2. Who we are", [
      p(
        `The Service is provided under the InnerDweS brand. For any privacy question or request, contact us at ${MAIL}.`,
      ),
    ]),
    section("roles", "3. Controller and Processor roles", [
      p(
        "InnerDweS generally acts as **Controller** for the Personal Data we process to run our business and the Service: account data, authentication, subscription and billing data, security and fraud prevention, support, operational service data, and legal and compliance records.",
      ),
      p(
        `Where a Creator uploads Personal Data about other people (for example facilitators, staff, participants or testimonial authors) and instructs us to process it as part of a Space, the **Creator generally acts as Controller** and **InnerDweS generally acts as Processor** on the Creator's behalf. Our ${L.dpa} applies to that processing. If you are a guest or a person named in a Space, please contact the Creator first about that Personal Data; we will help where we can (section 22).`,
      ),
    ]),
    section(
      "information-we-collect",
      "4. Information we collect",
      [p("We collect the following categories of Personal Data, depending on how you use the Service.")],
      [
        sub(
          "account-data",
          "4.1 Account data",
          p(
            "When you create an Account: your full name, email address, password (stored by our authentication provider in hashed form, never readable by us), country, phone number, and optionally a business, retreat or practice name. We also keep account settings and the Spaces you own or manage.",
          ),
        ),
        sub(
          "billing-data",
          "4.2 Billing data",
          p(
            "If you purchase a Paid Plan: subscription details, plan, price, currency, billing period, payment status, invoices and receipts, billing country and address where required, tax information where required, coupon use, and records of the legal terms you accepted. Card and other payment instrument details are collected and processed directly by our payment processors; we do not receive or store full card numbers.",
          ),
        ),
        sub(
          "creator-content",
          "4.3 Creator Content",
          p(
            "The content you add to a Space, which may include Personal Data, such as names, photos, biographies and contact details of facilitators or staff, schedules, testimonials, images, audio, links and social media handles.",
          ),
        ),
        sub(
          "support-data",
          "4.4 Support data",
          p(
            "When you contact us: your name, email address, the content of your messages and attachments, and the history of the request.",
          ),
        ),
        sub(
          "security-technical-data",
          "4.5 Security and technical data",
          p(
            "Information generated when you use the Service, such as IP address, browser and device type, request logs, timestamps, error reports, authentication events and security signals. Some of this is collected by our hosting and infrastructure providers in their own logs.",
          ),
        ),
        sub(
          "usage-resource-data",
          "4.6 Usage and resource data",
          p(
            "Information about how Spaces and resources are used, for example the number of Spaces, storage used, publishing events and, where we measure it, aggregate usage of a Space or resource. Where we measure audio listening for usage or billing purposes, we measure at the level of the Space or resource. For that measurement we do not use a persistent listener identifier, we do not store IP addresses or user agent information, we do not track listeners across Spaces, and we do not create behavioural analytics about individual listeners.",
          ),
        ),
        sub(
          "guest-app-data",
          "4.7 Guest App data",
          p(
            "Guest Apps are primarily read-only and guests do not need an Account. When a guest opens a Guest App, our providers process the technical data needed to deliver it (section 4.5). Where a Space is protected by an access code, we process the access-code attempt and set a cookie that remembers successful access for a limited time; to limit repeated guessing we keep a keyed, pseudonymized value derived from the visitor's IP address together with an attempt count, never the raw IP address itself.",
          ),
        ),
      ],
    ),
    section("purposes", "5. How we use Personal Data", [
      ul(
        "to create and manage Accounts and authenticate users;",
        "to provide the Studio, host Spaces and publish Guest Apps;",
        "to process subscriptions, payments, refunds and invoices;",
        "to send transactional messages, such as account confirmation, password recovery, billing, suspension and security notices;",
        "to provide support and respond to requests;",
        "to keep the Service secure, prevent fraud and abuse, and enforce our Terms;",
        "to troubleshoot, maintain reliability and make limited operational improvements to the Service;",
        "to comply with legal, tax, accounting and regulatory obligations, and to establish, exercise or defend legal claims.",
      ),
    ]),
    section("legal-bases", "6. Legal bases", [
      p("Where the law requires a legal basis, we rely on the following, depending on the purpose:"),
      table(
        "Legal bases by purpose",
        ["Legal basis", "Purposes"],
        [
          [
            "Contract",
            "Account creation, authentication, Space management, publishing, subscriptions, billing, and support necessary to provide the Service.",
          ],
          [
            "Legal obligation",
            "Tax, accounting, responding to lawful requests, regulatory compliance and record-keeping obligations.",
          ],
          [
            "Legitimate interests",
            "Security, fraud prevention, abuse prevention, troubleshooting, reliability, service protection, enforcing our Terms, defending legal claims and limited operational improvement.",
          ],
          [
            "Consent",
            "Only where actually required, such as non-essential cookies, optional analytics, marketing communications, and optional features that need additional permission. You can withdraw consent at any time.",
          ],
        ],
      ),
    ]),
    section("creator-responsibility", "7. Creator responsibility", [
      p(
        "Creators decide what Personal Data they upload and publish in their Spaces. Creators are responsible for having the necessary rights, consents and lawful basis to publish names, images, biographies, testimonials, contact information and other third-party Personal Data, and for informing the people concerned where the law requires.",
      ),
      p(
        "Creators must not knowingly collect, store or publish Personal Data of minors unless a future feature of the Service explicitly supports that use.",
      ),
    ]),
    section("sensitive-data", "8. Sensitive data", [
      p(
        "The Service is not designed for medical records, clinical records, electronic health records or other regulated healthcare records, and it must not be used to store highly sensitive health information. Please do not send us, or upload to a Space, sensitive categories of Personal Data. Access controls, access codes and private links do not change this restriction.",
      ),
    ]),
    section("public-content", "9. Public content", [
      p(
        "Content a Creator publishes in a public Guest App can be seen by anyone with access to it and may be copied, screenshotted, shared, cached, indexed, archived or redistributed outside the Service. Where a Space is set to allow search engine indexing, its content may appear in search results. Changing a Space from public to private does not guarantee the immediate removal of third-party copies, caches or search results.",
      ),
    ]),
    section("access-controlled-content", "10. Access-controlled content", [
      p(
        "Access codes, passwords and authentication reduce exposure but do not guarantee secrecy: anyone who has a valid code can view the content and could share it further. Access-controlled and unpublished Spaces are not intended to be indexed by search engines. The sensitive data restrictions in section 8 still apply behind access controls.",
      ),
    ]),
    section("service-providers", "11. Service providers", [
      p(
        `We share Personal Data with service providers that process it on our behalf to host, operate, secure, back up, bill for and communicate about the Service, under contractual obligations. The current list, with each provider's purpose, is on our ${L.subprocessors} page. We may also disclose Personal Data where required by law or to protect rights, safety and the security of the Service, and to a successor in connection with a reorganization or transfer of the Service.`,
      ),
    ]),
    section("ai-development-tools", "12. AI development tools", [
      p(
        "We use AI tools, such as those provided by OpenAI and Anthropic, internally as development and business tools. Writing code with the help of these tools does not involve transmitting your Personal Data or Creator Content to them, and the Service does not send Creator Content or customer Personal Data to these providers. If that changes, we will update this policy and our Service Providers & Subprocessors page before it happens. We do not use Creator Content to train AI models without appropriate authorization.",
      ),
    ]),
    section("payments", "13. Payments", [
      p(
        "When you purchase a Paid Plan, payments are processed by our payment providers (such as Stripe and, where a purchase is made through it, Shopify). They process payment details to complete the payment, prevent fraud, meet payment compliance requirements and handle refunds and disputes. Our payment providers may use automated fraud screening. Their handling of your data is also described in their own privacy notices.",
      ),
    ]),
    section("shopify-privacy-features", "14. Shopify privacy features", [
      p(
        "Where we use Shopify, we do not enable Shopify Network Intelligence, targeted advertising, cross-merchant personalization or equivalent enhanced services unless we have first completed a privacy, cookie, consent, disclosure and opt-out review and updated this policy accordingly.",
      ),
    ]),
    section("transactional-email", "15. Transactional email", [
      p(
        "We send transactional emails, such as account, security, billing, suspension and deletion notices, through our email provider. We do not enable open tracking or link tracking for these emails, and we will not do so without a prior privacy review. We send marketing emails only where permitted by law, and you can unsubscribe at any time.",
      ),
    ]),
    section("international-transfers", "16. International transfers", [
      p(
        "InnerDweS and its service providers may process Personal Data in countries other than the one where you live, and we do not promise that Personal Data stays in any single country. Where the law requires, we rely on appropriate safeguards for international transfers, such as Standard Contractual Clauses, Binding Corporate Rules, adequacy decisions, recognized transfer frameworks or other lawful transfer mechanisms. Contact us for more information.",
      ),
    ]),
    section("retention", "17. Retention", [
      p("We keep Personal Data only as long as needed for the purposes described in this policy. Our default periods are:"),
      table(
        "Default retention periods",
        ["Data", "Default retention"],
        [
          ["Account data after account deletion", "Removed from active systems within approximately 30 days, subject to legal, security and billing exceptions."],
          ["Deleted Space content", "Removed from active systems within approximately 30 days."],
          ["Content of a Space whose paid subscription you cancelled", "Preserved for 30 days after the end of the paid billing period, so that you can reactivate the Space without data loss; after that, eligible for deletion from active systems, subject to legal obligations and any required notices. Your other Spaces are not affected."],
          ["Support records", "Approximately 12 months after the request is closed."],
          ["Security and operational logs", "Approximately 90 days by default; longer where reasonably required for an investigation, fraud prevention, security or legal claims."],
          ["Billing and tax records", "As required by applicable law."],
          ["Records under legal hold, fraud investigation or dispute", "Longer, where justified, until the matter is resolved."],
          ["Backups", "Residual copies may remain until the applicable backup lifecycle expires. We do not promise immediate deletion from backups."],
          ["Anonymous or aggregated data", "May be retained longer where it has been irreversibly anonymized."],
        ],
      ),
      p(
        "Records of legal acceptance (which version of a document was accepted and when) are kept as evidence for as long as reasonably needed for legal and billing purposes and are not overwritten when a new version is published.",
      ),
    ]),
    section("failed-payment-retention", "18. Failed payment retention", [
      p(
        `If payment for a Space fails and is not resolved, the Space becomes eligible for deletion from active systems from day 14 of the failed-payment process described in our ${L.billing}, after a final warning. Until then the content is kept so that the Space can be restored if payment succeeds. Where feasible, we preserve the Space's identifier and address through the retention period. Billing records relating to the failed payment are kept as required by law. This failed-payment timeline is separate from the retention that follows a cancellation you make yourself, shown in the table in section 17.`,
      ),
    ]),
    section("security", "19. Security", [
      p(
        "We use reasonable technical and organizational measures designed to protect Personal Data, such as encryption in transit, access controls that limit who can reach data, and encrypted backups. No method of transmission or storage is completely secure, and we cannot guarantee absolute security. You are responsible for protecting your own credentials and devices.",
      ),
    ]),
    section("incidents", "20. Security incidents", [
      p(
        "If a security incident affects Personal Data, we will investigate and take steps to contain it, and we will notify affected individuals and regulators where required by applicable law, within the timeframes that law requires.",
      ),
    ]),
    section("data-subject-rights", "21. Your rights", [
      p("Depending on where you live, you may have the right to:"),
      ul(
        "access the Personal Data we hold about you and receive a copy;",
        "correct inaccurate or incomplete Personal Data;",
        "delete Personal Data;",
        "restrict or object to certain processing, including processing based on legitimate interests;",
        "receive Personal Data in a portable format;",
        "withdraw consent at any time, where we rely on consent;",
        "lodge a complaint with a data protection authority, such as the authority in the country where you live.",
      ),
      p(
        `To exercise these rights, contact us at ${MAIL}. We may need to verify your identity, but only as far as reasonably necessary. Some rights are subject to legal exceptions, for example where we must keep billing records. You can delete Spaces and your Account directly in the Studio.`,
      ),
    ]),
    section("creator-controlled-data", "22. Creator-controlled data", [
      p(
        "If your Personal Data appears in a Creator's Space and the Creator is the Controller, please contact the Creator directly. If you contact us instead, we may forward your request to the Creator, or help the Creator respond, and in appropriate cases we may act under our Copyright & Content Takedown Policy, which also handles privacy, publicity and impersonation complaints.",
      ),
    ]),
    section("request-timelines", "23. Privacy request timelines", [
      p(
        "We respond to privacy requests within the timeframe required by the law that applies to the request. Where the law allows us to extend that time, for example because a request is complex, we will tell you. Our general support target of an initial response within approximately 3 business days also applies to privacy requests.",
      ),
    ]),
    section("age", "24. 18+ policy", [
      p(
        "The Service is intended for people aged 18 and older. We do not knowingly collect Personal Data from children to create accounts. If you believe a child has provided us with Personal Data, contact us and we will take appropriate steps.",
      ),
    ]),
    section("no-sale", "25. No sale of Personal Data", [
      p("InnerDweS does not sell Personal Data and does not share it in exchange for money or other valuable consideration."),
    ]),
    section("no-targeted-advertising", "26. No targeted advertising at launch", [
      p(
        "InnerDweS does not use Personal Data for targeted advertising or advertising profiling. If this ever changes, we will update this policy first and ask for consent where required.",
      ),
    ]),
    section("automated-decision-making", "27. Automated decision-making", [
      p(
        "We do not make decisions based solely on automated processing that produce legal or similarly significant effects for you. We use automated security measures, such as limiting repeated access-code attempts, and our payment providers may use automated fraud screening when you make a payment.",
      ),
    ]),
    section("cookies", "28. Cookies and similar technologies", [
      p(
        "At the date of this policy, the Service uses cookies and similar technologies that are necessary to provide it: to keep you signed in, to secure sign-in and password recovery, to remember a successful access-code entry for a protected Guest App, to control access to pre-release versions of the Service, and, where available, to remember preferences such as your interface language. We do not use advertising cookies. If we introduce non-essential cookies or optional analytics, we will ask for your consent where required by law and update this policy.",
      ),
    ]),
    section("third-party-links", "29. Third-party links", [
      p(
        "The Service and Guest Apps may link to third-party websites and services, such as messaging apps, social networks or maps. Their privacy practices are their own responsibility, and we encourage you to read their privacy notices.",
      ),
    ]),
    section("changes", "30. Changes to this Privacy Policy", [
      p(
        "We may update this policy from time to time. Each version shows its version number and effective date. If we make a material change, we will give reasonable notice, for example by email or in the Service, before it takes effect.",
      ),
    ]),
    section("governance", "31. Privacy governance", [
      p(
        "We have designated an internal privacy owner who is responsible for this policy and for handling privacy requests and incidents. We keep internal records that support this policy, including a register of our providers and international transfers, a record of processing activities, a log of privacy requests, a security incident log, a data retention schedule, a register of legal document versions and records of legal acceptance.",
      ),
    ]),
    section("contact", "32. Contact", [
      p(`For any question about this policy or to exercise your rights, contact us at ${MAIL}.`),
    ]),
  ],
};
