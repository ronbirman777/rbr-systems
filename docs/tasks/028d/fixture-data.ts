/**
 * One Space, described once, used by both the server render and the
 * client bundle - so the fixture's HTML and its prefetch inventory
 * cannot describe different Spaces.
 *
 * Deliberately image-heavy, because that is the case CP4 is about: a
 * hero, a nav avatar, two Home cards, a Team of three, and an Explore
 * with every module covered.
 */
import { parsePublishedTeachSpace, type TeachGuestData } from "@/lib/teach/guestData";
import { brandConfigSchema } from "@/lib/theme/tokens";
import type { GuestAppProps } from "@/components/guest-app";

const T = "11111111-1111-4111-8111-111111111111";
export const ref = (slot: string, file: string) => `${T}/teach/${slot}/up-${slot}/published.${file}`;
export const url = (slot: string, file: string) => `/api/media/${ref(slot, file)}`;

const MEDIA: [string, string][] = [
  ["hero", "hero.png"],
  ["avatar", "profile.png"],
  ["portrait", "profile.png"],
  ["readings", "card-1.png"],
  ["audio", "card-2.png"],
  ["contact", "card-3.png"],
  ["page1", "card-4.png"],
  ["latestReading", "card-1.png"],
  ["latestAudio", "card-2.png"],
  ["ana", "profile.png"],
  ["ben", "profile.png"],
  ["cleo", "profile.png"],
  ["meals", "card-1.png"],
  ["treatments", "card-2.png"],
  ["facilities", "card-3.png"],
  ["arrival", "card-4.png"],
  ["faq", "card-1.png"],
  ["stay", "card-2.png"],
  ["flowpage", "card-3.png"],
];

export function teachFixture(locale: "en" | "he" | "de" = "en"): TeachGuestData {
  const data = parsePublishedTeachSpace({
    name: "Lena Hoffmann",
    theme: null,
    timezone: "Europe/Berlin",
    enabled_modules: ["teachReadings", "teachAudio", "teachContact", "customPages"],
    modules: {
      spaceSettings: { locale },
      // The hero lives on the shared brand module, not on teachProfile.
      brand: { hero: { imageRef: ref("hero", "hero.png") } },
      teach: {
        settings: {
          teachProfile: { heroImageRef: ref("hero", "hero.png"), headline: "Breath, slowly" },
          teachAbout: { showTab: true, about: "I teach slow, breath-led movement.", profile: { imageRef: ref("portrait", "profile.png") } },
          teachContact: { email: "lena@example.com" },
          teachExplore: {
            cards: {
              teachReadings: { imageRef: ref("readings", "card-1.png") },
              teachAudio: { imageRef: ref("audio", "card-2.png") },
              teachContact: { imageRef: ref("contact", "card-3.png") },
            },
          },
        },
        items: {
          teachReadings: [
            { id: "r1", title: "On stillness", imageRef: ref("latestReading", "card-1.png"), metadata: { excerpt: "A short note." } },
          ],
          teachAudio: [
            { id: "a1", title: "Yoga Nidra", imageRef: ref("latestAudio", "card-2.png"), metadata: { audioRef: `${T}/teach/a1/up-a1/published.mp3` } },
          ],
          customPages: [{ id: "p1", title: "Studio", imageRef: ref("page1", "card-4.png"), metadata: { enabled: true } }],
        },
      },
    },
  });
  for (const [slot, file] of MEDIA) data.mediaUrls[ref(slot, file)] = url(slot, file);
  return data;
}

const brand = brandConfigSchema.parse({
  name: "Samadhi",
  logoRef: null,
  palette: "forest-sage",
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic",
});

const person = (id: string, name: string, slot: string) => ({
  id,
  name,
  role: "Facilitator",
  bio: "Teaches breath and stillness.",
  specialties: ["Breath"],
  socialLinks: [],
  imageUrl: url(slot, "profile.png"),
  imagePosition: null,
});

export function flowFixture(locale: "en" | "he" | "de" = "en"): GuestAppProps {
  return {
    tenantName: "Samadhi",
    brand,
    heroImageUrl: url("hero", "hero.png"),
    logoUrl: null,
    todayIso: "2026-10-05",
    nowTime: "09:00",
    enabledModules: [
      "schedule", "facilitators", "meals", "treatments", "facilities",
      "arrivalInfo", "faq", "stayConnected", "customPages",
    ],
    schedule: [],
    facilitators: [person("f1", "Ana", "ana"), person("f2", "Ben", "ben"), person("f3", "Cleo", "cleo")],
    meals: [],
    treatments: [],
    facilities: [],
    arrivalInfo: { address: "1 Pine Way", directions: null, parking: null, checkIn: null, checkOut: null, whatToBring: null },
    faq: [{ question: "When?", answer: "Soon." }],
    customPages: [{ title: "House rules", body: "Quiet after 10pm.", imageUrl: url("flowpage", "card-3.png"), imagePosition: null }],
    stayConnected: { links: [{ label: "Site", url: "https://example.com" }] },
    moduleCoverImages: {
      meals: { imageUrl: url("meals", "card-1.png"), imagePosition: null },
      treatments: { imageUrl: url("treatments", "card-2.png"), imagePosition: null },
      facilities: { imageUrl: url("facilities", "card-3.png"), imagePosition: null },
      arrivalInfo: { imageUrl: url("arrival", "card-4.png"), imagePosition: null },
      faq: { imageUrl: url("faq", "card-1.png"), imagePosition: null },
      stayConnected: { imageUrl: url("stay", "card-2.png"), imagePosition: null },
    },
    locale,
  } as unknown as GuestAppProps;
}
