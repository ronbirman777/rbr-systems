import { L, MAIL, p, section, ul, type LegalDocumentBody } from "./types";

export const copyrightBody: LegalDocumentBody = {
  intro: [
    p(
      `InnerDweS respects intellectual property and the rights of others, and expects Creators to do the same. This Copyright & Content Takedown Policy explains how to tell us about content on InnerDweS that you believe infringes your rights, and how we handle such complaints. It forms part of our ${L.terms}.`,
    ),
  ],
  sections: [
    section("scope", "1. Scope", [
      p(
        "This policy covers complaints about content in Spaces and Guest Apps hosted on InnerDweS. It covers copyright and, through the same channel, trademark, privacy, publicity rights, impersonation and similar rights complaints (section 9).",
      ),
    ]),
    section("complaint-channel", "2. Where to send a complaint", [
      p(`Send complaints to ${MAIL}, with the subject line “Content complaint”.`),
    ]),
    section("complaint-contents", "3. What your complaint should include", [
      p("To help us review your complaint quickly, please include:"),
      ul(
        "your identity (name, and organization where relevant);",
        "your contact details, including an email address;",
        "the right you claim (for example the copyrighted work or the trademark concerned);",
        "the content you believe infringes that right;",
        "the address (URL) where the content appears;",
        "an explanation of why you believe the content infringes your right;",
        "a statement that you are making the complaint in good faith and that the information in it is accurate;",
        "where you act on behalf of the rights holder, a statement that you are authorized to act for them.",
      ),
      p("We may ask for additional information if a complaint is incomplete or unclear."),
    ]),
    section("review", "4. How we review complaints", [
      p(
        "A complaint does not automatically require removal of the content. We review each complaint, taking into account the information provided, the content concerned and, where appropriate, the Creator's response.",
      ),
    ]),
    section("actions", "5. Actions we may take", [
      p("Depending on the circumstances, we may:"),
      ul(
        "request additional information from the complainant;",
        "temporarily restrict access to the content while we review the complaint;",
        "remove the content;",
        "notify the Creator and request the Creator's response;",
        "restore content where appropriate;",
        "suspend publishing of a Space;",
        "suspend a Space;",
        "terminate the Accounts of serious or repeat infringers.",
      ),
      p("Where possible, we limit action to the affected content or Space."),
    ]),
    section("creator-response", "6. Creator response and restoration", [
      p(
        `If we act on a complaint about your content, we will usually tell you and give you the opportunity to respond, unless we are prevented by law or the situation is urgent. If you believe the complaint was mistaken or that you have the right to use the content, reply to us at ${MAIL} with an explanation and any supporting evidence. We may share your response with the complainant and may restore the content where appropriate.`,
      ),
    ]),
    section("repeat-infringers", "7. Repeat infringers", [
      p(
        "We may terminate the Account of a Creator who repeatedly or seriously infringes the rights of others, in accordance with our Terms.",
      ),
    ]),
    section("misuse", "8. Misuse of the process", [
      p(
        "Please do not submit complaints that you know to be inaccurate or that are intended to harass or to remove lawful content. We may disregard such complaints, and knowingly false statements may have legal consequences.",
      ),
    ]),
    section("other-rights", "9. Trademark, privacy, publicity and impersonation complaints", [
      p(
        `The same channel handles complaints about trademarks, privacy, publicity rights, impersonation and similar rights. Please include the same information listed in section 3, adapted to the right concerned. Privacy requests about your own Personal Data are explained in our ${L.privacy}.`,
      ),
    ]),
    section("changes", "10. Changes to this policy", [
      p("We may update this policy from time to time. Each version shows its version number and effective date."),
    ]),
    section("contact", "11. Contact", [p(`All complaints and questions about this policy: ${MAIL}.`)]),
  ],
};
