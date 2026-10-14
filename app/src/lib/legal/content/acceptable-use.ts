import { L, MAIL, p, section, ul, type LegalDocumentBody } from "./types";

export const acceptableUseBody: LegalDocumentBody = {
  intro: [
    p(
      `This Acceptable Use Policy explains what is not allowed when you use InnerDweS, including the Studio, Spaces and Guest Apps (the **Service**). It forms part of our ${L.terms}. It applies to all content you upload or publish and to how you use the Service.`,
    ),
  ],
  sections: [
    section("scope", "1. Scope", [
      p(
        "This policy applies to every Account holder and to every Space and Guest App. Creators are also responsible for content their collaborators add to their Spaces.",
      ),
    ]),
    section("prohibited-content", "2. Prohibited content", [
      p("You must not upload, publish or share content that:"),
      ul(
        "is unlawful, or promotes or facilitates illegal activity;",
        "infringes copyright, trademark, privacy, publicity or other rights of others;",
        "sexually exploits or endangers children in any way;",
        "contains sexually explicit material, or intimate images of anyone shared without their consent;",
        "harasses, threatens, bullies or intimidates anyone, or incites violence;",
        "promotes hatred or discrimination against people based on protected characteristics;",
        "is defamatory, fraudulent, deceptive or misleading, including fake reviews or testimonials;",
        "impersonates any person or organization or misrepresents your affiliation with them;",
        "contains malware, phishing pages or other harmful code, or links to them;",
        "promotes self-harm, or dangerous practices presented as safe.",
      ),
    ]),
    section("personal-sensitive-data", "3. Personal data, minors and sensitive data", [
      ul(
        "Publish other people's Personal Data only where you have the right to do so, including any consent the law requires.",
        "Do not knowingly collect, store or publish Personal Data of minors.",
        "Do not use the Service for medical records, clinical records, electronic health records or other highly sensitive health information. Access codes and private links do not change this.",
        "Do not publish other people's private contact details, identity documents, financial information or passwords.",
      ),
    ]),
    section("health-claims", "4. Health and wellness claims", [
      p(
        "Wellness content must be honest and responsible. Do not present your services as medical diagnosis or treatment unless you are lawfully qualified and authorized to provide them, do not claim that a practice cures diseases, and do not discourage anyone from seeking appropriate medical care.",
      ),
    ]),
    section("prohibited-conduct", "5. Prohibited conduct and security", [
      p("You must not:"),
      ul(
        "access, or attempt to access, Accounts, Spaces, access-controlled content, data or systems you are not authorized to access;",
        "bypass, disable or interfere with access controls, access codes, rate limits or other security features;",
        "probe, scan or test the vulnerability of the Service without our prior written permission;",
        "use bots, scrapers or other automated means to access the Service or collect data from it, except for search engine indexing of public content;",
        "send spam or unsolicited bulk messages using the Service;",
        "use the Service to distribute content designed to collect credentials or payment details under false pretences;",
        "resell, sublicense or provide the Service to others as a service of your own without our written agreement.",
      ),
      p(
        `If you believe you have found a security vulnerability, please report it to ${MAIL} and do not exploit it or disclose it publicly before we have had a reasonable opportunity to fix it.`,
      ),
    ]),
    section("service-integrity", "6. Service integrity and usage limits", [
      p(
        "Do not overload the Service or use it in a way that degrades it for others, and respect the technical limits shown in the Service (for example file size and file type limits). Do not use the Service mainly as general file storage or as a way to host content unrelated to your Spaces.",
      ),
    ]),
    section("public-content", "7. Public and shared content", [
      p(
        "Anything you publish publicly may be copied and shared by others. Before you publish, make sure you are comfortable with the content being public and that you have the rights and permissions needed.",
      ),
    ]),
    section("reporting", "8. Reporting violations", [
      p(
        `To report content or behaviour that violates this policy, contact us at ${MAIL} with the address of the Space and a description of the problem. Rights complaints (copyright, trademark, privacy, publicity and impersonation) are handled under our ${L.copyright}.`,
      ),
    ]),
    section("enforcement", "9. Enforcement", [
      p(
        "If we reasonably believe this policy has been violated, we may remove or restrict content, unpublish a Guest App, suspend a Space or Account, or terminate an Account, as described in our Terms. Immediate action may be taken for fraud, security risks, illegal activity, serious abuse, compromised systems, serious intellectual property infringement or urgent legal requirements. For less urgent violations that can be remedied, we will give notice where reasonably practical. Where possible, we limit action to the affected Space. We may also report illegal content to the relevant authorities.",
      ),
    ]),
    section("changes", "10. Changes to this policy", [
      p("We may update this policy from time to time. Each version shows its version number and effective date."),
    ]),
    section("contact", "11. Contact", [p(`Questions about this policy can be sent to ${MAIL}.`)]),
  ],
};
