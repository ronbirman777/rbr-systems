import { describe, expect, it } from "vitest";
import {
  buildRegistrationCta,
  contactEntries,
  availabilityCtas,
  instagramUrl,
  mailtoUrl,
  normalizeWhatsAppNumber,
  renderTemplate,
  safeHttpUrl,
  venueLinks,
  whatsappUrl,
  formatShortDate,
  DEFAULT_CLASS_WHATSAPP_TEMPLATE,
} from "./links";
import {
  addDays,
  availabilityOccursOn,
  buildScheduleDays,
  classesOn,
  durationMinutes,
  formatDuration,
  isClassPast,
  nextUpcomingClass,
  teachingSinceLabel,
  weekdayOf,
} from "./schedule";
import {
  blankTeachMetadata,
  collectTeachMediaRefs,
  defaultTeachSettings,
  isTenantMediaRef,
  parseTeachItem,
  parseTeachItems,
  parseTeachSetting,
  teachItemFieldsSchema,
  type TeachItem,
} from "./schemas";
import { TEACH_PRESETS, teachStyleVars } from "./style";
import { contrastRatio, hexToRgb } from "@/lib/theme/contrast";
import { clampFocalPoint, focalPointToObjectPosition, nudgeFocalPoint } from "@/lib/media/focalPoint";
import { getDailyQuote, getDailyQuoteFrom } from "@/lib/content/dailyQuotes";
import { collectImageRefs, collectMediaRefs } from "@/lib/media/path";
import { parsePublishedTeachSpace } from "./guestData";

const TENANT = "11111111-2222-3333-4444-555555555555";

function cls(id: string, meta: Record<string, unknown>, title = "Morning Slow Flow"): TeachItem<"teachClasses"> {
  const item = parseTeachItem("teachClasses", { id, title, metadata: meta });
  if (!item) throw new Error("bad fixture");
  return item;
}

describe("links: WhatsApp", () => {
  it("normalises international numbers to E.164 digits", () => {
    expect(normalizeWhatsAppNumber("+972 50-000 0000")).toBe("972500000000");
    expect(normalizeWhatsAppNumber("00972500000000")).toBe("972500000000");
    expect(normalizeWhatsAppNumber("123")).toBeNull();
    expect(normalizeWhatsAppNumber("")).toBeNull();
  });

  it("builds an encoded wa.me deep link", () => {
    expect(whatsappUrl("+972500000000", "Hi & hello?")).toBe("https://wa.me/972500000000?text=Hi%20%26%20hello%3F");
    expect(whatsappUrl("+972500000000")).toBe("https://wa.me/972500000000");
    expect(whatsappUrl("nope", "x")).toBeNull();
  });

  it("renders templates, leaving unknown variables as typed", () => {
    expect(
      renderTemplate("Hi {{teacher_name}}, {{ class_name }} on {{date}} at {{start_time}} {{oops}}", {
        teacher_name: "Maya",
        class_name: "Slow Flow",
        date: "Tue 14 Oct",
        start_time: "07:30",
      })
    ).toBe("Hi Maya, Slow Flow on Tue 14 Oct at 07:30 {{oops}}");
    expect(renderTemplate("At {{location}} ok", {})).toBe("At ok");
  });

  it("formats calendar dates without time zone drift", () => {
    expect(formatShortDate("2025-10-14")).toBe("Tue 14 Oct");
  });

  it("class CTA uses the teacher template with class values", () => {
    const c = cls("a", {
      startDate: "2025-10-14",
      startTime: "07:30",
      endTime: "08:45",
      registration: {
        method: "whatsapp",
        value: "+972 50 000 0000",
        whatsappTemplate: "Hi {{teacher_name}}! {{class_name}} {{date}} {{start_time}}-{{end_time}}",
      },
    });
    const cta = buildRegistrationCta("Maya", c.title, c.metadata);
    expect(cta?.label).toBe("Join via WhatsApp");
    const text = decodeURIComponent(cta!.href.split("text=")[1]);
    expect(text).toBe("Hi Maya! Morning Slow Flow Tue 14 Oct 07:30-08:45");
  });

  it("falls back to the default template and custom labels", () => {
    const c = cls("a", {
      startDate: "2025-10-14",
      startTime: "07:30",
      registration: { method: "whatsapp", value: "972500000000", buttonLabel: "Save my mat" },
    });
    const cta = buildRegistrationCta("Maya", c.title, c.metadata)!;
    expect(cta.label).toBe("Save my mat");
    expect(decodeURIComponent(cta.href.split("text=")[1])).toBe(
      renderTemplate(DEFAULT_CLASS_WHATSAPP_TEMPLATE, {
        teacher_name: "Maya",
        class_name: "Morning Slow Flow",
        date: "Tue 14 Oct",
        start_time: "07:30",
      })
    );
  });
});

