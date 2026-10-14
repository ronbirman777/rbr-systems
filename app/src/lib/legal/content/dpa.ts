import { L, MAIL, p, section, table, ul, type LegalDocumentBody } from "./types";

export const dpaBody: LegalDocumentBody = {
  intro: [
    p(
      `This Data Processing Addendum (the **DPA**) forms part of the InnerDweS ${L.terms} between InnerDweS and the Creator (**you**). It applies where InnerDweS processes Personal Data on your behalf as Processor in the course of providing the Service. Capitalized terms not defined here have the meaning given in the Terms or, where applicable, in data protection law.`,
    ),
  ],
  sections: [
    section("scope", "1. Scope and application", [
      p(
        "This DPA applies to Personal Data that you upload to, or create in, your Spaces and instruct InnerDweS to process as part of the Service (**Creator Personal Data**). It applies automatically, without a separate signature, for as long as InnerDweS processes Creator Personal Data.",
      ),
      p(
        `It does not apply to Personal Data that InnerDweS processes as Controller, such as account, authentication, billing, security, support and legal compliance data. That processing is described in our ${L.privacy}.`,
      ),
    ]),
    section("relationship", "2. Controller and Processor relationship", [
      p(
        "For Creator Personal Data, you generally act as **Controller** (or as a processor on behalf of your own controller) and InnerDweS generally acts as **Processor** (or sub-processor). Each party complies with the data protection laws that apply to it in that role.",
      ),
    ]),
    section("instructions", "3. Documented instructions", [
      p(
        "InnerDweS processes Creator Personal Data only on your documented instructions. Your instructions are given by these Terms and this DPA, and by the way you configure and use the Service, including what you upload, publish, unpublish or delete in the Studio. Any additional instruction must be agreed in writing.",
      ),
      p(
        "InnerDweS may process Creator Personal Data otherwise only where required by law, in which case it will inform you before processing unless the law prohibits this. InnerDweS will tell you if it believes an instruction infringes applicable data protection law.",
      ),
    ]),
    section("data-categories", "4. Categories of Personal Data", [
      p("Depending on what you add to your Spaces, Creator Personal Data may include:"),
      ul(
        "names, photos, biographies, roles and titles;",
        "contact details, such as email addresses, phone numbers, messaging links and social media handles;",
        "testimonials and other statements attributed to individuals;",
        "schedule information that refers to individuals;",
        "any other Personal Data contained in text, images or audio you upload.",
      ),
      p(
        "You must not upload special categories of Personal Data, medical records, clinical records or highly sensitive health information, or Personal Data of minors, except where a future feature of the Service explicitly supports that use.",
      ),
    ]),
    section("data-subjects", "5. Data Subjects", [
      p(
        "Creator Personal Data may relate to your facilitators, teachers, staff, partners and collaborators, your participants, guests and students, people who provide testimonials, and any other individual you include in your Spaces.",
      ),
    ]),
    section("purpose", "6. Purpose, nature and duration of processing", [
      table(
        "Description of the processing",
        ["Item", "Description"],
        [
          ["Purpose", "Providing the Service you request: hosting, storing, displaying and publishing your Spaces and Guest Apps."],
          ["Nature", "Hosting, storage, retrieval, technical transformation (for example resizing or compression), transmission, display, publication, security, backup and restoration."],
          ["Duration", "For as long as you use the Service, followed by deletion as described in section 14."],
        ],
      ),
    ]),
    section("creator-responsibilities", "7. Creator responsibilities", [
      ul(
        "You are responsible for the lawfulness of the Creator Personal Data and of your instructions, including having a lawful basis and any necessary consents.",
        "You are responsible for giving the information to individuals that the law requires, including that their Personal Data will be published in a Guest App where that is the case.",
        "You decide the visibility of each Space, and you are responsible for choosing settings appropriate for the Personal Data it contains.",
        "You are responsible for protecting your Account credentials and access codes and for changing access codes where needed.",
      ),
    ]),
    section("confidentiality", "8. Confidentiality", [
      p(
        "InnerDweS ensures that the people it authorizes to process Creator Personal Data are bound by appropriate obligations of confidentiality and access it only as needed to provide, secure and support the Service.",
      ),
    ]),
    section("security", "9. Security", [
      p(
        "InnerDweS implements reasonable technical and organizational measures designed to protect Creator Personal Data against accidental or unlawful destruction, loss, alteration, unauthorized disclosure or access, taking into account the nature of the processing and the risks involved. These include encryption in transit, access controls that limit who can reach data, and encrypted backups. No system is completely secure, and InnerDweS does not guarantee absolute security.",
      ),
    ]),
    section("subprocessors", "10. Subprocessors", [
      p(
        `You authorize InnerDweS to engage the subprocessors listed on our ${L.subprocessors} page. InnerDweS imposes data protection obligations on each subprocessor that are appropriate to the services it provides and remains responsible for its subprocessors' performance in accordance with this DPA.`,
      ),
      p(
        `InnerDweS will update that page before a new subprocessor begins processing Creator Personal Data. If you have a reasonable objection based on data protection grounds, tell us at ${MAIL}. We will discuss the objection in good faith; if we cannot resolve it, you may stop using the affected part of the Service or terminate it.`,
      ),
    ]),
    section("international-transfers", "11. International transfers", [
      p(
        "InnerDweS and its subprocessors may process Creator Personal Data outside the country where you or the Data Subjects are located. Where the law requires, InnerDweS relies on appropriate transfer mechanisms, such as Standard Contractual Clauses, Binding Corporate Rules, adequacy decisions, recognized transfer frameworks or other lawful mechanisms.",
      ),
    ]),
    section("data-subject-requests", "12. Data Subject Requests", [
      p(
        "If InnerDweS receives a request from a Data Subject about Creator Personal Data, it will, where the Creator can be identified, refer the request to you or notify you, and will not respond directly except to confirm the referral or where the law requires. Taking into account the nature of the processing, InnerDweS will provide reasonable assistance to help you respond, much of which you can do directly in the Studio by editing or deleting content.",
      ),
    ]),
    section("security-incidents", "13. Security incidents", [
      p(
        "InnerDweS will notify you without undue delay after becoming aware of a personal data breach affecting Creator Personal Data, and will provide the information reasonably available to it to help you meet any obligation to notify regulators or individuals. InnerDweS will take reasonable steps to contain the breach and mitigate its effects and will coordinate with any subprocessor involved. Notification of a breach is not an admission of fault or liability.",
      ),
    ]),
    section("deletion-return", "14. Deletion and return", [
      p(
        "You can retrieve Creator Content using the functionality available in the Service, or contact us for assistance, before you delete a Space or your Account. When you delete a Space or your Account, or after the Service ends, InnerDweS deletes Creator Personal Data from its active systems within approximately 30 days, unless the law requires it to keep the data. Residual copies may remain in backups until the applicable backup lifecycle expires, and are protected and not actively used in the meantime.",
      ),
    ]),
    section("audit", "15. Audit and information rights", [
      p(
        "On reasonable written request, InnerDweS will make available the information reasonably necessary to demonstrate compliance with this DPA. Where the law gives you a right to audit, audits are subject to reasonable notice, confidentiality and scope, must not compromise the security of the Service or other customers' data, and may be satisfied by documentation, certifications or audit reports of InnerDweS or its subprocessors where appropriate.",
      ),
    ]),
    section("liability", "16. Liability", [
      p(
        "Each party's liability under or in connection with this DPA is subject to the limitations and exclusions of liability in the Terms, except where mandatory law does not allow such a limitation.",
      ),
    ]),
    section("conflict", "17. Conflict with the Terms", [
      p(
        "If there is a conflict between this DPA and the Terms concerning the processing of Creator Personal Data, this DPA prevails. In all other respects the Terms apply, including the governing law and jurisdiction clauses.",
      ),
    ]),
    section("contact", "18. Contact", [
      p(`Questions about this DPA can be sent to ${MAIL}.`),
    ]),
  ],
};
