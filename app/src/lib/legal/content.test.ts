import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, findLegalDocumentBySlug, type LegalDocumentId } from "./documents";
import { LEGAL_BODIES } from "./content";
import { LEGAL_ARCHIVED_BODIES } from "./content/archive";
import type { LegalBlock, LegalDocumentBody } from "./content/types";
import { inlineToPlainText, tokenizeInline } from "./inline";

/**
 * Coverage of the owner-approved Legal Master: every structural item the
 * Master lists for a document (Terms section 38, Privacy section 39, DPA
 * section 40, and the topics of the other four) must exist as a heading.
 * Matching is a case-insensitive substring of the heading text, so the
 * numbering can change without breaking the test - but a dropped topic
 * cannot.
 */
const REQUIRED_HEADINGS: Record<LegalDocumentId, string[]> = {
  "terms": [
    "Definitions",
    "Eligibility: 18 and older",
    "account security",
    "Description of the Service",
    "Spaces",
    "The Studio",
    "Guest Apps",
    "Public, unlisted, access-controlled and private Spaces",
    "Publishing",
    "Creator Content",
    "Technical content license",
    "Creator responsibilities",
    "Sensitive data restrictions",
    "Acceptable use",
    "Copyright and content takedown",
    "Privacy and data processing",
    "Service providers",
    "Subscriptions and billing",
    "Taxes",
    "Cancellation",
    "Refunds",
    "Statutory withdrawal rights",
    "Failed payments",
    "Data retention",
    "Backups and data loss",
    "Suspension",
    "Termination",
    "Reactivation",
    "Service availability",
    "Support",
    "Third-party services",
    "No professional advice",
    "No endorsement of Creators",
    "Usage limits",
    "Security",
    "Security incidents",
    "InnerDweS intellectual property",
    "Feedback",
    "Beta features",
    "Disclaimers",
    "Limitation of liability",
    "Indemnification",
    "Force majeure",
    "Changes to the Service",
    "Changes to these Terms",
    "Electronic acceptance",
    "Informal dispute resolution",
    "Governing law: Singapore",
    "Singapore courts",
    "Consumer rights",
    "Assignment",
    "Severability",
    "No waiver",
    "Entire agreement",
    "Language",
    "Survival",
    "Contact",
  ],
  "privacy": [
    "Scope",
    "Controller and Processor roles",
    "Account data",
    "Billing data",
    "Creator Content",
    "Support data",
    "Security and technical data",
    "Usage and resource data",
    "Guest App data",
    "How we use Personal Data",
    "Legal bases",
    "Creator responsibility",
    "Sensitive data",
    "Public content",
    "Access-controlled content",
    "Service providers",
    "AI development tools",
    "Shopify privacy features",
    "Transactional email",
    "Payments",
    "International transfers",
    "Retention",
    "Failed payment retention",
    "Security",
    "Security incidents",
    "Your rights",
    "Creator-controlled data",
    "Privacy request timelines",
    "18+ policy",
    "No sale of Personal Data",
    "No targeted advertising at launch",
    "Automated decision-making",
    "Cookies and similar technologies",
    "Third-party links",
    "Changes to this Privacy Policy",
    "Privacy governance",
    "Contact",
  ],
  "dpa": [
    "Scope and application",
    "Controller and Processor relationship",
    "Documented instructions",
    "Categories of Personal Data",
    "Data Subjects",
    "Purpose, nature and duration of processing",
    "Creator responsibilities",
    "Confidentiality",
    "Security",
    "Subprocessors",
    "International transfers",
    "Data Subject Requests",
    "Security incidents",
    "Deletion and return",
    "Audit and information rights",
    "Conflict with the Terms",
    "Contact",
  ],
  "acceptable-use": [
    "Scope",
    "Prohibited content",
    "Personal data, minors and sensitive data",
    "Health and wellness claims",
    "Prohibited conduct and security",
    "Service integrity and usage limits",
    "Public and shared content",
    "Reporting violations",
    "Enforcement",
    "Contact",
  ],
  "copyright": [
    "Scope",
    "Where to send a complaint",
    "What your complaint should include",
    "How we review complaints",
    "Actions we may take",
    "Creator response and restoration",
    "Repeat infringers",
    "Misuse of the process",
    "Trademark, privacy, publicity and impersonation complaints",
    "Contact",
  ],
  "subprocessors": [
    "Service providers",
    "Cloudflare",
    "AI development tools",
    "International transfers",
    "Changes to this page",
    "Contact",
  ],
  "billing": [
    "Plans and prices",
    "Billing period and automatic renewal",
    "Payment methods and processors",
    "Taxes",
    "Bank, card and foreign exchange charges",
    "Upgrades and downgrades",
    "Coupons and promotions",
    "No undisclosed usage charges",
    "Cancellation",
    "What happens after cancellation",
    "Refunds",
    "Setup and onboarding fees",
    "Statutory withdrawal rights",
    "Failed payments",
    "Restoring a Space after payment",
    "Outages and delays",
    "Billing questions and disputes",
    "Contact",
  ],
};