describe("links: safety", () => {
  it("only produces http(s) links from teacher input", () => {
    expect(safeHttpUrl("olivetree.studio")).toBe("https://olivetree.studio/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("ftp://x.com")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });

  it("handles instagram handles and emails", () => {
    expect(instagramUrl("@maya.breathes")).toBe("https://instagram.com/maya.breathes");
    expect(mailtoUrl("hello@maya.yoga", "Class", "Hi")).toBe("mailto:hello@maya.yoga?subject=Class&body=Hi");
    expect(mailtoUrl("not-an-email")).toBeNull();
  });

  it("returns no CTA for an unconfigured or invalid method", () => {
    const none = cls("a", { startDate: "2025-10-14", startTime: "07:30" });
    expect(buildRegistrationCta("Maya", none.title, none.metadata)).toBeNull();
    const bad = cls("b", { startDate: "2025-10-14", startTime: "07:30", registration: { method: "website", value: "javascript:x" } });
    expect(buildRegistrationCta("Maya", bad.title, bad.metadata)).toBeNull();
  });

  it("venue: only configured fields render, and nothing when disabled", () => {
    const c = cls("a", {
      startDate: "2025-10-14",
      startTime: "07:30",
      venue: { enabled: true, name: "Olive Tree", website: "olivetree.studio", instagram: "@olive" },
      registration: { method: "venueLink" },
    });
    expect(venueLinks(c.metadata.venue).map((l) => l.kind)).toEqual(["website", "instagram"]);
    expect(buildRegistrationCta("Maya", c.title, c.metadata)?.label).toBe("Book with Olive Tree");
    expect(venueLinks({ ...c.metadata.venue, enabled: false })).toEqual([]);
  });

  it("contact entries: enabled + valid only, in order", () => {
    const contact = parseTeachSetting("teachContact", {
      enabled: ["email", "whatsapp", "facebook"],
      methods: { whatsapp: "+972500000000", email: "hi@maya.yoga", facebook: "" },
    });
    expect(contactEntries(contact).map((e) => e.method)).toEqual(["email", "whatsapp"]);
  });

  it("availability CTAs reuse contact methods", () => {
    const contact = parseTeachSetting("teachContact", { methods: { whatsapp: "+972500000000" } });
    const meta = blankTeachMetadata("teachAvailability", "2025-10-14");
    const ctas = availabilityCtas("Maya", "2025-10-14", { ...meta, methods: ["whatsapp", "email"] }, contact);
    expect(ctas.map((c) => c.kind)).toEqual(["whatsapp"]);
    expect(decodeURIComponent(ctas[0].href)).toContain("private session on Tue 14 Oct between 10:00 and 13:00");
  });
});

describe("schedule", () => {
  const classes = [
    cls("late", { startDate: "2025-10-14", startTime: "18:30", endTime: "19:45" }),
    cls("early", { startDate: "2025-10-14", startTime: "07:30", endTime: "08:45" }),
    cls("next", { startDate: "2025-10-16", startTime: "09:00" }),
    cls("multi", { startDate: "2025-10-13", startTime: "10:00", endDate: "2025-10-15", endTime: "16:00" }),
  ];

  it("date helpers", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(weekdayOf("2025-10-14")).toBe(2);
  });

  it("classes on a date, sorted, including multi-day", () => {
    expect(classesOn(classes, "2025-10-14").map((c) => c.id)).toEqual(["early", "multi", "late"]);
    expect(classesOn(classes, "2025-10-17")).toEqual([]);
  });

  it("past detection uses end time in the space's clock", () => {
    expect(isClassPast(classes[1].metadata, "2025-10-14", "09:00")).toBe(true);
    expect(isClassPast(classes[0].metadata, "2025-10-14", "09:00")).toBe(false);
    expect(isClassPast(classes[3].metadata, "2025-10-14", "23:00")).toBe(false);
  });

  it("next upcoming class after today", () => {
    expect(nextUpcomingClass(classes, "2025-10-14")?.id).toBe("next");
  });

  it("availability: weekly vs once vs disabled", () => {
    const weekly = blankTeachMetadata("teachAvailability", "2025-10-14");
    expect(availabilityOccursOn(weekly, "2025-10-14")).toBe(true);
    expect(availabilityOccursOn(weekly, "2025-10-15")).toBe(false);
    expect(availabilityOccursOn({ ...weekly, repeat: "once", date: "2025-10-15" }, "2025-10-15")).toBe(true);
    expect(availabilityOccursOn({ ...weekly, enabled: false }, "2025-10-14")).toBe(false);
  });

  it("day strip counts", () => {
    const days = buildScheduleDays(classes, [], "2025-10-14", 3);
    expect(days.map((d) => d.classCount)).toEqual([3, 1, 1]);
  });

  it("durations and labels", () => {
    expect(durationMinutes(classes[1].metadata)).toBe(75);
    expect(durationMinutes(classes[3].metadata)).toBeNull();
    expect(formatDuration(1448)).toBe("24:08");
    expect(formatDuration(3700)).toBe("1:01:40");
    expect(formatDuration(null)).toBeNull();
    expect(teachingSinceLabel(2014, "2025-10-14")).toBe("Teaching since 2014 · 11 years");
    expect(teachingSinceLabel(null, "2025-10-14")).toBeNull();
  });
});

describe("schemas", () => {
  it("defaults for every settings key parse from empty", () => {
    const d = defaultTeachSettings();
    expect(d.teachStyle.preset).toBe("calm");
    expect(d.dailyInspiration.quotes).toEqual([]);
    expect(d.teachContact.enabled).toEqual([]);
  });

  it("tolerates garbage on read without throwing", () => {
    expect(parseTeachSetting("teachStyle", { corners: "zigzag", background: "red" }).corners).toBe("rounded");
    expect(parseTeachSetting("teachAbout", "nope").styles).toEqual([]);
    expect(parseTeachItems("teachClasses", [{ id: "x", title: "A", metadata: { startDate: "bad" } }])).toEqual([]);
  });

  it("write-side validation requires titles where needed and trims text", () => {
    const ok = teachItemFieldsSchema("teachReadings").safeParse({ title: "  Why we breathe ", subtitle: "  ", metadata: {} });
    expect(ok.success && ok.data.title).toBe("Why we breathe");
    expect(ok.success && ok.data.subtitle).toBeNull();
    expect(teachItemFieldsSchema("teachReadings").safeParse({ title: " ", metadata: {} }).success).toBe(false);
    expect(teachItemFieldsSchema("teachGallery").safeParse({ title: "", metadata: {} }).success).toBe(true);
  });

  it("media refs must stay inside the tenant's own prefix", () => {
    expect(isTenantMediaRef(TENANT, `${TENANT}/teachAbout/profile/draft.webp`)).toBe(true);
    expect(isTenantMediaRef(TENANT, `${TENANT}/teachAudioFile/${TENANT}/draft.mp3`)).toBe(true);
    expect(isTenantMediaRef(TENANT, `99999999-2222-3333-4444-555555555555/x/y/draft.webp`)).toBe(false);
    expect(isTenantMediaRef(TENANT, `${TENANT}/../x/draft.webp`)).toBe(false);
    expect(isTenantMediaRef(TENANT, `${TENANT}/x/y/published.webp`)).toBe(false);
  });

  it("collects image and audio refs anywhere", () => {
    expect(collectTeachMediaRefs({ a: { imageRef: "1" }, b: [{ metadata: { audioRef: "2" } }], c: { imageRef: null } })).toEqual(["1", "2"]);
  });
});

describe("shared media route refs", () => {
  it("collectMediaRefs adds audioRef without changing image behaviour", () => {
    const modules = { brand: { hero: { imageRef: "t/brand/hero/published.webp" } }, teach: { items: { teachAudio: [{ metadata: { audioRef: "t/a/b/published.mp3" } }] } } };
    expect([...collectImageRefs(modules)]).toEqual(["t/brand/hero/published.webp"]);
    expect([...collectMediaRefs(modules)].sort()).toEqual(["t/a/b/published.mp3", "t/brand/hero/published.webp"]);
    const flow = { facilitators: [{ imageRef: "x" }] };
    expect([...collectMediaRefs(flow)]).toEqual([...collectImageRefs(flow)]);
  });
});

describe("focal point", () => {
  it("clamps, nudges and renders", () => {
    expect(clampFocalPoint(-5, 130)).toEqual({ x: 0, y: 100 });
    expect(nudgeFocalPoint(null, "ArrowRight")).toEqual({ x: 55, y: 50 });
    expect(nudgeFocalPoint({ x: 0, y: 0 }, "ArrowUp")).toEqual({ x: 0, y: 0 });
    expect(nudgeFocalPoint(null, "Enter")).toBeNull();
    expect(focalPointToObjectPosition(null)).toBe("50% 50%");
    expect(focalPointToObjectPosition({ x: 62, y: 30 })).toBe("62% 30%");
  });

  it("malformed stored focal points degrade to center", () => {
    const item = parseTeachItem("teachReadings", { id: "r", title: "x", metadata: { imagePosition: { x: 500 } } });
    expect(item?.metadata.imagePosition).toBeNull();
  });
});

describe("daily inspiration", () => {
  it("custom list rotates by day of year, identical for everyone that day", () => {
    const q = ["a", "b", "c"];
    expect(getDailyQuoteFrom("2025-01-01", q)?.text).toBe("a");
    expect(getDailyQuoteFrom("2025-01-02", q)?.text).toBe("b");
    expect(getDailyQuoteFrom("2025-01-04", q)?.text).toBe("a");
  });

  it("falls back to the shared set only when allowed", () => {
    expect(getDailyQuoteFrom("2025-10-14", [])).toEqual(getDailyQuote("2025-10-14"));
    expect(getDailyQuoteFrom("2025-10-14", ["  "], false)).toBeNull();
  });
});

describe("presets & style", () => {
  it("every preset primary keeps white button text at WCAG AA", () => {
    for (const p of TEACH_PRESETS) {
      expect(contrastRatio(hexToRgb(p.primary), hexToRgb("#FFFFFF")), p.label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("style tokens are closed-set CSS values", () => {
    const vars = teachStyleVars(parseTeachSetting("teachStyle", { corners: "minimal", spacing: "airy" }));
    expect(vars["--tt-radius-card"]).toBe("6px");
    expect(vars["--tt-section-gap"]).toBe("40px");
  });
});

describe("published teach snapshot", () => {
  it("parses items/settings, drops disabled content and maps media to /api/media", () => {
    const data = parsePublishedTeachSpace({
      name: "Maya Levin",
      theme: {},
      timezone: "Asia/Jerusalem",
      enabled_modules: ["teachReadings", "faq", "customPages"],
      modules: {
        brand: { hero: { imageRef: `${TENANT}/brand/hero/published.webp` } },
        teach: {
          settings: { teachAbout: { profile: { imageRef: `${TENANT}/teachAbout/profile/published.webp` } } },
          items: {
            teachClasses: [{ id: "c1", title: "Flow", imageRef: `${TENANT}/teachClasses/c1/published.webp`, metadata: { startDate: "2025-10-14", startTime: "07:30" } }],
            teachAvailability: [{ id: "a1", title: "", metadata: { from: "10:00", to: "12:00", enabled: false } }],
            customPages: [
              { id: "p1", title: "On", metadata: { enabled: true } },
              { id: "p2", title: "Off", metadata: { enabled: false } },
            ],
          },
        },
      },
    });
    expect(data.enabledExplore).toEqual(["teachReadings", "customPages"]);
    expect(data.classes).toHaveLength(1);
    expect(data.availability).toHaveLength(0);
    expect(data.customPages.map((p) => p.id)).toEqual(["p1"]);
    expect(data.mediaUrls[`${TENANT}/brand/hero/published.webp`]).toBe(`/api/media/${TENANT}/brand/hero/published.webp`);
    expect(data.mediaUrls[`${TENANT}/teachAbout/profile/published.webp`]).toBeDefined();
    expect(data.mediaUrls[`${TENANT}/teachClasses/c1/published.webp`]).toBeDefined();
  });

  it("an empty or foreign snapshot still renders safely", () => {
    const data = parsePublishedTeachSpace({ name: "X", theme: null, timezone: null, enabled_modules: null, modules: null });
    expect(data.classes).toEqual([]);
    expect(data.timezone).toBe("UTC");
  });
});
