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
  },
};
