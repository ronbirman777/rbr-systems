import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teach/fonts", () => ({ TEACH_FONT_VARIABLES: "" }));

import { parsePublishedTeachSpace, type TeachGuestData } from "@/lib/teach/guestData";
import { teachPrefetchItems, TeachGuestApp } from "./teach-guest-app";
import { RetreatDetailScreen, RetreatsScreen } from "./teach-retreats";
import { exploreModuleStatus } from "@/lib/teach/moduleVisibility";
import type { Locale } from "@/lib/i18n";

const TENANT = "11111111-1111-4111-8111-111111111111";
const row = (id: string, title: string, metadata: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  subtitle: null,
  description: `About ${title}`,
  imageRef: null,
  externalLink: null,
  metadata,
  ...extra,
});

function guest(retreats: unknown[], opts: { enabled?: string[]; locale?: Locale; todayIso?: string } = {}): TeachGuestData {
  const data = parsePublishedTeachSpace({
    name: "Lena Hoffmann",
    theme: null,
    timezone: "Asia/Bangkok",
    enabled_modules: opts.enabled ?? ["teachRetreats"],
    modules: { spaceSettings: { locale: opts.locale ?? "en" }, teach: { settings: {}, items: { teachRetreats: retreats } } },
  });
  return opts.todayIso ? { ...data, todayIso: opts.todayIso } : data;
}

const html = (data: TeachGuestData, tab: "home" | "explore" = "explore") => renderToStaticMarkup(createElement(TeachGuestApp, { data, initialTab: tab }));
const list = (d: TeachGuestData) => renderToStaticMarkup(createElement(RetreatsScreen, { data: d, onBack: () => {}, onOpen: () => {}, title: "My Retreats" }));
const detail = (d: TeachGuestData, id: string) => renderToStaticMarkup(createElement(RetreatDetailScreen, { data: d, item: d.retreats.find((r) => r.id === id)!, onBack: () => {} }));

describe("My Retreats - Explore card visibility", () => {
  it("module off: no card and no status, even with retreats published", () => {
    const d = guest([row("a", "Autumn Retreat")], { enabled: [] });
    expect(exploreModuleStatus(d, "teachRetreats")).toBe("off");
    expect(html(d)).not.toContain("My Retreats");
  });
  it("module on but empty: hidden from guests", () => {
    const d = guest([]);
    expect(exploreModuleStatus(d, "teachRetreats")).toBe("empty");
    expect(html(d)).not.toContain("My Retreats");
  });
  it("module on, only a disabled retreat: still hidden (disabled never reaches the guest)", () => {
    const d = guest([row("a", "Hidden", { enabled: false })]);
    expect(d.retreats).toHaveLength(0);
    expect(html(d)).not.toContain("My Retreats");
  });
  it("one retreat uses the normal card -> list -> detail architecture", () => {
    const d = guest([row("a", "Autumn Retreat")]);
    expect(exploreModuleStatus(d, "teachRetreats")).toBe("visible");
    expect(html(d)).toContain("My Retreats");
    expect(list(d)).toContain("Autumn Retreat");
    expect(list(d).match(/data-testid="retreat-card"/g)).toHaveLength(1);
  });
});

describe("My Retreats - ordering and per-retreat visibility", () => {
  it("keeps the teacher's order and drops disabled retreats", () => {
    const d = guest([row("c", "Third"), row("a", "First", { enabled: false }), row("b", "Second"), row("d", "Fourth", { enabled: true })]);
    expect(d.retreats.map((r) => r.title)).toEqual(["Third", "Second", "Fourth"]);
    const out = list(d);
    expect(out.indexOf("Third")).toBeLessThan(out.indexOf("Second"));
    expect(out.indexOf("Second")).toBeLessThan(out.indexOf("Fourth"));
    expect(out).not.toContain("First");
  });
  it("a malformed row is dropped without blanking the rest", () => {
    const d = guest([row("a", "Good"), { id: "x", title: "" }, "junk", null, row("b", "Also good")]);
    expect(d.retreats.map((r) => r.title)).toEqual(["Good", "Also good"]);
  });
});

describe("My Retreats - dates: future, ongoing, past, none", () => {
  const dated = { startDate: "2027-10-14", endDate: "2027-10-20", location: "Koh Phangan, Thailand" };
  it("future retreat: dates and location, no phase chip", () => {
    const out = list(guest([row("a", "Autumn", dated)], { todayIso: "2027-09-01" }));
    expect(out).toContain("14–20 Oct 2027");
    expect(out).toContain("Koh Phangan, Thailand");
    expect(out).not.toContain("Happening now");
    expect(out).not.toContain("Past retreat");
  });
  it("ongoing retreat is marked", () => {
    expect(list(guest([row("a", "Autumn", dated)], { todayIso: "2027-10-16" }))).toContain("Happening now");
  });
  it("past retreats are SHOWN and marked, never silently hidden", () => {
    const d = guest([row("a", "Autumn", dated)], { todayIso: "2028-01-01" });
    expect(d.retreats).toHaveLength(1);
    expect(list(d)).toContain("Past retreat");
    expect(detail(d, "a")).toContain("Past retreat");
  });
  it("a date-less retreat renders cleanly with no empty date row", () => {
    const d = guest([row("a", "Someday", {})]);
    const out = detail(d, "a");
    expect(out).toContain("Someday");
    expect(out).not.toContain("Dates");
    expect(out).not.toContain("<dl");
  });
});

