import { describe, expect, it } from "vitest";
import {
  buildSpaceSocialIdentity,
  concisePreviewText,
  socialTitle,
  versionFromPublishedAt,
  type SocialSpaceRow,
} from "./spaceSocial";
import { spaceMetadata } from "./socialMetadata";
import { normalizeWhatsAppNumber, shareSpaceMessage, whatsappShareUrl, whatsappUrl } from "./whatsapp";
import { shareFileName } from "./qr";
import { buildGuestSpaceUrl } from "@/lib/guestSpaceUrl";
import { classQrImagePath, shareCardImagePath, shareOnWhatsAppUrl } from "@/lib/studio/publicLink";
import { buildRegistrationCta } from "@/lib/teach/links";
import { parseTeachItems } from "@/lib/teach/schemas";
import type { SocialSpace } from "./publishedSocialSpace";

const TENANT = "a0000000-1111-4222-8333-444444444444";
const ref = (m: string) => `${TENANT}/${m}/abc/published.webp`;

const PUBLISHED: SocialSpaceRow = {
  product_type: "teach",
  name: "Lena Hoffmann",
  slug: "teacherexample",
  published_at: "2026-10-04T11:19:16.606776+00:00",
  theme: { palette: "forest-sage", atmosphere: "calm-organic" },
  modules: {
    brand: { hero: { imageRef: ref("brand/hero") } },
    teach: {
      settings: {
        teachProfile: {
          teacherType: "Yoga & Breathwork Educator",
          locationLine: "Ubud, Bali, Indonesia",
          heroImagePosition: { x: 10, y: 20 },
        },
        teachAbout: {
          about: "Lena is a certified yoga teacher. She trained in Europe and Asia. A third sentence that runs on well past the limit so truncation has something to bite on, padded out further and further.",
          profile: { imageRef: ref("teachAbout/profile"), imagePosition: { x: 72, y: 52 } },
        },
        teachContact: { intro: "Reach out any time.", locationName: "Bali & Online" },
      },
      items: {},
    },
  },
};

function space(partial: Partial<SocialSpace> = {}, row: SocialSpaceRow = PUBLISHED): SocialSpace {
  const identity = buildSpaceSocialIdentity(row)!;
  return {
    tenantId: TENANT,
    slug: row.slug,
    identity,
    access: "granted",
    modules: row.modules,
    row: row as never,
    ...partial,
  };
}

describe("social identity is built only from published data", () => {
  it("maps a Teach snapshot to name + role + location + portrait", () => {
    const id = buildSpaceSocialIdentity(PUBLISHED)!;
    expect(id.name).toBe("Lena Hoffmann");
    expect(id.role).toBe("Yoga & Breathwork Educator");
    expect(id.location).toBe("Ubud, Bali, Indonesia");
    expect(socialTitle(id)).toBe("Lena Hoffmann — Yoga & Breathwork Educator");
  });

  it("prefers the teacher's own portrait and its focal point over the Home hero", () => {
    const id = buildSpaceSocialIdentity(PUBLISHED)!;
    expect(id.imageRef).toBe(ref("teachAbout/profile"));
    expect(id.imagePosition).toEqual({ x: 72, y: 52 });
  });

  it("falls back to the published hero when there is no portrait", () => {
    const row = structuredClone(PUBLISHED) as SocialSpaceRow;
    // @ts-expect-error - narrowing a deliberately loose fixture
    row.modules.teach.settings.teachAbout.profile = { imageRef: null };
    const id = buildSpaceSocialIdentity(row)!;
    expect(id.imageRef).toBe(ref("brand/hero"));
    expect(id.imagePosition).toEqual({ x: 10, y: 20 });
  });

  it("never uses a draft media path", () => {
    const id = buildSpaceSocialIdentity(PUBLISHED)!;
    expect(id.imageRef).toContain("/published.");
    expect(id.imageRef).not.toContain("/draft.");
  });

  it("ignores private Studio settings that are not in the published payload", () => {
    const row = structuredClone(PUBLISHED) as SocialSpaceRow;
    // teachDirectory (the InnerDweS listing opt-in) lives in module_settings
    // and must never reach a public preview even if it appeared here.
    // @ts-expect-error - deliberately injecting a key that must be ignored
    row.modules.teach.settings.teachDirectory = { listed: true };
    const id = buildSpaceSocialIdentity(row)!;
    expect(JSON.stringify(id)).not.toContain("teachDirectory");
    expect(JSON.stringify(id)).not.toContain("listed");
  });

  it("returns nothing for a product with no guest app", () => {
    expect(buildSpaceSocialIdentity({ ...PUBLISHED, product_type: "client_hub" })).toBeNull();
    expect(buildSpaceSocialIdentity({ ...PUBLISHED, product_type: "nonsense" })).toBeNull();
  });

  it("gives a non-Teach guest product a name-only identity rather than Teach copy", () => {
    const id = buildSpaceSocialIdentity({ ...PUBLISHED, product_type: "retreat" })!;
    expect(id.name).toBe("Lena Hoffmann");
    expect(id.role).toBeNull();
    expect(id.imageRef).toBe(ref("brand/hero"));
  });
});

