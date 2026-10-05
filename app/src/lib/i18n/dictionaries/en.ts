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

    // Shared nouns - every product reuses these
    contact: "Contact",
    gallery: "Gallery",
    email: "Email",
    phone: "Phone",
    website: "Website",
    map: "Map",
    today: "Today",
    every: "Every",
    learnMore: "Learn more",
    mainContent: "Main",
    backTo: "Back to {label}",

    // Audio player controls. Non-directional on purpose:
    // "Play" is an action, not a direction, so it is never mirrored.
    play: "Play",
    pause: "Pause",
    seek: "Seek",
    skipBack15: "Back 15 seconds",
    skipForward15: "Forward 15 seconds",
    all: "All",
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

    // Class card facts and badges
    price: "Price",
    spots: "Spots",
    maxParticipants: "Max {count}",
    length: "Length",
    minutes: "{count} min",
    minutesRead: "{count} min read",
    ended: "Ended",
    untilDate: "until {date}",
    classDetails: "{title} details",
    howToRegister: "How to register",
    howToGetThere: "How to get there",
    directions: "Directions",
    availableForPrivate: "Available for private session",

    // Home and schedule
    inspirationFrom: "Today’s inspiration · from {name}",
    nextClassLine: "Next: {title} · {date} {time}",
    newClassesSoon: "New classes coming soon",
    oneToOne: "One-to-one",
    privateThisWeek: "Private sessions this week",
    groupClasses: "Group classes",
    scheduleType: "Schedule type",
    thisWeekWith: "This week with {name}",
    nextTwoWeeksWith: "The next two weeks with {name}",
    daysWithSessions: "Days with sessions",
    noClassesTwoWeeks: "No classes in the next two weeks",
    noPrivateThisDay: "No private windows this day",
    noPrivateTwoWeeks: "No private windows in the next two weeks",

    // About Me. Hebrew and German both avoid a first-person
    // verb here, because the teacher's gender is unknown and a
    // gendered verb would guess at it.
    aboutMe: "About me",
    teachingPhilosophy: "Teaching philosophy",
    stylesITeach: "Styles I teach",
    trainingCerts: "Training & certificates",
    galleryPhoto: "Gallery photo {index}",
    teacherFallback: "Teacher",

    // Readings and audio
    externalArticle: "External article",
    alsoPublishedExternally: "Also published externally",
    readFullArticle: "Read the full article",
    audioUnavailable: "Audio not available",
    audioLoadError: "Couldn’t load this audio — please try again.",
    contactSoon: "Contact details coming soon",

    // Registration calls to action. Platform names stay as
    // they are - they are brands, not words.
    bookYourSpot: "Book your spot",
    joinViaWhatsapp: "Join via WhatsApp",
    registerOnWebsite: "Register on website",
    messageOnInstagram: "Message on Instagram",
    registerOnFacebook: "Register on Facebook",
    registerByEmail: "Register by email",
    bookWithVenue: "Book with the venue",
    bookWithNamed: "Book with {venue}",
    book: "Book",
    bookASession: "Book a session",
    privateSession: "Private session",
    externalBookingLink: "External booking link",
    hostVenueLink: "Host venue link",

    // Default message templates. These are system copy the
    // organizer may overwrite in the Studio; the {{variables}} are
    // substituted by renderTemplate and must survive translation.
    classWhatsappTemplate: "Hi {{teacher_name}}, I'd like to join {{class_name}} on {{date}} at {{start_time}}. Could you please confirm availability?\n{{space_url}}",
    privateWhatsappTemplate: "Hi {{teacher_name}}, I'd love a private session on {{date}} between {{start_time}} and {{end_time}}.",
    reading: "Reading",
    noteFrom: "A note from {name}",
    yourTeacher: "your teacher",

    // Recurrence, assembled rather than formatted. Hebrew has a
    // dual form, so "every 2 weeks" is "כל שבועיים" and never
    // "כל 2 שבועות" - hence the explicit two-* keys.
    recurEveryDay: "every day",
    recurEveryWeek: "every week",
    recurEveryMonth: "every month",
    recurEveryTwoDays: "every 2 days",
    recurEveryTwoWeeks: "every 2 weeks",
    recurEveryTwoMonths: "every 2 months",
    recurEveryNDays: "every {count} days",
    recurEveryNWeeks: "every {count} weeks",
    recurEveryNMonths: "every {count} months",
    recurOnDays: "on {days}",
    recurOnDayOfMonth: "on the {day}",
    recurNoEnd: "No end date",
    recurUntil: "Until {date}",
    recurOnce: "1 time",
    recurTwice: "2 times",
    recurNTimes: "{count} times",
    repeatsSummary: "Repeats {summary}",

    // Private availability windows
    availEveryWeekday: "Every {weekday}",
    availWeekly: "Weekly",
    availOneOff: "One-off",
    availHidden: "hidden",

    // "Teaching since" avoids a conjugated verb: Hebrew and German
    // would both have to guess the teacher's gender.
    teachingSince: "Teaching since {year}",
    teachingSinceYears: "Teaching since {year} · {years}",
    yearOne: "1 year",
    yearTwo: "2 years",
    yearsN: "{count} years",
    hostedAt: "Hosted at {venue}",
    today: "TODAY",
    classOne: "1 class",
    classesN: "{count} classes",
    windowOne: "1 window",
    windowsN: "{count} windows",
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

    // Explore. The heading is split so the emphasised word can sit
    // where each language puts it: "Your Retreat", "הריטריט שלך".
    exploreHeading: "Your {em}",
    exploreHeadingEm: "Retreat",
    exploreEmpty: "Nothing to explore yet.",
    eyebrowMeals: "Daily Nourishment",
    eyebrowTreatments: "Bodywork & Healing",
    eyebrowFacilities: "Spaces",
    eyebrowArrival: "Practical",
    eyebrowFaq: "Good to Know",
    eyebrowStayConnected: "Keep in Touch",
    eyebrowMore: "More",

    // Today
    goodMorning: "Good morning.",
    todaysIntention: "Today’s Intention",
    happeningNow: "Happening Now",
    live: "Live",
    upNext: "Up Next",
    nothingScheduledNow: "Nothing scheduled right now.",
    viewFullSchedule: "View today’s full schedule",

    // Schedule
    nothingScheduledDay: "Nothing scheduled for this day.",
    now: "Now",
    sessionMeal: "Meal",

    // Facilitators. German "Begleitung" and the Hebrew plural avoid
    // gendering a team whose members are unknown.
    yourGuides: "Your Guides",
    facilitators: "Facilitators",
    sessionsThisRetreat: "Sessions This Retreat",
    noFacilitators: "No facilitators added yet.",

    // Facilities, FAQ
    spacesAmenities: "Spaces & Amenities",
    faqFull: "Frequently Asked Questions",

    // Arrival
    practicalInformation: "Practical Information",
    gettingHere: "Getting Here",
    onArrival: "On Arrival",
    whatToBring: "What to Bring",
    importantNotes: "Important Notes",
    checkIn: "Check-in",
    checkOut: "Check-out",
    openInMaps: "Open in Maps",

    // Meals - the meal kinds are a fixed system taxonomy, not
    // something the organizer types.
    mealBreakfast: "Breakfast",
    mealBrunch: "Brunch",
    mealLunch: "Lunch",
    mealDinner: "Dinner",
    mealSpecial: "Special",
    nothingAddedYet: "Nothing added yet.",

    // Treatments
    readMore: "Read more",
    showLess: "Show less",
    toBook: "To book",

    // Guest access code
    enterAccessCode: "Enter your 6-digit access code",
    accessCode: "6-digit access code",
    digitOf: "Digit {index} of 6",
    checking: "Checking…",
    backToHome: "Back to home",
    facilitatorsHeading: "Meet the {em}",
    facilitatorsHeadingEm: "Facilitators",

    // Guest Access gate. Shown BEFORE a visitor has proven they may
    // see the Space, so there are only two variants - retreat and
    // neutral - and translating must not add a third that would reveal
    // which product a Space is.
    gatePrivateRetreat: "Private Retreat",
    gatePrivateSpace: "Private Space",
    gateOpenRetreat: "Open Retreat",
    gateOpen: "Open",
    gateAskOrganizer: "Ask your retreat organizer for the access code.",
    gateAskOwner: "Ask the owner of this space for the access code.",
    mealsHeading: "Today’s {em}",
    mealsHeadingEm: "Meals",
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