describe("My Retreats - price", () => {
  it("shows amount + currency in list and detail; nothing when there is no price", () => {
    const priced = guest([row("a", "Priced", { price: 700, currency: "THB" }), row("b", "Free-form", {})]);
    expect(list(priced)).toContain("700 THB");
    expect(detail(priced, "a")).toContain("700 THB");
    expect(detail(priced, "b")).not.toContain("THB");
  });
  it("never offers a checkout: no payment words or forms anywhere", () => {
    const out = detail(guest([row("a", "Priced", { price: 700, currency: "THB" })]), "a").toLowerCase();
    for (const word of ["checkout", "pay now", "<form", "stripe", "add to cart"]) expect(out).not.toContain(word);
  });
});

describe("My Retreats - links: external only, Flow only, both, neither", () => {
  const external = { registration: { method: "website", value: "example.com/join", buttonLabel: "Reserve my place" } };
  const flow = { flowGuestUrl: "https://innerdwes.com/s/return-to-balance" };

  it("external only: one external CTA, opens a new tab safely", () => {
    const out = detail(guest([row("a", "R", external)]), "a");
    expect(out).toContain("Reserve my place");
    expect(out).toContain('href="https://example.com/join"');
    expect(out).toMatch(/target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/);
    expect(out).not.toContain("View retreat");
  });
  it("Flow only: 'View retreat' to the InnerDweS Guest App, same tab", () => {
    const out = detail(guest([row("a", "R", flow)]), "a");
    expect(out).toContain("View retreat");
    const anchor = out.match(/<a[^>]*href="https:\/\/innerdwes\.com\/s\/return-to-balance"[^>]*>/)![0];
    expect(anchor).not.toContain("target=");
  });
  it("both: the InnerDweS retreat is the primary action, external registration the secondary", () => {
    const out = detail(guest([row("a", "R", { ...flow, ...external })]), "a");
    expect(out).toContain("View retreat");
    expect(out).toContain("Reserve my place");
    expect(out.indexOf("View retreat")).toBeLessThan(out.indexOf("Reserve my place"));
  });
  it("neither: no CTA block at all", () => {
    const out = detail(guest([row("a", "R", {})]), "a");
    expect(out).not.toContain("View retreat");
    expect(out).not.toMatch(/<a [^>]*href=/);
  });
  it("hostile addresses never become a clickable href", () => {
    const out = detail(guest([row("a", "R", { flowGuestUrl: "javascript:alert(1)", registration: { method: "website", value: "javascript:alert(1)" } })]), "a");
    expect(out).not.toContain("javascript:");
  });
  it("WhatsApp registration builds a wa.me link with a prefilled message in the Space language", () => {
    const en = detail(guest([row("a", "Autumn", { registration: { method: "whatsapp", value: "+66 81 234 5678" } })]), "a");
    expect(en).toContain("https://wa.me/66812345678");
    expect(decodeURIComponent(en.match(/wa\.me\/66812345678\?text=([^"]+)"/)![1].replace(/&amp;/g, "&"))).toContain("Autumn");
  });
});

describe("My Retreats - user text and localisation", () => {
  it("teacher-authored fields are dir=auto and never translated, in every locale", () => {
    for (const locale of ["en", "de", "es", "fr", "he"] as Locale[]) {
      const d = guest([row("a", "Atem-Retreat ריטריט", { location: "קו פנגן", durationLabel: "7 ימים" }, { description: "תיאור קצר" })], { locale });
      const out = detail(d, "a") + list(d);
      expect(out).toContain("Atem-Retreat ריטריט");
      expect(out).toContain("קו פנגן");
      expect(out).toContain("תיאור קצר");
      expect(out).toMatch(/dir="auto"/);
      expect(out).not.toMatch(/\{\{|undefined|\[object/);
    }
  });
  it("system labels follow the Space language", () => {
    const he = guest([row("a", "R", { startDate: "2027-10-14", price: 5, currency: "THB" })], { locale: "he", todayIso: "2027-10-10" });
    expect(detail(he, "a")).toContain("תאריכים");
    const de = guest([row("a", "R", { flowGuestUrl: "https://innerdwes.com/s/example" })], { locale: "de" });
    expect(detail(de, "a")).toContain("Retreat ansehen");
  });
  it("Hebrew renders in an RTL container", () => {
    expect(html(guest([row("a", "R")], { locale: "he" }))).toContain('dir="rtl"');
  });
  it("long unbroken text wraps instead of overflowing", () => {
    const long = "W".repeat(150);
    const d = guest([row("a", long, { location: long })]);
    expect(d.retreats).toHaveLength(1);
    const out = list(d) + detail(d, "a");
    expect(out).toContain("[overflow-wrap:anywhere]");
    // and a name beyond the 160-character limit is refused rather than rendered
    expect(guest([row("b", "W".repeat(300))]).retreats).toHaveLength(0);
  });
});

describe("My Retreats - media", () => {
  it("a cover resolves through /api/media only, and joins the card prefetch", () => {
    const ref = `${TENANT}/teachRetreats/r1/u1/published.webp`;
    const d = guest([row("a", "R", {}, { imageRef: ref })]);
    expect(d.mediaUrls[ref]).toBe(`/api/media/${ref}`);
    expect(list(d)).toContain(`/api/media/${ref}`);
    expect(list(d)).not.toContain("supabase.co");
    const items = teachPrefetchItems(d, "home", (r) => (r ? (d.mediaUrls[r] ?? null) : null));
    expect(items.some((i) => i.src === `/api/media/${ref}`)).toBe(true);
  });
  it("no cover: a branded fallback, never a broken image", () => {
    expect(list(guest([row("a", "R")]))).not.toContain("<img src=\"null");
  });
});