function headings(body: LegalDocumentBody): string[] {
  return body.sections.flatMap((s) => [s.heading, ...(s.subsections ?? []).map((ss) => ss.heading)]);
}

function blockTexts(b: LegalBlock): string[] {
  if (b.type === "p" || b.type === "note") return [b.text];
  if (b.type === "ul" || b.type === "ol") return b.items;
  return [b.caption, ...b.head, ...b.rows.flat()];
}

function allTexts(body: LegalDocumentBody): string[] {
  return [
    ...body.intro.flatMap(blockTexts),
    ...body.sections.flatMap((s) => [
      s.heading,
      ...s.blocks.flatMap(blockTexts),
      ...(s.subsections ?? []).flatMap((ss) => [ss.heading, ...ss.blocks.flatMap(blockTexts)]),
    ]),
  ];
}

function plain(id: LegalDocumentId): string {
  return allTexts(LEGAL_BODIES[id]).map(inlineToPlainText).join("\n");
}

function sectionOf(body: LegalDocumentBody, id: string) {
  const s = body.sections.find((x) => x.id === id);
  if (!s) throw new Error(`no section ${id}`);
  return s;
}

function sectionText(id: LegalDocumentId, sectionId: string): string {
  const s = sectionOf(LEGAL_BODIES[id], sectionId);
  return [s.heading, ...s.blocks.flatMap(blockTexts)].map(inlineToPlainText).join("\n");
}