describe("preview description", () => {
  it("trims to a whole sentence inside the limit", () => {
    const id = buildSpaceSocialIdentity(PUBLISHED)!;
    expect(id.description.length).toBeLessThanOrEqual(201);
    expect(id.description.startsWith("Lena is a certified yoga teacher.")).toBe(true);
  });

  it("keeps short text untouched and never cuts mid-word without a marker", () => {
    expect(concisePreviewText("Short and complete.")).toBe("Short and complete.");
    expect(concisePreviewText("")).toBe("");
    const long = concisePreviewText("x".repeat(400));
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(202);
  });
});

describe("OG image version", () => {
  it("is stable for one snapshot and changes when the Space is republished", () => {
    const a = versionFromPublishedAt("2026-10-04T11:19:16.606776+00:00");
    expect(a).toBe(versionFromPublishedAt("2026-10-04T11:19:16.606776+00:00"));
    expect(a).not.toBe(versionFromPublishedAt("2026-10-04T11:19:17.606776+00:00"));
    expect(a).toHaveLength(8);
    expect(a).toMatch(/^[a-z0-9]{8}$/);
  });
});

describe("Open Graph metadata", () => {
  it("publishes title, description, canonical and og:url on the public guest origin", () => {
    const m = spaceMetadata(space(), "/s/teacherexample");
    expect(m.title).toBe("Lena Hoffmann — Yoga & Breathwork Educator");
    expect(m.alternates?.canonical).toBe(`${buildGuestSpaceUrl(TENANT, "teacherexample")}`);
    expect(String(m.alternates?.canonical)).toMatch(/^https?:\/\//);
    expect(m.openGraph?.url).toBe(m.alternates?.canonical);
    expect((m.openGraph as { siteName?: string })?.siteName).toBe("InnerDweS");
    expect((m.twitter as { card?: string })?.card).toBe("summary_large_image");
  });

  it("sets an absolute, publish-versioned og:image with explicit dimensions", () => {
    const m = spaceMetadata(space(), "/s/teacherexample");
    const images = (m.openGraph as { images?: { url: string; width: number; height: number; alt: string }[] }).images!;
    expect(images).toHaveLength(1);
    const [img] = images;
    expect(img.url).toMatch(/^https?:\/\//);
    expect(img.url).toContain("/s/teacherexample/social/");
    expect(img.url.endsWith(versionFromPublishedAt(PUBLISHED.published_at))).toBe(true);
    expect(img.width).toBe(1200);
    expect(img.height).toBe(1200);
    expect(img.alt).toBe("Lena Hoffmann — Yoga & Breathwork Educator");
    // Twitter reuses the same generated card rather than a second route.
    expect((m.twitter as { images?: unknown[] }).images).toEqual(images);
  });

  it("mints a different og:image URL after a republish, so WhatsApp refetches", () => {
    const before = spaceMetadata(space(), "/s/teacherexample");
    const republished = { ...PUBLISHED, published_at: "2026-11-01T08:00:00+00:00" };
    const after = spaceMetadata(space({}, republished), "/s/teacherexample");
    const url = (m: typeof before) => (m.openGraph as { images?: { url: string }[] }).images![0].url;
    expect(url(before)).not.toBe(url(after));
  });

  it("reduces a code-protected Space to its name and marks it noindex", () => {
    const m = spaceMetadata(space({ access: "code-required" }), "/s/teacherexample");
    expect(m.title).toBe("Lena Hoffmann");
    expect(JSON.stringify(m)).not.toContain("Yoga & Breathwork Educator");
    expect(JSON.stringify(m)).not.toContain("certified yoga teacher");
    expect((m.robots as { index?: boolean })?.index).toBe(false);
  });

  it("publishes nothing at all for an unavailable or missing Space", () => {
    for (const m of [spaceMetadata(space({ access: "unavailable" }), "/s/x"), spaceMetadata(null, "/s/x")]) {
      expect(m.title).toBeUndefined();
      expect(m.openGraph).toBeUndefined();
    }
  });
});

describe("public share URLs carry no credentials", () => {
  it("the generated preview image URL carries no credentials either", () => {
    const img = (spaceMetadata(space(), "/s/teacherexample").openGraph as { images?: { url: string }[] }).images![0].url;
    expect(new URL(img).search).toBe("");
    for (const secret of ["token", "key", "jwt", "apikey", "signature", "supabase"]) {
      expect(img.toLowerCase()).not.toContain(secret);
    }
  });

  it("the main QR target is the plain public Guest App address", () => {
    const url = buildGuestSpaceUrl(TENANT, "teacherexample");
    expect(url.endsWith("/s/teacherexample")).toBe(true);
    expect(new URL(url).search).toBe("");
    for (const secret of ["token", "access", "key", "jwt", "apikey", "code", "sb-", "supabase"]) {
      expect(url.toLowerCase()).not.toContain(secret);
    }
  });

  it("falls back to the id address only when no slug is reserved", () => {
    expect(buildGuestSpaceUrl(TENANT, null).endsWith(`/g/${TENANT}`)).toBe(true);
  });

  it("organizer-only image endpoints are same-origin paths, not signed URLs", () => {
    expect(shareCardImagePath(TENANT)).toBe(`/api/share-card/${TENANT}`);
    expect(classQrImagePath(TENANT, "class-1")).toBe(`/api/qr/${TENANT}?class=class-1`);
    expect(classQrImagePath(TENANT, "a/b?c=d")).toBe(`/api/qr/${TENANT}?class=a%2Fb%3Fc%3Dd`);
  });

  it("names downloads after the slug", () => {
    expect(shareFileName("teacherexample", "qr")).toBe("teacherexample-qr.png");
    expect(shareFileName(null, "share-card")).toBe("space-share-card.png");
  });
});

describe("WhatsApp share", () => {
  it("builds a recipient-less share link with the text percent-encoded", () => {
    const url = shareOnWhatsAppUrl("Lena Hoffmann", "Yoga & Breathwork Educator", "https://innerdwes.com/s/teacherexample")!;
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(url).not.toMatch(/wa\.me\/\d/);
    const text = new URL(url).searchParams.get("text")!;
    expect(text).toBe("Lena Hoffmann - Yoga & Breathwork Educator\nhttps://innerdwes.com/s/teacherexample");
    expect(url).toContain("%0A");
    expect(url).toContain("%26");
  });

  it("omits the role when the Space has none", () => {
    expect(shareSpaceMessage({ name: "Olive Tree", url: "https://x.test/s/olive" })).toBe("Olive Tree\nhttps://x.test/s/olive");
  });

  it("rejects numbers that are not valid public E.164 values", () => {
    expect(normalizeWhatsAppNumber("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("0062812345678")).toBe("62812345678");
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
    expect(whatsappUrl("12345", "hi")).toBeNull();
    expect(whatsappShareUrl("   ")).toBeNull();
  });
});

describe("class registration WhatsApp link", () => {
  const classRow = (registration: Record<string, unknown>) => ({
    id: "c1",
    title: "Morning Vinyasa Flow",
    metadata: {
      startDate: "2026-10-05",
      startTime: "07:00",
      endTime: "08:30",
      location: "The Bamboo Shala",
      registration,
    },
  });
  const parse = (registration: Record<string, unknown>) => parseTeachItems("teachClasses", [classRow(registration)])[0];

  it("opens a prefilled chat with the configured public number and carries the Space URL", () => {
    const item = parse({ method: "whatsapp", value: "+62 812 3456 7890" });
    const cta = buildRegistrationCta("Lena", item.title, item.metadata, "https://innerdwes.com/s/teacherexample")!;
    expect(cta.href.startsWith("https://wa.me/6281234567890?text=")).toBe(true);

    const text = new URL(cta.href).searchParams.get("text")!;
    expect(text).toContain("Hi Lena");
    expect(text).toContain("Morning Vinyasa Flow");
    expect(text).toContain("Mon 5 Oct");
    expect(text).toContain("07:00");
    expect(text).toContain("Could you please confirm availability?");
    expect(text).toContain("https://innerdwes.com/s/teacherexample");
    // Encoded, not raw - a space or & in a class name must never split the URL.
    expect(cta.href).toContain("%20");
    expect(cta.href).not.toContain(" ");
  });

  it("omits the Space URL when the caller has none, leaving a clean message", () => {
    const item = parse({ method: "whatsapp", value: "+62 812 3456 7890" });
    const text = new URL(buildRegistrationCta("Lena", item.title, item.metadata)!.href).searchParams.get("text")!;
    expect(text.endsWith("Could you please confirm availability?")).toBe(true);
    expect(text).not.toContain("http");
  });

  it("never invents a WhatsApp link for another registration method", () => {
    for (const registration of [
      { method: "website", value: "https://innerdwes.com/" },
      { method: "instagram", value: "https://www.instagram.com/innerdwes" },
      { method: "email", value: "hello@example.test" },
    ]) {
      const item = parse(registration);
      const cta = buildRegistrationCta("Lena", item.title, item.metadata, "https://innerdwes.com/s/teacherexample");
      expect(cta?.href.startsWith("https://wa.me/")).toBeFalsy();
    }
  });

  it("produces no link at all when the number is missing or invalid", () => {
    for (const registration of [{ method: "whatsapp", value: null }, { method: "whatsapp", value: "123" }]) {
      const item = parse(registration);
      expect(buildRegistrationCta("Lena", item.title, item.metadata, "https://x.test/s/y")).toBeNull();
    }
  });
});
