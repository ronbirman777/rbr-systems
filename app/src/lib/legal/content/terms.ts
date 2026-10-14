import { L, MAIL, p, section, ul, type LegalDocumentBody } from "./types";

export const termsBody: LegalDocumentBody = {
  intro: [
    p(
      "These Terms of Service (the **Terms**) govern your access to and use of the InnerDweS website, the InnerDweS Studio, Spaces, Guest Apps and every related feature and service we make available (together, the **Service**). In these Terms, **InnerDweS**, **we**, **us** and **our** refer to the provider of the Service operating under the InnerDweS brand, and **you** and **your** refer to the person or organization using the Service.",
    ),
    p(
      `Please read these Terms carefully. They include a limitation of our liability (section 42), an informal dispute resolution step (section 48) and the choice of Singapore law and courts (sections 49 and 50). They work together with our ${L.privacy}, ${L.aup}, ${L.copyright}, ${L.billing}, ${L.dpa} and ${L.subprocessors}, which form part of these Terms where they apply.`,
    ),
  ],
  sections: [
    section("about", "1. About these Terms", [
      p(
        "By creating an account, or by otherwise accessing or using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you confirm that you are authorized to accept these Terms on its behalf, and \"you\" includes that organization.",
      ),
      p("If you do not agree to these Terms, do not use the Service."),
    ]),
    section("definitions", "2. Definitions", [
      ul(
        "**Account** means the account you create to use the Studio and manage Spaces.",
        "**Creator** means an account holder who creates, configures, publishes or manages a Space.",
        "**Creator Content** means any text, images, audio, video, schedules, names, biographies, testimonials, links, contact details, branding and other material that a Creator uploads to, creates in or publishes through the Service.",
        "**Space** means a digital space created in the Studio for a retreat, class, practice or similar offering, together with its configuration and Creator Content.",
        "**Studio** means the InnerDweS tools that Creators use to create, edit, configure and publish Spaces.",
        "**Guest App** means the published, visitor-facing version of a Space that a Creator shares with guests, students or participants.",
        "**Guest** means a person who views or uses a Guest App.",
        "**Personal Data** means any information relating to an identified or identifiable individual.",
        "**Paid Plan** means any subscription, add-on or one-time paid service for which a fee is charged.",
      ),
    ]),
    section("eligibility", "3. Eligibility: 18 and older", [
      p(
        "The Service is intended only for people aged **18 and older**. By using the Service you confirm that you are at least 18 years old and able to enter into a binding agreement. We do not offer accounts for children and we do not knowingly allow anyone under 18 to create an account.",
      ),
      p(
        "Creators must not knowingly collect, store or publish Personal Data of minors through the Service unless a future feature of the Service explicitly supports that use.",
      ),
    ]),
    section("account-security", "4. Your account and account security", [
      ul(
        "You must give accurate and complete information when you create your Account and keep it up to date.",
        "You are responsible for keeping your password and other credentials confidential and for protecting the devices you use to access the Service.",
        "You are responsible for activity that takes place under your Account, unless it results from our breach of these Terms.",
        `Tell us promptly at ${MAIL} if you believe your Account or credentials have been compromised.`,
        "You must not share your Account with others or create an Account for someone else without their authorization.",
      ),
    ]),
    section("service-description", "5. Description of the Service", [
      p(
        "InnerDweS provides digital tools for the wellness world. Creators use the Studio to build Spaces and publish them as Guest Apps that guests can open in a browser. The features available to you depend on the product, the Space type and any Paid Plan you have, as described in the Service at the time.",
      ),
      p(
        "We may make some features available free of charge and others only with a Paid Plan. Where a feature requires a Paid Plan, this is shown in the Service before you are charged.",
      ),
    ]),
    section("spaces", "6. Spaces", [
      p(
        "A Space belongs to the Account that created it. You decide what each Space contains and when it is published, changed, unpublished, archived or deleted, using the options available in the Studio. Fees for Paid Plans are generally charged per Space, as shown at checkout.",
      ),
      p(
        "Where we take action under these Terms, we will try, where reasonably possible, to limit that action to the affected Space rather than to unrelated Spaces owned by the same Account.",
      ),
    ]),
    section("studio", "7. The Studio", [
      p(
        "The Studio lets you create and edit Spaces, upload Creator Content, preview a Space and publish it. Changes you make in the Studio are not visible to guests until you publish them, unless the Studio indicates otherwise.",
      ),
    ]),
    section("guest-apps", "8. Guest Apps", [
      p(
        "A Guest App is the published version of a Space. Guest Apps are primarily read-only for guests: guests view the content a Creator has published and do not need an InnerDweS Account to do so. Where a Creator protects a Guest App with an access code, guests must enter the code to view it.",
      ),
      p(
        "The Creator, not InnerDweS, is responsible for the content of a Guest App and for the relationship with its guests.",
      ),
    ]),
    section("publishing-states", "9. Public, unlisted, access-controlled and private Spaces", [
      p(
        "Depending on the options available for your Space and product, a Space may have one of the following visibility states. The options shown in the Studio for your Space at the time are the ones that apply to it.",
      ),
      ul(
        "**Searchable Public**: the Guest App is publicly accessible and search engines are allowed to index it.",
        "**Unlisted Public**: the Guest App is accessible to anyone who has its address, and we ask search engines not to index it (noindex).",
        "**Access Controlled**: access to the Guest App is restricted (for example by an access code), and we always ask search engines not to index it (noindex).",
        "**Private / Unpublished**: the Space is not publicly accessible, and we ask search engines not to index it (noindex).",
      ),
      p(
        "A noindex instruction is respected by major search engines but cannot be enforced against every third party. Public content may be copied, screenshotted, shared, cached, indexed, archived or redistributed by others outside the Service. Changing a Space from public to private does not guarantee the immediate removal of third-party copies, caches or search results, which are outside our control.",
      ),
    ]),
    section("publishing", "10. Publishing", [
      p(
        "Publishing and updates are intended to appear promptly, but in some circumstances they may take up to approximately **24 hours** to become visible everywhere. This is a target, not a guaranteed service level. Please publish and test time-sensitive changes sufficiently in advance.",
      ),
      p(
        "You are responsible for checking a Space before you publish it and for making sure that everything you publish is accurate, lawful and authorized.",
      ),
    ]),
    section("creator-content", "11. Creator Content and ownership", [
      p(
        "You keep ownership of your Creator Content. These Terms do not transfer any of your intellectual property rights to us.",
      ),
      p(
        "We do not use Creator Content for our own marketing without your separate permission, and we do not use Creator Content to train artificial intelligence models without appropriate authorization.",
      ),
    ]),
    section("content-license", "12. Technical content license", [
      p(
        "You grant InnerDweS a limited, non-exclusive, worldwide, royalty-free license to host, store, process, reproduce, technically transform (for example resize, compress or convert), transmit, display, publish, secure, maintain, back up and restore your Creator Content, and otherwise use it only as reasonably necessary to provide the Service you request.",
      ),
      p(
        "This license lasts for as long as we hold your Creator Content to provide the Service, including the backup and retention periods described in our " +
          L.privacy +
          ". It does not give us any broader right to use your Creator Content for marketing or any other purpose.",
      ),
    ]),
    section("creator-responsibility", "13. Creator responsibilities", [
      p("As a Creator, you are responsible for your Creator Content and your Spaces, including:"),
      ul(
        "owning, or having all licenses and permissions needed for, everything you upload or publish;",
        "obtaining any consents and having a lawful basis for the Personal Data you upload or publish, including names, images, biographies, testimonials and contact details of facilitators, staff, participants and other third parties;",
        "respecting third-party rights, including copyright, trademark, privacy and publicity rights;",
        "the accuracy of the information you publish, including schedules, prices, health or wellness information and contact details;",
        "complying with the laws that apply to you, your business and your relationship with your guests.",
      ),
      p(
        `Where you upload Personal Data of third parties and instruct us to process it as part of your Space, you generally act as Controller and InnerDweS generally acts as Processor, and our ${L.dpa} applies.`,
      ),
    ]),
    section("sensitive-data", "14. Sensitive data restrictions", [
      p(
        "InnerDweS is not designed to be, and must not be used as, medical records software, clinical records software, electronic health records software or regulated healthcare records software. InnerDweS does not claim compliance with HIPAA or any other health-records regulation.",
      ),
      p(
        "You must not use the Service to store medical records, clinical records or highly sensitive health information, unless a future feature of the Service explicitly supports that use. Access controls, passwords, access codes and private links do not change this restriction.",
      ),
    ]),
    section("acceptable-use", "15. Acceptable use", [
      p(
        `You must use the Service in compliance with our ${L.aup}. We may act under sections 27 and 28 if you or your Spaces do not.`,
      ),
    ]),
    section("copyright", "16. Copyright and content takedown", [
      p(
        `We respect intellectual property and other rights. If you believe content on the Service infringes your rights, please follow our ${L.copyright}. A complaint does not automatically lead to removal; we review each complaint and may take the actions described in that policy, including terminating serious or repeat infringers.`,
      ),
    ]),
    section("privacy", "17. Privacy and data processing", [
      p(
        `Our ${L.privacy} explains how we process Personal Data as Controller. Our ${L.dpa} forms part of these Terms and applies where we process Personal Data on your behalf as Processor.`,
      ),
    ]),
    section("service-providers", "18. Service providers", [
      p(
        `We use carefully selected third-party providers to host, operate, secure, back up and bill for the Service. They are listed on our ${L.subprocessors} page.`,
      ),
    ]),
    section("billing", "19. Subscriptions and billing", [
      p(
        `If you purchase a Paid Plan, you agree to pay the fees shown at checkout. The price, currency, billing frequency and entitlements shown at checkout govern your purchase. Subscriptions renew automatically at the end of each billing period until you cancel. Our ${L.billing} forms part of these Terms and sets out the details.`,
      ),
      p(
        "Upgrades may take effect immediately and may be prorated where supported. Downgrades may take effect at the next renewal. Coupons and promotional offers have no cash value. We do not charge undisclosed usage-based overage fees.",
      ),
    ]),
    section("taxes", "20. Taxes", [
      p(
        "Where we are legally required to collect VAT, GST or a similar government tax, it will be shown at checkout and added only where there is a real tax obligation and the collection is legally justified. Each transaction has one tax calculation. Your bank, card issuer or payment provider may charge its own fees, including foreign exchange charges, independently of us.",
      ),
    ]),
    section("cancellation", "21. Cancellation", [
      p(
        `You may cancel a subscription at any time. Cancellation generally takes effect at the end of the current paid billing period: when you cancel a paid subscription, it remains active, and you keep access to the paid features of that Space, until the end of the billing period you have already paid for. When that period ends, the Space becomes unavailable to guests, and you keep access to billing and reactivation for it. The Space content is preserved for 30 days after the end of the paid period; after those 30 days, the Space becomes eligible for deletion, subject to applicable legal obligations and any required notices. If you reactivate the Space before it is deleted, it is restored without data loss. A cancellation affects only that Space: your other Spaces are not automatically deleted. This is separate from the failed-payment process in section 24. See our ${L.billing} for how to cancel and the details.`,
      ),
    ]),
    section("refunds", "22. Refunds", [
      p(
        `Subscription payments are generally non-refundable, and we do not normally give prorated refunds for unused time. Exceptions include duplicate charges, billing errors, incorrect charges and cases where mandatory consumer law gives you a right to a refund. We may also, at our discretion, offer a goodwill refund, credit or extension. Setup or onboarding fees are non-refundable once the associated work has begun, except where mandatory law requires otherwise. Details are in our ${L.billing}.`,
      ),
    ]),
    section("withdrawal", "23. Statutory withdrawal rights", [
      p(
        `If you are a consumer with a statutory right of withdrawal (for example under the laws of the European Union), that right is not excluded by these Terms. Where it applies, we will ask you at checkout to expressly request that the Service starts immediately, and separately to acknowledge that your right of withdrawal may be reduced or lost once the Service has been fully performed, to the extent permitted by applicable law. If you withdraw after the Service has started but before it has been fully performed, we may charge a proportionate amount for the Service provided up to the time of withdrawal, where the law permits. See our ${L.billing}.`,
      ),
    ]),
    section("failed-payments", "24. Failed payments", [
      p(
        `If a payment for a Space fails, the steps in our ${L.billing} apply: we notify you, the Guest App for the affected Space may become unavailable after approximately 24 hours, Creator access to the affected Space may be suspended from day 7 (while billing and reactivation remain available), and the Space may become eligible for deletion from active systems from day 14 after a final warning. If the outstanding payment succeeds before the Space is deleted, we cancel any pending suspension or deletion and restore the Space.`,
      ),
    ]),
    section("retention", "25. Data retention", [
      p(
        `We keep data for the periods described in our ${L.privacy}. In summary, when you delete your Account or a Space, we remove the related data from our active systems within approximately 30 days, subject to legal, security and billing exceptions. When you cancel a paid subscription, the content of the affected Space is preserved for 30 days after the end of the paid period and then becomes eligible for deletion (section 21); after a failed payment, the timeline in section 24 applies. Residual copies may remain in backups until the applicable backup lifecycle expires.`,
      ),
    ]),
    section("backups", "26. Backups and data loss", [
      p(
        "We maintain backups for the security and resilience of the Service, not as a backup service for you. Backups may not allow every item to be restored, and we do not guarantee that any particular content can be recovered. You should keep your own independent copies of important content, including the original files of images and audio you upload.",
      ),
    ]),
    section("suspension", "27. Suspension", [
      p(
        "We may suspend a Space, its publishing, or your Account immediately where this is reasonably necessary because of fraud, a security risk, illegal activity, serious abuse, compromised systems, serious intellectual property infringement or an urgent legal requirement.",
      ),
      p(
        "For less urgent violations that can be remedied, we will give you notice and an opportunity to fix the issue where reasonably practical. Where possible, we limit action to the affected Space rather than unrelated Spaces owned by the same Account. Suspension does not automatically mean deletion.",
      ),
    ]),
    section("termination", "28. Termination", [
      p(
        `You may stop using the Service and delete your Account at any time. We may terminate your Account or a Space for serious or repeated violations of these Terms or our ${L.aup}, or where required by law. Outstanding fees remain payable after termination. Section 57 describes the terms that continue to apply.`,
      ),
    ]),
    section("reactivation", "29. Reactivation", [
      p(
        "Where you have cancelled a paid subscription, you can reactivate the Space by subscribing again before it is deleted, and it is then restored without data loss. Where a Space has been suspended for non-payment, you can reactivate it by paying the outstanding amount before the Space is deleted. Where a Space has been suspended for another reason, we may reactivate it once the underlying issue has been resolved to our reasonable satisfaction. Content that has already been deleted from our active systems may not be recoverable.",
      ),
    ]),
    section("availability", "30. Service availability", [
      p(
        "We work to keep the Service available and reliable, but we do not guarantee any particular uptime unless we have agreed a separate service level agreement with you in writing. The Service may be interrupted for maintenance, updates, security measures or reasons outside our control. No service credits apply unless we have expressly granted them in writing.",
      ),
    ]),
    section("support", "31. Support", [
      p(
        `Support is available at ${MAIL}. Our target is to send an initial response within approximately **3 business days**. This is a response target, not a guaranteed resolution time.`,
      ),
    ]),
    section("third-party-services", "32. Third-party services", [
      p(
        "The Service relies on, and may link to or integrate with, services provided by third parties (for example payment processing, messaging apps, maps or social networks). Third-party services are governed by their own terms and privacy policies, and we are not responsible for them. Links to third-party sites in a Guest App are the Creator's responsibility.",
      ),
    ]),
    section("no-professional-advice", "33. No professional advice", [
      p(
        "InnerDweS provides technology, not professional services. Nothing in the Service is medical, psychological, therapeutic, legal, financial or other professional advice, and the Service is not a substitute for it. Content published by Creators is their own.",
      ),
    ]),
    section("no-endorsement", "34. No endorsement of Creators", [
      p(
        "Creators are independent of InnerDweS. We do not endorse, verify or guarantee any Creator, retreat, class, practitioner, product or service offered through a Space, or the accuracy of what a Creator publishes. Any agreement between a Creator and a guest is solely between them.",
      ),
    ]),
    section("usage-limits", "35. Usage limits", [
      p(
        "The Service may apply reasonable technical limits, for example on file sizes, file types, storage, the number of Spaces or items, and request rates, to keep the Service secure and reliable for everyone. Applicable limits are shown in the Service or at checkout. We do not charge undisclosed usage-based overage fees.",
      ),
    ]),
    section("security", "36. Security", [
      p(
        "We use reasonable technical and organizational measures designed to protect the Service and the data we hold. No system is completely secure, and we cannot guarantee absolute security. Passwords, access codes and authentication reduce exposure but do not guarantee secrecy: guests may share access codes, and we cannot completely prevent that. You are responsible for protecting your credentials and devices and for changing access codes when needed.",
      ),
      p(
        `You must not test, probe or attempt to bypass the security of the Service except as permitted by our ${L.aup}.`,
      ),
    ]),
    section("security-incidents", "37. Security incidents", [
      p(
        "If we become aware of a security incident affecting your Personal Data or your Creator Content, we will take reasonable steps to contain and investigate it and will notify affected users and regulators where required by applicable law. Incidents affecting our third-party providers are handled together with those providers.",
      ),
    ]),
    section("innerdwes-ip", "38. InnerDweS intellectual property", [
      p(
        "The Service, including its software, design, templates, the InnerDweS name and logos, and all related intellectual property, belongs to InnerDweS or its licensors. We grant you a limited, non-exclusive, non-transferable, revocable right to use the Service in accordance with these Terms. You must not copy, modify, reverse engineer, resell or create derivative works of the Service except as permitted by law.",
      ),
    ]),
    section("feedback", "39. Feedback", [
      p(
        "If you send us ideas, suggestions or feedback about the Service, we may use them freely, without any obligation to you. This does not give us any right to your Creator Content.",
      ),
    ]),
    section("beta-features", "40. Beta features", [
      p(
        "We may offer features labelled as beta, preview, early access or similar. These features may be incomplete, may change or be withdrawn at any time, and are provided \"as is\" without any commitment to availability or support.",
      ),
    ]),
    section("disclaimers", "41. Disclaimers", [
      p(
        "To the maximum extent permitted by law, the Service is provided \"as is\" and \"as available\", and we disclaim all warranties and conditions not expressly stated in these Terms, including implied warranties of merchantability, satisfactory quality, fitness for a particular purpose and non-infringement. We do not warrant that the Service will be uninterrupted, error-free or free of harmful components. Nothing in this section limits any warranty or guarantee that cannot be excluded under mandatory law.",
      ),
    ]),
    section("liability", "42. Limitation of liability", [
      p(
        "To the maximum extent permitted by law, InnerDweS is not liable for any indirect or consequential damages, lost profits, lost revenue, lost business opportunity, business interruption, downtime, data loss, data corruption, publishing delays, third-party infrastructure failures or security incidents, however caused.",
      ),
      p(
        "To the maximum extent permitted by law, the total aggregate liability of InnerDweS arising out of or in connection with the Service and these Terms is limited to **the fees you actually paid to InnerDweS during the 12 months immediately preceding the event giving rise to the claim**. No minimum amount applies: if you paid no fees during that period, this cap is zero, except where mandatory law prevents such a limitation.",
      ),
      p(
        "Nothing in these Terms excludes or limits any liability that cannot be excluded or limited under applicable law, such as liability for fraud or, where the law requires, for death or personal injury caused by negligence.",
      ),
    ]),
    section("indemnification", "43. Indemnification", [
      p(
        "To the extent permitted by law, you will indemnify and hold harmless InnerDweS against claims, losses and reasonable costs (including reasonable legal fees) brought by third parties that arise from your Creator Content, your Spaces, your breach of these Terms or your violation of any law or third-party right. This section does not apply to the extent a claim results from our own breach of these Terms, and it does not apply to consumers where mandatory law does not allow it.",
      ),
    ]),
    section("force-majeure", "44. Force majeure", [
      p(
        "We are not responsible for any delay or failure to perform caused by events beyond our reasonable control, including natural disasters, pandemics, war, terrorism, civil unrest, labour disputes, government action, failures of utilities, networks or third-party infrastructure, and cyber attacks that occur despite reasonable precautions.",
      ),
    ]),
    section("service-changes", "45. Changes to the Service", [
      p(
        "We continuously develop the Service and may add, change or remove features. If we make a change that materially reduces a paid feature you rely on, we will give you reasonable advance notice where practical, and you may cancel before the change takes effect.",
      ),
    ]),
    section("terms-changes", "46. Changes to these Terms", [
      p(
        "We may update these Terms from time to time. Each version shows its version number and effective date. If we make a material change, we will give reasonable advance notice, for example by email or in the Service, and where required we will ask you to accept the new version. Previous acceptance records are kept and are not overwritten. If you do not agree to a change, you may stop using the Service and cancel before the change takes effect.",
      ),
    ]),
    section("electronic-acceptance", "47. Electronic acceptance and communications", [
      p(
        "You accept these Terms electronically, for example by creating an Account or completing a purchase. We keep a record of the version you accepted where our systems record it. You agree that we may send you notices and other communications electronically, including by email to the address on your Account and through the Service.",
      ),
    ]),
    section("informal-resolution", "48. Informal dispute resolution", [
      p(
        `Before starting formal proceedings, please contact us at ${MAIL} with a description of the dispute, and allow approximately **30 days** for both sides to try to resolve it informally and in good faith. This step does not prevent either party from seeking urgent interim relief, and it does not affect any limitation period or mandatory right you have.`,
      ),
      p(
        "These Terms do not require arbitration and do not contain a class action waiver.",
      ),
    ]),
    section("governing-law", "49. Governing law: Singapore", [
      p(
        "These Terms and any dispute or claim arising out of or in connection with them or the Service are governed by the laws of **Singapore**, subject to the mandatory rights described in section 51.",
      ),
    ]),
    section("courts", "50. Singapore courts", [
      p(
        "Subject to section 48 and to mandatory rights that cannot legally be waived, the competent courts of Singapore have jurisdiction over any dispute arising out of or in connection with these Terms or the Service.",
      ),
    ]),
    section("consumer-rights", "51. Consumer rights", [
      p(
        "If you use the Service as a consumer, nothing in these Terms removes or limits the protection you have under the mandatory consumer laws of the country where you live, including any right to bring proceedings in the courts of that country where those laws give you that right.",
      ),
    ]),
    section("assignment", "52. Assignment", [
      p(
        "You may not assign or transfer these Terms without our prior written consent. We may assign or transfer these Terms in connection with a reorganization, merger, acquisition or transfer of the Service, provided that your rights under these Terms are not reduced as a result.",
      ),
    ]),
    section("severability", "53. Severability", [
      p(
        "If any provision of these Terms is found invalid or unenforceable, it will be enforced to the maximum extent permitted, and the remaining provisions will remain in full force and effect.",
      ),
    ]),
    section("no-waiver", "54. No waiver", [
      p(
        "A failure or delay by either party to enforce any provision of these Terms is not a waiver of that provision or of the right to enforce it later.",
      ),
    ]),
    section("entire-agreement", "55. Entire agreement", [
      p(
        "These Terms, together with the policies and addenda referred to in them, are the entire agreement between you and InnerDweS about the Service and replace any earlier agreement on the same subject. Any separate written agreement signed by both parties prevails to the extent it expressly says so.",
      ),
    ]),
    section("language", "56. Language", [
      p(
        "These Terms are written in English. If we provide a translation, it is for convenience only and the English version prevails in case of any conflict, except where mandatory law requires otherwise.",
      ),
    ]),
    section("survival", "57. Survival", [
      p(
        "Provisions that by their nature should continue after these Terms end continue to apply, including those concerning payment obligations and outstanding fees, privacy and data processing, intellectual property, disclaimers, limitation of liability, indemnification and dispute resolution.",
      ),
    ]),
    section("contact", "58. Contact", [
      p(`Questions about these Terms, notices and support requests can be sent to ${MAIL}.`),
    ]),
  ],
};