describe("legal documents cover the Legal Master structure", () => {
  for (const doc of LEGAL_DOCUMENTS) {
    it(`${doc.title} has every required section`, () => {
      const hs = headings(LEGAL_BODIES[doc.id]).map((h) => h.toLowerCase());
      const missing = REQUIRED_HEADINGS[doc.id].filter((r) => !hs.some((h) => h.includes(r.toLowerCase())));
      expect(missing).toEqual([]);
    });

    it(`${doc.title} has unique, URL-safe section anchors`, () => {
      const ids = LEGAL_BODIES[doc.id].sections.flatMap((s) => [s.id, ...(s.subsections ?? []).map((ss) => ss.id)]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    });

    it(`${doc.title} numbers its sections 1..n in order`, () => {
      LEGAL_BODIES[doc.id].sections.forEach((s, i) => expect(s.heading.startsWith(`${i + 1}. `)).toBe(true));
    });

    it(`${doc.title} links only to registered legal documents, in-page anchors or the contact address`, () => {
      const anchors = new Set(LEGAL_BODIES[doc.id].sections.map((s) => s.id));
      for (const text of allTexts(LEGAL_BODIES[doc.id])) {
        for (const t of tokenizeInline(text)) {
          if (t.kind !== "link") continue;
          if (t.href.startsWith("mailto:")) expect(t.href).toBe("mailto:contact@innerdwes.com");
          else if (t.href.startsWith("#")) expect(anchors.has(t.href.slice(1))).toBe(true);
          else {
            const m = /^\/legal\/([a-z0-9-]+)$/.exec(t.href);
            expect(m, t.href).not.toBeNull();
            expect(findLegalDocumentBySlug(m![1]), t.href).toBeDefined();
          }
        }
      }
    });

    it(`${doc.title} names the contact address`, () => {
      expect(plain(doc.id)).toContain("contact@innerdwes.com");
    });

    it(`${doc.title} publishes no placeholder or invented identity details`, () => {
      const text = plain(doc.id);
      for (const banned of [/\b(entity|registration|incorporation|address|UEN|GST|tax[a-z ]*)\s+(is\s+)?pending\b/i, /\bpending\s+(registration|incorporation|entity)\b/i, /\bUEN\b/, /GST (registration )?number/i, /tax ID/i, /registered (business )?address/i, /\bPte\.? Ltd\b/i, /\bcompany\b/i, /TODO|TBD|lorem/i, /HIPAA[- ]compliant/i, /72[- ]hours?/i]) {
        expect(text, String(banned)).not.toMatch(banned);
      }
    });
  }
});

describe("approved decisions are stated consistently", () => {
  it("Terms: 18+, Singapore law and courts, ~30-day informal resolution, no arbitration or class action waiver", () => {
    const t = plain("terms");
    expect(t).toContain("18 and older");
    expect(t).toContain("governed by the laws of Singapore");
    expect(t).toContain("competent courts of Singapore");
    expect(t).toContain("approximately 30 days");
    expect(t).toContain("do not require arbitration and do not contain a class action waiver");
    expect(t).toMatch(/mandatory consumer laws of the country where you live/);
  });

  it("Terms: the approved liability cap with no minimum floor", () => {
    const t = plain("terms");
    expect(t).toContain("the fees you actually paid to InnerDweS during the 12 months immediately preceding the event giving rise to the claim");
    expect(t).toContain("if you paid no fees during that period, this cap is zero, except where mandatory law prevents such a limitation");
    for (const item of ["indirect", "consequential", "lost profits", "lost revenue", "lost business opportunity", "business interruption", "downtime", "data loss", "data corruption", "publishing delays", "third-party infrastructure failures", "security incidents"]) {
      expect(t).toContain(item);
    }
  });

  it("availability (~24 h target, not an SLA) and support (~3 business days) are the same everywhere they appear", () => {
    expect(plain("terms")).toContain("approximately 24 hours");
    expect(plain("terms")).toContain("approximately 3 business days");
    expect(plain("privacy")).toContain("approximately 3 business days");
    expect(plain("terms")).toContain("This is a target, not a guaranteed service level");
    expect(plain("terms")).toContain("not a guaranteed resolution time");
    expect(plain("terms")).toContain("we do not guarantee any particular uptime");
  });

  it("retention: ~30 days from active systems, backups not deleted immediately - in every document that mentions it", () => {
    for (const id of ["terms", "privacy", "billing", "dpa"] as const) {
      expect(plain(id), id).toContain("within approximately 30 days");
      expect(plain(id), id).toMatch(/backup lifecycle expires/);
    }
    const pr = plain("privacy");
    expect(pr).toContain("Approximately 12 months after the request is closed");
    expect(pr).toContain("Approximately 90 days by default");
  });

  it("refunds: generally non-refundable, no prorated refunds, the approved exceptions - in Terms and Billing", () => {
    for (const id of ["terms", "billing"] as const) {
      const t = plain(id);
      expect(t).toMatch(/generally non-refundable/);
      expect(t).toMatch(/prorated refunds/);
      for (const e of ["duplicate charges", "billing errors", "incorrect charges"]) expect(t).toContain(e);
      expect(t).toMatch(/[Ss]etup or onboarding fees[^.]*non-refundable once the associated work has begun/);
    }
  });

  it("failed payments: the approved day 0 / ~24 h / day 7 / day 12-13 / day 14 lifecycle", () => {
    const b = plain("billing");
    for (const s of ["Day 0", "After approximately 24 hours", "Day 7", "Day 12 or 13", "Day 14"]) expect(b).toContain(s);
    expect(b).toContain("we cancel any pending suspension and deletion actions and restore the affected Space");
    expect(plain("terms")).toContain("day 14");
    expect(plain("privacy")).toContain("day 14");
  });

  it("normal cancellation (v1.1): active to period end -> unavailable to guests -> 30 days preserved -> eligible for deletion", () => {
    const b = sectionText("billing", "after-cancellation");
    const table = sectionOf(LEGAL_BODIES.billing, "after-cancellation").blocks.find((x) => x.type === "table");
    expect(table && table.type === "table" ? table.rows.map((r) => r[0]) : []).toEqual([
      "Until the end of the paid billing period",
      "When the paid billing period ends",
      "For 30 days after the end of the paid billing period",
      "After those 30 days",
    ]);
    for (const s of [
      "The subscription remains active",
      "the Space becomes unavailable to guests",
      "You keep access to billing and reactivation for the Space",
      "The Space content is preserved",
      "eligible for deletion from our active systems, subject to applicable legal obligations and any notices we are required to give",
      "before it is deleted, it is restored without data loss",
      "other Spaces in your Account are not automatically deleted",
      "separate from the failed-payment process in section 15",
    ]) expect(b).toContain(s);
    expect(sectionText("billing", "cancellation")).toContain("remains active until the end of the billing period you have already paid for");

    const t = sectionText("terms", "cancellation");
    for (const s of [
      "remains active, and you keep access to the paid features of that Space, until the end of the billing period you have already paid for",
      "the Space becomes unavailable to guests, and you keep access to billing and reactivation for it",
      "The Space content is preserved for 30 days after the end of the paid period",
      "after those 30 days, the Space becomes eligible for deletion, subject to applicable legal obligations and any required notices",
      "If you reactivate the Space before it is deleted, it is restored without data loss",
      "your other Spaces are not automatically deleted",
      "separate from the failed-payment process in section 24",
    ]) expect(t).toContain(s);
    expect(sectionText("terms", "retention")).toContain("preserved for 30 days after the end of the paid period and then becomes eligible for deletion");
    expect(sectionText("terms", "reactivation")).toContain("reactivate the Space by subscribing again before it is deleted, and it is then restored without data loss");

    const pr = sectionText("privacy", "retention");
    expect(pr).toContain("Content of a Space whose paid subscription you cancelled");
    expect(pr).toContain("Preserved for 30 days after the end of the paid billing period");
    expect(pr).toContain("eligible for deletion from active systems, subject to legal obligations and any required notices");
    expect(sectionText("privacy", "failed-payment-retention")).toContain("separate from the retention that follows a cancellation");

    expect(sectionText("dpa", "deletion-return")).toContain("preserved for 30 days after the end of the paid billing period, so that you can reactivate the Space, and then becomes eligible for deletion");
  });

  it("normal cancellation: no document still promises open-ended retention, claims automation, or mixes in the failed-payment days", () => {
    for (const id of ["terms", "privacy", "dpa", "billing"] as const) {
      const t = plain(id);
      expect(t, id).not.toContain("remains in your account so that you can reactivate");
      expect(t, id).not.toMatch(/\bwe (will )?automatically (delete|suspend|restore)/i);
    }
    for (const [id, sid] of [["billing", "after-cancellation"], ["terms", "cancellation"]] as const) {
      expect(sectionText(id, sid), `${id}#${sid}`).not.toMatch(/\bday (7|12|13|14)\b/i);
    }
  });

  it("failed payments: the timeline is unchanged from Version 1.0 in every document", () => {
    const v10 = LEGAL_ARCHIVED_BODIES;
    const fp = (body: LegalDocumentBody) => sectionOf(body, "failed-payments").blocks.find((x) => x.type === "table");
    expect(fp(LEGAL_BODIES.billing)).toEqual(fp(v10.billing!["1.0"]));
    expect(sectionOf(LEGAL_BODIES.billing, "restoration")).toEqual(sectionOf(v10.billing!["1.0"], "restoration"));
    expect(sectionOf(LEGAL_BODIES.terms, "failed-payments")).toEqual(sectionOf(v10.terms!["1.0"], "failed-payments"));
    const prOld = sectionOf(v10.privacy!["1.0"], "failed-payment-retention").blocks[0];
    const prNew = sectionOf(LEGAL_BODIES.privacy, "failed-payment-retention").blocks[0];
    expect(prOld.type === "p" && prNew.type === "p" && prNew.text.startsWith(prOld.text)).toBe(true);
    // The billing intro paragraph only gains the "separate from cancellation" sentence.
    const bOld = sectionOf(v10.billing!["1.0"], "failed-payments").blocks[0];
    const bNew = sectionOf(LEGAL_BODIES.billing, "failed-payments").blocks[0];
    expect(bOld.type === "p" && bNew.type === "p" && bNew.text.startsWith(bOld.text)).toBe(true);
    expect(sectionText("billing", "failed-payments")).toContain("separate from a cancellation you make yourself");
  });

  it("only Terms, Privacy, DPA and Billing changed between Version 1.0 and 1.1; their section structure is unchanged", () => {
    for (const id of ["terms", "privacy", "dpa", "billing"] as const) {
      const old = LEGAL_ARCHIVED_BODIES[id]!["1.0"];
      expect(headings(LEGAL_BODIES[id]), id).toEqual(headings(old));
      expect(LEGAL_BODIES[id].intro, id).toEqual(old.intro);
    }
  });

  it("withdrawal: two separate statements, never a blanket waiver", () => {
    for (const id of ["terms", "billing"] as const) {
      const t = plain(id);
      expect(t).toMatch(/expressly request that the Service starts immediately|explicit consent requesting that the Service is activated immediately/);
      expect(t).toMatch(/may be reduced or lost once the Service has been fully performed/);
      expect(t).toMatch(/proportionate amount/);
      expect(t).not.toMatch(/I waive all refund rights/i);
    }
  });

  it("subprocessors: lists the approved providers, Cloudflare depending on configuration, and not OpenAI/Anthropic", () => {
    const table = LEGAL_BODIES.subprocessors.sections[0].blocks.find((b) => b.type === "table");
    expect(table?.type).toBe("table");
    const names = table && table.type === "table" ? table.rows.map((r) => r[0]) : [];
    for (const n of ["Supabase", "Vercel", "Stripe", "Shopify", "Resend", "Backblaze B2", "Cloudflare"]) expect(names).toContain(n);
    expect(names).not.toContain("OpenAI");
    expect(names).not.toContain("Anthropic");
    const cf = table && table.type === "table" ? table.rows.find((r) => r[0] === "Cloudflare") : undefined;
    expect(cf?.join(" ")).toMatch(/[Dd]epending on configuration/);
  });

  it("privacy: no sale, no targeted advertising, no single-country promise, metering without listener identifiers", () => {
    const pr = plain("privacy");
    expect(pr).toContain("does not sell Personal Data");
    expect(pr).toContain("does not use Personal Data for targeted advertising");
    expect(pr).toContain("we do not promise that Personal Data stays in any single country");
    expect(pr).toMatch(/do not use a persistent listener identifier, we do not store IP addresses or user agent information/);
  });
});
