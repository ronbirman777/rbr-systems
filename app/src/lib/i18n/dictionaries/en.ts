/**
 * English is the source dictionary and the canonical fallback.
 *
 * It is also the TYPE: every other locale is checked against this shape,
 * so a missing or misspelled key in Hebrew or German is a compile error
 * rather than something a guest discovers. Keys are namespaced by the
 * surface that owns them:
 *
 *   common  shared platform UI - used by both products and by any future
 *           product (Time to Heal) without change
 *   teach   Time to Teach only
 *   flow    Time to Flow only
 *
 * A new product adds its own namespace beside these; it never edits them.
 *
 * Only system-authored UI text lives here. Nothing an organizer typed is
 * ever a translation key - see the i18n README rule on user content.
 */
export const en = {
  common: {
    // Actions
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    next: "Next",
    previous: "Previous",
    retry: "Try again",
    copy: "Copy link",
    copied: "Copied",
    download: "Download",
    open: "Open",
    search: "Search",

    // Status
    loading: "Loading…",
    error: "Something went wrong.",
    required: "Required",
    optional: "Optional",
    none: "None",

    // Language / region
    language: "Language",
    languageHelp: "The language your Space is shown in. It does not change anything you have written.",
    country: "Country",
    countryHelp: "Used to suggest a phone country and a language. It never changes what you have already saved.",
    recommended: "Recommended",
    allLanguages: "All languages",
  },

  teach: {
    // Guest navigation
    navHome: "Home",
    navSchedule: "Schedule",
    navAbout: "About Me",
    navExplore: "Explore",

    // Guest home
    todaysClasses: "Today’s classes",
    noClassesToday: "No classes today",
    nextClass: "Next",
    seeFullSchedule: "See full schedule",
    seeTheSchedule: "See the schedule",
    getInTouch: "Get in touch",
    todaysInspiration: "Today’s inspiration",
    fromTeacher: "From {name}",

    // Explore
    exploreReadings: "My Readings",
    exploreAudio: "My Audio",
    exploreContact: "Get in touch",
    exploreHeading: "Explore",
    moreFrom: "More from {name}",
    exploreEmpty: "More coming soon",
    exploreEmptyBody: "Readings, audio and pages will appear here.",
    contactCardTitle: "Contact",
    contactCardSubtitle: "How to reach me",
    readingsEyebrow: "Reflections & articles",
    audioEyebrow: "Practices to listen to",
    noReadings: "No readings yet",
    noReadingsBody: "Written reflections will appear here.",
    noAudio: "No audio yet",
    noAudioBody: "Guided practices will appear here.",

    // Schedule
    chooseDay: "Choose a day",
    noClassesOnDay: "No classes on this day",
    privateSessions: "Private sessions",
    allLevels: "All levels",

    // Contact
    howToContact: "How to contact me",
    letsConnect: "Let’s connect",
    messageOn: "Message me on {method}",
    studioAddress: "Studio address",
  },

  flow: {
    // Guest navigation
    navToday: "Today",
    navSchedule: "Schedule",
    navTeam: "Team",
    navExplore: "Explore",

    // Guest surfaces
    welcome: "Welcome",
    arrivalInfo: "Arrival information",
    meals: "Meals",
    treatments: "Treatments",
    facilities: "Facilities",
    faq: "Questions",
    stayConnected: "Stay connected",
    contact: "Contact",
    call: "Call",
    whatsapp: "WhatsApp",
    nothingYet: "Nothing here yet",
  },
} as const;

/**
 * The key contract. Keys are taken from the English source (so a missing
 * or misspelled key in another locale is a compile error) while values
 * widen to `string` - otherwise `as const` would demand every locale
 * repeat the English text verbatim.
 */
export type Dictionary = { [N in keyof typeof en]: { [K in keyof (typeof en)[N]]: string } };
export type Namespace = keyof Dictionary;
