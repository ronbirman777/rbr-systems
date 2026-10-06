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
  // TASK 029 - the three new Explore covers, plus a reading cover and a
  // track's artwork so the "borrow the first item's photo" fallback is
  // exercised too.
  ["guidelines", "card-4.png"],
  ["readingsCover", "card-1.png"],
  ["audioCover", "card-2.png"],
  ["reading1", "card-3.png"],
  ["track1", "card-4.png"],
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

/**
 * The organizer-authored text, per locale.
 *
 * Real sentences in each language, not "lorem" and not the English
 * string repeated: the matrix is checking for overflow and clipping, and
 * German compounds are longer than English while Hebrew is shorter and
 * runs the other way. Using English everywhere would hide exactly the
 * defects this is looking for.
 *
 * This is USER content, so it is never translated by the app - it is
 * written per locale here only because a Space in German would have been
 * written in German by its organizer.
 */
const FLOW_TEXT = {
  en: {
    session: "Sunrise Movement", sound: "Sound Bath", shala: "Shala", garden: "Garden",
    bring: ["Mat", "Blanket"], expect: ["Barefoot", "Outdoors if dry"],
    breakfast: "Breakfast", mealBody: "Fruit, porridge, eggs.", terrace: "Terrace",
    mealsIntro: "Everything is cooked that morning, and almost all of it is vegetarian.",
    massage: "Massage Treatments", massageShort: "Deep tissue and Thai",
    massageLong: "Ninety minutes with Noi, in the spa hut at the end of the garden path.",
    spa: "Spa hut", booking: "Ask at reception", availability: "Subject to availability",
    pool: "Spring Pool", poolShort: "Spring fed, always 18 degrees",
    poolLong: "The pool is fed by the hillside spring and is never heated. Towels are in the changing hut.",
    lowerTerrace: "Lower terrace", noDiving: "No diving",
    legacyWelcome: "We are glad you are coming. Check in from 15:00.",
    legacyBring: "A towel\nWater bottle\nShoes you can walk in",
    faqQ: "Is there wifi?", faqA: "In the lounge only.",
    tagline: "Seven days of coming back to yourself",
    shortDescription: "A small, quiet retreat in the Black Forest, for twelve people at a time.",
    longDescription: "Return to Balance is seven days of movement, silence and long meals. Mornings are early and the afternoons are yours.",
    expectRetreat: ["Early mornings", "Long silences", "No phones in sessions"],
    quietHours: "Quiet hours", quietHoursBody: "22:00 to 07:00, everywhere on the grounds.",
    phones: "Phones", phonesBody: "Please keep them in your room during sessions.",
    readingTitle: "On arriving", readingCategory: "Before you come",
    readingExcerpt: "Landing takes a day.",
    readingBody: "Landing takes a day. Expect to feel busy for the first evening, and let that be fine. " .repeat(6),
    readingTitle2: "On leaving", readingCategory2: "After",
    trackTitle: "Evening Nidra", trackCategory: "Evening",
    trackNote: "Lie down somewhere warm before you press play.",
    trackBody: "A slow landing, for the first night.",
  },
  he: {
    session: "תנועת זריחה", sound: "אמבט צלילים", shala: "שאלה", garden: "הגן",
    bring: ["מזרן", "שמיכה"], expect: ["ברגליים חשופות", "בחוץ אם יבש"],
    breakfast: "ארוחת בוקר", mealBody: "פירות, דייסה, ביצים.", terrace: "המרפסת",
    mealsIntro: "הכול מבושל באותו בוקר, וכמעט הכול צמחוני.",
    massage: "טיפולי מסאז׳", massageShort: "רקמות עמוקות ותאילנדי",
    massageLong: "תשעים דקות עם נוי, בבקתת הספא בקצה שביל הגן.",
    spa: "בקתת ספא", booking: "לשאול בקבלה", availability: "בכפוף לזמינות",
    pool: "בריכת המעיין", poolShort: "מי מעיין, תמיד 18 מעלות",
    poolLong: "הבריכה מוזנת ממעיין הגבעה ואינה מחוממת. מגבות נמצאות בבקתת ההחלפה.",
    lowerTerrace: "המרפסת התחתונה", noDiving: "אין לצלול",
    legacyWelcome: "אנחנו שמחים שאתם באים. הצ׳ק-אין מ-15:00.",
    legacyBring: "מגבת\nבקבוק מים\nנעליים נוחות להליכה",
    faqQ: "יש אינטרנט?", faqA: "בלובי בלבד.",
    tagline: "שבעה ימים של חזרה אל עצמך",
    shortDescription: "ריטריט קטן ושקט ביער השחור, לשנים־עשר אנשים בכל פעם.",
    longDescription: "חזרה לאיזון היא שבעה ימים של תנועה, שתיקה וארוחות ארוכות. הבקרים מוקדמים ואחר הצהריים שלכם.",
    expectRetreat: ["בקרים מוקדמים", "שתיקות ארוכות", "בלי טלפונים במפגשים"],
    quietHours: "שעות שקט", quietHoursBody: "מ-22:00 עד 07:00, בכל שטח המקום.",
    phones: "טלפונים", phonesBody: "אנא השאירו אותם בחדר במהלך המפגשים.",
    readingTitle: "על ההגעה", readingCategory: "לפני שבאים",
    readingExcerpt: "ההתאקלמות לוקחת יום.",
    readingBody: "ההתאקלמות לוקחת יום. אפשר להרגיש עסוקים בערב הראשון, וזה בסדר גמור. " .repeat(6),
    readingTitle2: "על העזיבה", readingCategory2: "אחרי",
    trackTitle: "נידרה של ערב", trackCategory: "ערב",
    trackNote: "שכבו במקום חמים לפני שמתחילים.",
    trackBody: "נחיתה איטית, ללילה הראשון.",
  },
  de: {
    session: "Sonnenaufgangsbewegung", sound: "Klangbad", shala: "Shala", garden: "Garten",
    bring: ["Matte", "Decke"], expect: ["Barfuß", "Draußen, wenn es trocken ist"],
    breakfast: "Frühstück", mealBody: "Obst, Porridge, Eier.", terrace: "Terrasse",
    mealsIntro: "Alles wird am selben Morgen gekocht, und fast alles ist vegetarisch.",
    massage: "Massagebehandlungen", massageShort: "Tiefengewebe und Thai",
    massageLong: "Neunzig Minuten mit Noi, in der Spa-Hütte am Ende des Gartenwegs.",
    spa: "Spa-Hütte", booking: "An der Rezeption fragen", availability: "Nach Verfügbarkeit",
    pool: "Quellbecken", poolShort: "Quellgespeist, immer 18 Grad",
    poolLong: "Das Becken wird von der Hangquelle gespeist und nie geheizt. Handtücher liegen in der Umkleidehütte.",
    lowerTerrace: "Untere Terrasse", noDiving: "Springen verboten",
    legacyWelcome: "Wir freuen uns, dass du kommst. Check-in ab 15:00.",
    legacyBring: "Ein Handtuch\nTrinkflasche\nSchuhe zum Wandern",
    faqQ: "Gibt es WLAN?", faqA: "Nur in der Lounge.",
    tagline: "Sieben Tage zurück zu dir selbst",
    shortDescription: "Ein kleines, stilles Retreat im Schwarzwald, für zwölf Menschen auf einmal.",
    longDescription: "Return to Balance sind sieben Tage Bewegung, Stille und lange Mahlzeiten. Die Morgen sind früh, die Nachmittage gehören dir.",
    expectRetreat: ["Frühe Morgen", "Lange Stille", "Keine Handys in den Sessions"],
    quietHours: "Ruhezeiten", quietHoursBody: "22:00 bis 07:00, auf dem ganzen Gelände.",
    phones: "Handys", phonesBody: "Bitte lass sie während der Sessions im Zimmer.",
    readingTitle: "Über das Ankommen", readingCategory: "Vor der Anreise",
    readingExcerpt: "Ankommen dauert einen Tag.",
    readingBody: "Ankommen dauert einen Tag. Rechne damit, am ersten Abend noch geschäftig zu sein, und lass das in Ordnung sein. " .repeat(6),
    readingTitle2: "Über das Gehen", readingCategory2: "Danach",
    trackTitle: "Abend-Nidra", trackCategory: "Abend",
    trackNote: "Leg dich an einen warmen Ort, bevor du startest.",
    trackBody: "Eine langsame Landung, für die erste Nacht.",
  },
} as const;

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
      // TASK 029
      "guidelines", "readings", "audio",
    ],
    // TASK 029: one activity WITH extra details and one without, so the
    // matrix sees both the disclosure and its absence.
    schedule: [
      {
        date: "2026-10-05", startTime: "07:00", endTime: "08:15", title: FLOW_TEXT[locale].session,
        facilitator: "Ana", location: FLOW_TEXT[locale].shala, description: null, category: "yoga",
        whatToBring: FLOW_TEXT[locale].bring, whatToExpect: FLOW_TEXT[locale].expect,
      },
      {
        date: "2026-10-05", startTime: "19:30", endTime: null, title: FLOW_TEXT[locale].sound,
        facilitator: null, location: FLOW_TEXT[locale].garden, description: null, category: "sound",
        whatToBring: [], whatToExpect: [],
      },
    ],
    facilitators: [person("f1", "Ana", "ana"), person("f2", "Ben", "ben"), person("f3", "Cleo", "cleo")],
    meals: [
      {
        name: FLOW_TEXT[locale].breakfast, mealType: "breakfast", startTime: "08:30", endTime: "09:30",
        description: FLOW_TEXT[locale].mealBody, imageRef: null, imageUrl: url("meals", "card-1.png"),
        dietaryTags: ["vegan"], location: FLOW_TEXT[locale].terrace, imagePosition: null,
      },
    ],
    treatments: [
      {
        name: FLOW_TEXT[locale].massage, shortDescription: FLOW_TEXT[locale].massageShort,
        description: FLOW_TEXT[locale].massageLong, durationMinutes: 90, imageRef: null,
        imageUrl: url("treatments", "card-2.png"), provider: "Noi", location: FLOW_TEXT[locale].spa,
        bookingInfo: FLOW_TEXT[locale].booking, imagePosition: null,
        // TASK 029 (D1)
        price: 700, currency: "THB", chargeType: "additional", availability: FLOW_TEXT[locale].availability,
      },
    ],
    facilities: [
      {
        name: FLOW_TEXT[locale].pool,
        // TASK 029 (D4) - both descriptions, so the card line and the
        // expandable long text are both on screen.
        shortDescription: FLOW_TEXT[locale].poolShort,
        description: FLOW_TEXT[locale].poolLong,
        imageRef: null, imageUrl: url("facilities", "card-3.png"),
        openingHours: "07:00-20:00", location: FLOW_TEXT[locale].lowerTerrace,
        importantInfo: FLOW_TEXT[locale].noDiving, imagePosition: null,
      },
    ],
    // TASK 029 (D3): the LEGACY values are populated and the canonical
    // ones are not, so the matrix renders the fallback path.
    arrivalInfo: {
      welcomeMessage: FLOW_TEXT[locale].legacyWelcome,
      checkInTime: "15:00", checkOutTime: "11:00", address: "1 Pine Way", mapUrl: null,
      transportationInfo: null, arrivalInstructions: null,
      whatToBring: FLOW_TEXT[locale].legacyBring,
      importantNotes: null, contactName: null, contactPhone: null, contactWhatsapp: null,
    },
    faq: [{ question: FLOW_TEXT[locale].faqQ, answer: FLOW_TEXT[locale].faqA }],
    customPages: [{ title: "House rules", body: "Quiet after 10pm.", imageUrl: url("flowpage", "card-3.png"), imagePosition: null }],
    stayConnected: { links: [{ label: "Site", url: "https://example.com" }] },
    // TASK 029 - the retreat's own description. `whatToBring` and
    // `welcome` are deliberately LEFT EMPTY here: GuestApp resolves
    // D3's precedence, so what the matrix renders is the legacy Arrival
    // value above, through the real code path.
    retreatProfile: {
      tagline: FLOW_TEXT[locale].tagline,
      shortDescription: FLOW_TEXT[locale].shortDescription,
      longDescription: FLOW_TEXT[locale].longDescription,
      welcome: null,
      whatToBring: [],
      whatToExpect: FLOW_TEXT[locale].expectRetreat,
    },
    moduleIntros: { meals: { intro: FLOW_TEXT[locale].mealsIntro } },
    guidelines: [
      { title: FLOW_TEXT[locale].quietHours, description: FLOW_TEXT[locale].quietHoursBody },
      { title: FLOW_TEXT[locale].phones, description: FLOW_TEXT[locale].phonesBody },
    ],
    readings: [
      {
        id: "fr1", title: FLOW_TEXT[locale].readingTitle, subtitle: null,
        description: FLOW_TEXT[locale].readingBody, imageRef: null,
        imageUrl: url("reading1", "card-3.png"), externalLink: null,
        metadata: {
          excerpt: FLOW_TEXT[locale].readingExcerpt, category: FLOW_TEXT[locale].readingCategory,
          author: "Lena Hoffmann", date: "2026-09-20", imagePosition: null,
        },
      },
      {
        id: "fr2", title: FLOW_TEXT[locale].readingTitle2, subtitle: null, description: null,
        imageRef: null, imageUrl: null, externalLink: "https://example.com/essay",
        metadata: { excerpt: null, category: FLOW_TEXT[locale].readingCategory2, author: null, date: "2026-08-01", imagePosition: null },
      },
    ],
    audio: [
      {
        id: "fa1", title: FLOW_TEXT[locale].trackTitle, subtitle: null,
        description: FLOW_TEXT[locale].trackBody, imageRef: null,
        imageUrl: url("track1", "card-4.png"), externalLink: null,
        audioUrl: `/api/media/${T}/audioFile/fa1/up-fa1/published.mp3`,
        metadata: {
          audioRef: `${T}/audioFile/fa1/up-fa1/published.mp3`, durationSeconds: 1448,
          category: FLOW_TEXT[locale].trackCategory, note: FLOW_TEXT[locale].trackNote, imagePosition: null,
        },
      },
    ],
    moduleCoverImages: {
      meals: { imageUrl: url("meals", "card-1.png"), imagePosition: null },
      treatments: { imageUrl: url("treatments", "card-2.png"), imagePosition: null },
      facilities: { imageUrl: url("facilities", "card-3.png"), imagePosition: null },
      arrivalInfo: { imageUrl: url("arrival", "card-4.png"), imagePosition: null },
      faq: { imageUrl: url("faq", "card-1.png"), imagePosition: null },
      stayConnected: { imageUrl: url("stay", "card-2.png"), imagePosition: null },
      // TASK 029 - guidelines has a cover of its own; readings and audio
      // deliberately have NONE, so the matrix exercises the "borrow the
      // first item's own photo" fallback those two have.
      guidelines: { imageUrl: url("guidelines", "card-4.png"), imagePosition: null },
    },
    locale,
  } as unknown as GuestAppProps;
}
