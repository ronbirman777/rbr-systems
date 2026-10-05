import type { Dictionary } from "./en";

/**
 * Hebrew (עברית).
 *
 * TRANSLATION STATUS: UNREVIEWED. These strings were written for this
 * release and have NOT been checked by a native Hebrew speaker. They are
 * grammatical and idiomatic to the best of the author's ability, but the
 * execution plan requires native review before this is treated as
 * finished copy - see the CP3 report's open items. Nothing here is
 * machine-translated at runtime, and no user content is ever translated.
 *
 * Terminology decisions, fixed once so the product stays consistent:
 *   Space        מרחב        (not "אזור" or "עמוד")
 *   Guest App    אפליקציית האורחים
 *   Schedule     לוח שיעורים (Teach) / לוח זמנים (Flow retreat)
 *   Class        שיעור
 *   Reading      קריאה / הרהור  -> "הרהורים ומאמרים" for the section
 *   Practice     תרגול
 *   Publish      פרסום
 */
export const he: Dictionary = {
  common: {
    save: "שמירה",
    saving: "שומר…",
    saved: "נשמר",
    cancel: "ביטול",
    close: "סגירה",
    back: "חזרה",
    next: "הבא",
    previous: "הקודם",
    retry: "נסו שוב",
    copy: "העתקת קישור",
    copied: "הועתק",
    download: "הורדה",
    open: "פתיחה",
    search: "חיפוש",

    loading: "טוען…",
    error: "משהו השתבש.",
    required: "חובה",
    optional: "לא חובה",
    none: "ללא",

    language: "שפה",
    languageHelp: "השפה שבה המרחב שלכם מוצג. היא אינה משנה דבר ממה שכתבתם.",
    country: "מדינה",
    countryHelp: "משמשת להצעת קידומת טלפון ושפה. היא לעולם לא משנה את מה שכבר שמרתם.",
    recommended: "מומלץ",
    allLanguages: "כל השפות",

    // Shared nouns - every product reuses these
    contact: "יצירת קשר",
    gallery: "גלריה",
    email: "אימייל",
    phone: "טלפון",
    website: "אתר",
    map: "מפה",
    today: "היום",
    every: "כל",
    learnMore: "מידע נוסף",
    mainContent: "תוכן ראשי",
    backTo: "חזרה ל{label}",

    // Audio player controls. Non-directional on purpose:
    // "Play" is an action, not a direction, so it is never mirrored.
    play: "הפעלה",
    pause: "השהיה",
    seek: "סרגל הזמן",
    skipBack15: "אחורה 15 שניות",
    skipForward15: "קדימה 15 שניות",
    all: "הכול",
  },

  teach: {
    navHome: "בית",
    navSchedule: "לוח שיעורים",
    navAbout: "עליי",
    navExplore: "גלו",

    todaysClasses: "השיעורים של היום",
    noClassesToday: "אין שיעורים היום",
    nextClass: "הבא",
    seeFullSchedule: "ללוח השיעורים המלא",
    seeTheSchedule: "לצפייה בלוח השיעורים",
    getInTouch: "צרו קשר",
    todaysInspiration: "ההשראה של היום",
    fromTeacher: "מאת {name}",

    exploreReadings: "הקריאות שלי",
    exploreAudio: "האודיו שלי",
    exploreContact: "צרו קשר",
    exploreHeading: "גלו",
    moreFrom: "עוד מאת {name}",
    exploreEmpty: "בקרוב יהיה כאן עוד",
    exploreEmptyBody: "קריאות, אודיו ועמודים יופיעו כאן.",
    contactCardTitle: "יצירת קשר",
    contactCardSubtitle: "איך להשיג אותי",
    readingsEyebrow: "הרהורים ומאמרים",
    audioEyebrow: "תרגולים להאזנה",
    noReadings: "אין עדיין קריאות",
    noReadingsBody: "הרהורים כתובים יופיעו כאן.",
    noAudio: "אין עדיין אודיו",
    noAudioBody: "תרגולים מודרכים יופיעו כאן.",

    chooseDay: "בחרו יום",
    noClassesOnDay: "אין שיעורים ביום זה",
    privateSessions: "שיעורים פרטיים",
    allLevels: "לכל הרמות",

    howToContact: "איך ליצור איתי קשר",
    letsConnect: "בואו נתחבר",
    messageOn: "שלחו לי הודעה ב{method}",
    studioAddress: "כתובת הסטודיו",

    // Class card facts and badges
    price: "מחיר",
    spots: "מקומות",
    maxParticipants: "עד {count}",
    length: "אורך",
    minutes: "{count} דק׳",
    minutesRead: "{count} דק׳ קריאה",
    ended: "הסתיים",
    untilDate: "עד {date}",
    classDetails: "פרטי {title}",
    howToRegister: "איך נרשמים",
    howToGetThere: "איך מגיעים",
    directions: "הוראות הגעה",
    availableForPrivate: "פנוי לשיעור פרטי",

    // Home and schedule
    inspirationFrom: "ההשראה של היום · מאת {name}",
    nextClassLine: "הבא: {title} · {date} {time}",
    newClassesSoon: "שיעורים חדשים בקרוב",
    oneToOne: "פרטי",
    privateThisWeek: "שיעורים פרטיים השבוע",
    groupClasses: "שיעורים קבוצתיים",
    scheduleType: "סוג לוח השיעורים",
    thisWeekWith: "השבוע עם {name}",
    nextTwoWeeksWith: "שבועיים הקרובים עם {name}",
    daysWithSessions: "ימים עם שיעורים",
    noClassesTwoWeeks: "אין שיעורים בשבועיים הקרובים",
    noPrivateThisDay: "אין חלונות פנויים ביום זה",
    noPrivateTwoWeeks: "אין חלונות פנויים בשבועיים הקרובים",

    // About Me. Hebrew and German both avoid a first-person
    // verb here, because the teacher's gender is unknown and a
    // gendered verb would guess at it.
    aboutMe: "עליי",
    teachingPhilosophy: "תפיסת ההוראה שלי",
    stylesITeach: "הסגנונות שלי",
    trainingCerts: "הכשרה ותעודות",
    galleryPhoto: "תמונה {index} בגלריה",
    teacherFallback: "מורה",

    // Readings and audio
    externalArticle: "מאמר חיצוני",
    alsoPublishedExternally: "פורסם גם במקום אחר",
    readFullArticle: "לקריאת המאמר המלא",
    audioUnavailable: "האודיו אינו זמין",
    audioLoadError: "לא ניתן לטעון את האודיו — נסו שוב.",
    contactSoon: "פרטי הקשר יתווספו בקרוב",

    // Registration calls to action. Platform names stay as
    // they are - they are brands, not words.
    bookYourSpot: "לשמירת מקום",
    joinViaWhatsapp: "הרשמה בוואטסאפ",
    registerOnWebsite: "הרשמה באתר",
    messageOnInstagram: "הודעה באינסטגרם",
    registerOnFacebook: "הרשמה בפייסבוק",
    registerByEmail: "הרשמה באימייל",
    bookWithVenue: "הרשמה דרך המקום",
    bookWithNamed: "הרשמה דרך {venue}",
    book: "הרשמה",
    bookASession: "קביעת שיעור",
    privateSession: "שיעור פרטי",
    externalBookingLink: "קישור הרשמה חיצוני",
    hostVenueLink: "קישור לאתר המקום",

    // Default message templates. These are system copy the
    // organizer may overwrite in the Studio; the {{variables}} are
    // substituted by renderTemplate and must survive translation.
    classWhatsappTemplate: "היי {{teacher_name}}, אשמח להצטרף ל{{class_name}} בתאריך {{date}} בשעה {{start_time}}. אפשר לאשר שיש מקום?\n{{space_url}}",
    privateWhatsappTemplate: "היי {{teacher_name}}, אשמח לשיעור פרטי בתאריך {{date}} בין {{start_time}} ל{{end_time}}.",
    reading: "קריאה",
    noteFrom: "פתק מ{name}",
    yourTeacher: "המורה שלך",

    // Recurrence, assembled rather than formatted. Hebrew has a
    // dual form, so "every 2 weeks" is "כל שבועיים" and never
    // "כל 2 שבועות" - hence the explicit two-* keys.
    recurEveryDay: "כל יום",
    recurEveryWeek: "כל שבוע",
    recurEveryMonth: "כל חודש",
    recurEveryTwoDays: "כל יומיים",
    recurEveryTwoWeeks: "כל שבועיים",
    recurEveryTwoMonths: "כל חודשיים",
    recurEveryNDays: "כל {count} ימים",
    recurEveryNWeeks: "כל {count} שבועות",
    recurEveryNMonths: "כל {count} חודשים",
    recurOnDays: "בימים {days}",
    recurOnDayOfMonth: "ב{day} בחודש",
    recurNoEnd: "בלי תאריך סיום",
    recurUntil: "עד {date}",
    recurOnce: "פעם אחת",
    recurTwice: "פעמיים",
    recurNTimes: "{count} פעמים",
    repeatsSummary: "חוזר {summary}",

    // Private availability windows
    availEveryWeekday: "כל יום {weekday}",
    availWeekly: "כל שבוע",
    availOneOff: "חד-פעמי",
    availHidden: "מוסתר",

    // "Teaching since" avoids a conjugated verb: Hebrew and German
    // would both have to guess the teacher's gender.
    teachingSince: "בהוראה מאז {year}",
    teachingSinceYears: "בהוראה מאז {year} · {years}",
    yearOne: "שנה",
    yearTwo: "שנתיים",
    yearsN: "{count} שנים",
    hostedAt: "מתקיים ב{venue}",
    today: "היום",
    classOne: "שיעור אחד",
    classesN: "{count} שיעורים",
    windowOne: "חלון אחד",
    windowsN: "{count} חלונות",
  },

  flow: {
    navToday: "היום",
    navSchedule: "לוח זמנים",
    navTeam: "הצוות",
    navExplore: "גלו",

    welcome: "ברוכים הבאים",
    arrivalInfo: "פרטי הגעה",
    meals: "ארוחות",
    treatments: "טיפולים",
    facilities: "מתקנים",
    faq: "שאלות",
    stayConnected: "נשארים בקשר",
    contact: "יצירת קשר",
    call: "חיוג",
    whatsapp: "וואטסאפ",
    nothingYet: "אין כאן עדיין תוכן",

    // Explore. The heading is split so the emphasised word can sit
    // where each language puts it: "Your Retreat", "הריטריט שלך".
    exploreHeading: "{em} שלך",
    exploreHeadingEm: "הריטריט",
    exploreEmpty: "אין עדיין מה לגלות.",
    eyebrowMeals: "אוכל ושתייה",
    eyebrowTreatments: "גוף וריפוי",
    eyebrowFacilities: "מרחבים",
    eyebrowArrival: "מעשי",
    eyebrowFaq: "כדאי לדעת",
    eyebrowStayConnected: "נשארים בקשר",
    eyebrowMore: "עוד",

    // Today
    goodMorning: "בוקר טוב.",
    todaysIntention: "הכוונה של היום",
    happeningNow: "קורה עכשיו",
    live: "עכשיו",
    upNext: "הבא בתור",
    nothingScheduledNow: "אין כרגע שום דבר בלוח.",
    viewFullSchedule: "ללוח הזמנים המלא של היום",

    // Schedule
    nothingScheduledDay: "אין שום דבר בלוח ליום הזה.",
    now: "עכשיו",
    sessionMeal: "ארוחה",

    // Facilitators. German "Begleitung" and the Hebrew plural avoid
    // gendering a team whose members are unknown.
    yourGuides: "המנחים שלך",
    facilitators: "מנחים",
    sessionsThisRetreat: "מפגשים בריטריט הזה",
    noFacilitators: "עדיין לא נוספו מנחים.",

    // Facilities, FAQ
    spacesAmenities: "מרחבים ומתקנים",
    faqFull: "שאלות נפוצות",

    // Arrival
    practicalInformation: "מידע מעשי",
    gettingHere: "איך מגיעים",
    onArrival: "בהגעה",
    whatToBring: "מה להביא",
    importantNotes: "חשוב לדעת",
    checkIn: "צ׳ק-אין",
    checkOut: "צ׳ק-אאוט",
    openInMaps: "פתיחה במפות",

    // Meals - the meal kinds are a fixed system taxonomy, not
    // something the organizer types.
    mealBreakfast: "ארוחת בוקר",
    mealBrunch: "בראנץ׳",
    mealLunch: "ארוחת צהריים",
    mealDinner: "ארוחת ערב",
    mealSpecial: "מיוחד",
    nothingAddedYet: "עדיין לא נוסף דבר.",

    // Treatments
    readMore: "קראו עוד",
    showLess: "להציג פחות",
    toBook: "להזמנה",

    // Guest access code
    enterAccessCode: "הזינו את קוד הגישה בן 6 הספרות",
    accessCode: "קוד גישה בן 6 ספרות",
    digitOf: "ספרה {index} מתוך 6",
    checking: "בודק…",
    backToHome: "חזרה לדף הבית",
    facilitatorsHeading: "הכירו את {em}",
    facilitatorsHeadingEm: "המנחים",

    // Guest Access gate. Shown BEFORE a visitor has proven they may
    // see the Space, so there are only two variants - retreat and
    // neutral - and translating must not add a third that would reveal
    // which product a Space is.
    gatePrivateRetreat: "ריטריט פרטי",
    gatePrivateSpace: "מרחב פרטי",
    gateOpenRetreat: "כניסה לריטריט",
    gateOpen: "כניסה",
    gateAskOrganizer: "בקשו את קוד הגישה ממארגן הריטריט.",
    gateAskOwner: "בקשו את קוד הגישה מבעל המרחב.",
    mealsHeading: "{em} של היום",
    mealsHeadingEm: "הארוחות",
  },
};
