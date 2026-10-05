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

    // Generic field nouns. Shared by both Studios; a product adds a
    // key here only when the word is genuinely product-neutral.
    title: "כותרת",
    description: "תיאור",
    date: "תאריך",
    category: "קטגוריה",
    location: "מקום",
    content: "תוכן",
    label: "תווית",
    photo: "תמונה",
    address: "כתובת",
    remove: "הסרה",
    add: "הוספה",
    edit: "עריכה",
    done: "סיום",
    show: "הצגה",
    dismiss: "סגירה",
    startTime: "שעת התחלה",
    endTime: "שעת סיום",
    untitled: "בלי כותרת",
    time: "שעה",
    disabled: "כבוי",
    question: "שאלה",
    answer: "תשובה",
    savingNow: "שומר…",
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

    // ---- Studio: Identity step ----
    identityTitle: "ספרו לנו על הריטריט",
    identityBody: "המידע הזה מופיע בכל חוויית האורח ועוזר לאורחים להתמצא ולהרגיש רצויים.",
    retreatDetails: "פרטי הריטריט",
    retreatName: "שם הריטריט",
    retreatNamePlaceholder: "למשל: מרכז הריפוי וונדרלנד",
    timezone: "אזור זמן",
    timezoneHelp: "שעות הלוח ו״היום״ נקבעים לפיו, ולא לפי המכשיר של האורח.",
    guestAddress: "כתובת לאורחים",
    guestAddressBody: "כאן האורחים ימצאו את המרחב שלכם כשיעלה לאוויר. אפשר לשמור אותה עכשיו ולהמשיך לבנות - היא לא תיעלם.",
    reservedSuccessfully: "נשמר בהצלחה.",
    retreatLogo: "הלוגו של הריטריט",
    spaceImageBody: "מייצגת את המרחב עצמו - מוצגת לכם במרחבים שלי, בנפרד מהתמונה הראשית שהאורחים רואים ב״היום״.",
    saveIdentityForLogo: "שמרו קודם את הזהות כדי לפתוח את העלאת הלוגו.",
    saveIdentityForSpaceImage: "שמרו קודם את הזהות כדי לפתוח את העלאת תמונת המרחב.",
    saveIdentityForPhotos: "שמרו קודם את הזהות כדי לפתוח את העלאת התמונות.",
    continueToBrand: "המשך למיתוג",

    // ---- Studio: Brand step ----
    brandTitle: "עצבו את החוויה שלכם",
    heroPhotographyBody: "התמונה המרכזית שהאורחים רואים במסך ״היום״.",
    readabilitySample: "אא",
    textColourTooLight: "צבע הטקסט עשוי להיות בהיר מדי לקריאה נוחה - נכהה אותו אוטומטית במקומות הנדרשים כדי שהטקסט שהאורחים רואים יישאר קריא.",
    continueToModules: "המשך למודולים",

    // ---- Studio: Modules step ----
    modulesTitle: "בחרו למה האורחים יכולים לגשת",
    toggleModule: "הפעלה או כיבוי של {module}",
    todayAlwaysIncluded: "״היום״ תמיד כלול",
    todayAlwaysIncludedBody: "מסך ״היום״ הוא הלב של חוויית האורח ולא ניתן לכבות אותו. הוא נשען אוטומטית על המודולים שהפעלתם.",
    notYetAvailable: "עוד לא זמין.",
    moduleScheduleDesc: "התוכנית של הריטריט והמפגשים היומיים.",
    moduleFacilitatorsDesc: "הציגו את מי שמנחה את החוויה.",
    moduleMealsDesc: "שתפו שעות ארוחות, תפריטים ומידע תזונתי.",
    moduleTreatmentsDesc: "הציגו טיפולי ריפוי ועבודת גוף שזמינים.",
    moduleFacilitiesDesc: "עזרו לאורחים לגלות את המרחבים סביבם.",
    moduleArrivalDesc: "כל מה שהאורחים צריכים לפני שהם מגיעים.",
    moduleInspirationDesc: "משפט השראה אחד, שמוצג כל יום ב״היום״.",
    moduleFaqDesc: "ענו על שאלות שאורחים שואלים לפני ובמהלך השהות.",
    moduleCustomPagesDesc: "הוסיפו עמודים משלכם - מה להביא, הנחיות, כל מה שצריך.",
    moduleStayConnectedDesc: "שתפו את האינסטגרם, האתר וקישורים נוספים.",

    // ---- Studio: Schedule step ----
    stepScheduleTitle: "בנו את לוח הזמנים",
    stepScheduleBody: "הוסיפו וסדרו מפגשים לכל יום בריטריט. האורחים רואים את זה במסך לוח הזמנים.",
    editSession: "עריכת מפגש",
    sessionTitle: "שם המפגש",
    sessionTitlePlaceholder: "למשל: יוגה בוקר",
    facilitator: "מנחה",
    facilitatorPlaceholder: "למשל: מאיה כהן",
    locationPlaceholder: "למשל: שאלה ליוגה",
    endTimeOptional: "שעת סיום (לא חובה)",
    notesOptional: "הערות (לא חובה)",
    notesPlaceholder: "מידע נוסף לאורחים",

    // ---- Studio: Facilitators step ----
    addFacilitatorsTitle: "הוסיפו את המנחים",
    addFacilitatorsBody: "הצוות מופיע במסך הצוות. התמונות חשובות כאן במיוחד - העלו את הטובות שיש לכם.",
    noFacilitatorsYet: "עדיין אין מנחים",
    noPhotoYet: "עדיין אין תמונה",
    addFacilitator: "הוספת מנחה",
    fullName: "שם מלא",
    role: "תפקיד",
    rolePlaceholder: "למשל: מנחה יוגה ונשימה",
    shortBiography: "ביוגרפיה קצרה",
    bioPlaceholder: "כמה משפטים על המנחה…",
    specialties: "התמחויות (מופרדות בפסיקים)",
    specialtiesPlaceholder: "ויניאסה, פראניאמה, עבודת נשימה",
    socialLinksOptional: "קישורים לרשתות (לא חובה)",
    removeLinkOf: "הסרת הקישור ל{platform}",
    pasteLinkOf: "הדביקו קישור ל{platform}",
    linkMustBeHttps: "הזינו קישור מלא שמתחיל ב-https:// (או השאירו ריק).",

    // ---- Studio: Preview & Publish step ----
    previewPublishBody: "עברו על השינויים ופרסמו כשאתם מוכנים. ה-Guest App החי מתעדכן רק כשאתם בוחרים לפרסם.",
    guestAppIsLive: "ה-Guest App שלכם באוויר",
    viewGuestApp: "צפייה ב-Guest App",
    viewLiveGuestApp: "צפייה ב-Guest App החי",
    chooseAddressInIdentity: "בחרו כתובת במסך הזהות",
    shareAndQr: "שיתוף וקוד QR",
    resumeDraftLater: "להמשיך את הטיוטה הזו בהמשך בקישור הזה",

    // ---- Studio: readiness checklist ----
    needRetreatName: "הוסיפו את שם הריטריט במסך הזהות.",
    needAddress: "בחרו כתובת במסך הזהות.",
    needCoverImage: "הוסיפו תמונה ראשית במסך המיתוג כדי שה-Guest App יקבל רושם ראשוני מזמין.",
    needSchedule: "הוסיפו לפחות פריט אחד ללוח הזמנים כדי שהאורחים ידעו מה קורה.",
    needFacilitators: "הוסיפו את מי שמנחה את הריטריט.",
    navContent: "תוכן",

    // ---- Studio: module names, as the Studio lists them ----
    moduleArrivalInfo: "פרטי הגעה",
    moduleCustomPages: "עמודים משלכם",
    moduleDailyInspiration: "השראה יומית",

    // ---- Studio: session categories (a fixed system taxonomy) ----
    catYoga: "יוגה",
    catMeditation: "מדיטציה",
    catBreathwork: "עבודת נשימה",
    catSound: "צליל",
    catCommunity: "קהילה",
    catOther: "אחר",

    // ---- Studio: schedule and facilitator empty states ----
    untitledSession: "מפגש בלי כותרת",
    noSessionsYet: "עדיין אין מפגשים",
    nothingThisDay: "אין כלום בלוח ליום הזה",
    noSessionsBody: "הוסיפו את המפגשים, הארוחות והפעילויות שהאורחים יראו במסך לוח הזמנים. התחילו עם + הוספת מפגש למטה.",
    noFacilitatorsBody: "הוסיפו את המורים והמנחים של הריטריט - תמונה וביוגרפיה קצרה הופכות את מסך הצוות לאישי. התחילו עם ריבוע הוספת מנחה למטה.",
    unnamed: "בלי שם",
    noRoleSet: "לא הוגדר תפקיד",
    facilitatorPhotoHint: "מומלץ: תמונת פורטרט או מרובעת, בערך 13:10 לאחר החיתוך - אנחנו מעגנים למעלה, אז שמרו את הפנים בחלק העליון.",
    myRetreatFallback: "הריטריט שלי",

    // ---- Module catalog labels (the Studio's own module list) ----
    moduleFacilitatorsLabel: "מנחים / מורים",
    moduleResources: "חומרים",
    moduleAudio: "אודיו",
    moduleAnnouncements: "הודעות",
    moduleCoverImageOf: "תמונת שער ל{module}",

    // ---- Studio: Arrival step ----
    arrivalStepTitle: "הכינו את פרטי ההגעה",
    arrivalStepBody: "כל מה שהאורחים צריכים לפני ובזמן ההגעה. מידע בהיר ורגוע עושה הבדל גדול ברושם הראשון.",
    noArrivalInfoYet: "עדיין אין פרטי הגעה",
    noArrivalInfoBody: "התחילו משעות הצ׳ק-אין והצ׳ק-אאוט ומהכתובת - האורחים רואים אותן קודם במסך ההגעה. כל השאר לא חובה.",
    arrivalBasics: "יסודות ההגעה",
    preparingForArrival: "הכנה להגעה",
    welcomeMessageOptional: "הודעת ברוכים הבאים (לא חובה)",
    welcomeMessagePlaceholder: "ברכה אישית קצרה שתוצג במסך ההגעה…",
    addressPlaceholder: "147 Moo 4, Ban Tai\\nKo Samui, Surat Thani 84320",
    mapsLinkOptional: "קישור למפות (לא חובה)",
    gettingHerePlaceholder: "אפשרויות הגעה, הוראות משדה התעופה או מהתחנה הקרובים…",
    onArrivalPlaceholder: "מה לעשות כשמגיעים לריטריט…",
    whatToBringPlaceholder: "הצעות לאריזה ודברים הכרחיים…",
    importantNotesPlaceholder: "כללי הבית, נהלים, כל מה שחשוב לדעת לפני ההגעה…",
    contactName: "שם איש קשר",
    contactNamePlaceholder: "למשל: הקבלה",
    phoneNumber: "מספר טלפון",
    whatsappNumber: "מספר וואטסאפ",

    // ---- Studio: Meals step ----
    mealsStepTitle: "תכננו את הארוחות",
    mealsStepBody: "תמונות אוכל טובות ומידע תזונתי בהיר עושים הבדל אמיתי לאורחים.",
    untitledMeal: "ארוחה בלי כותרת",
    noMealsYet: "עדיין אין ארוחות",
    noMealsBody: "הוסיפו את הארוחות שיוגשו - בוקר, צהריים, ערב - עם שעות והערות תזונה. התחילו עם + הוספת ארוחה למטה.",
    mealType: "סוג הארוחה",
    mealTitlePlaceholder: "למשל: קערת בוקר מרעננת",
    mealLocationPlaceholder: "למשל: מסעדת הגן",
    mealDescriptionPlaceholder: "למה האורחים יכולים לצפות…",
    dietaryTags: "תגיות תזונה (מופרדות בפסיקים)",
    dietaryTagsPlaceholder: "טבעוני, ללא גלוטן",

    // ---- Studio: Treatments step ----
    treatmentsStepTitle: "הציגו את הטיפולים",
    treatmentsStepBody: "מה זמין ואיך מגיעים לזה. זו עוד לא מערכת הזמנות - האורחים מקבלים הסבר איך להזמין.",
    untitledTreatment: "טיפול בלי כותרת",
    noTreatmentsYet: "עדיין אין טיפולים",
    noTreatmentsBody: "הוסיפו את הטיפולים או המפגשים שאפשר להזמין, עם משך ותיאור קצר. התחילו עם + הוספת טיפול למטה.",
    treatmentName: "שם הטיפול",
    treatmentNamePlaceholder: "למשל: מסאז׳ תאילנדי מסורתי",
    shortDescription: "תיאור קצר",
    shortDescriptionPlaceholder: "שורה אחת לכרטיס הכניסה",
    durationMinutes: "משך (דקות)",
    practitioner: "מטפל / ספק",
    treatmentLocationPlaceholder: "למשל: חדר ספא 2",
    bookingInfo: "פרטי הזמנה",
    bookingInfoPlaceholder: "למשל: הזמנה בקבלה",
    fullDescription: "תיאור מלא",
    fullDescriptionPlaceholder: "מה הטיפול כולל…",

    // ---- Studio: Facilities step ----
    facilitiesStepTitle: "עזרו לאורחים למצוא את הדרך",
    facilitiesStepBody: "המרחבים שהאורחים ירצו למצוא - בריכות, סטודיואים, גנים, פינות שקטות.",
    untitledFacility: "מתקן בלי כותרת",
    noFacilitiesYet: "עדיין אין מתקנים",
    noFacilitiesBody: "הוסיפו את המרחבים שהאורחים יכולים להשתמש בהם - סאונה, בריכה, שאלה ליוגה - עם שעות פתיחה. התחילו עם + הוספת מתקן למטה.",
    facilityName: "שם המתקן",
    facilityNamePlaceholder: "למשל: בריכת מים מלוחים",
    openingHours: "שעות פתיחה",
    facilityLocationPlaceholder: "למשל: הגן התחתון",
    facilityDescriptionPlaceholder: "מה האורחים ימצאו כאן…",
    importantInfoOptional: "מידע חשוב (לא חובה)",
    importantInfoPlaceholder: "למשל: נא להתקלח לפני הכניסה",

    // ---- Studio: FAQ step ----
    faqStepTitle: "ענו על שאלות נפוצות",
    faqStepBody: "האורחים רואים אותן כאקורדיון בתוך ״גלו״. שאלות כבויות נשמרות אבל לא מוצגות.",
    untitledQuestion: "שאלה בלי כותרת",
    noQuestionsYet: "עדיין אין שאלות",
    noQuestionsBody: "ענו על השאלות שאורחים שואלים הכי הרבה - וויי-פיי, צ׳ק-אאוט או מה להביא. התחילו עם + הוספת שאלה למטה.",
    editQuestion: "עריכת שאלה",
    questionPlaceholder: "למשל: מה כדאי לארוז?",

    // ---- Studio: Custom pages step ----
    customPagesStepTitle: "הוסיפו עמודים משלכם",
    customPagesStepBody: "בחרו כותרות משלכם - מה להביא, הנחיות קהילה, על הריטריט, כל מה שצריך.",
    untitledPage: "עמוד בלי כותרת",
    noCustomPagesYet: "עדיין אין עמודים משלכם",
    noCustomPagesBody: "צרו עמוד לכל מה שהאורחים צריכים ואין לו מקום - מה להביא, הנחיות קהילה, על הריטריט. התחילו עם + הוספת עמוד למטה.",
    needMorePages: "צריכים עוד עמודים לריטריט? דברו איתנו.",
    pageTitle: "כותרת העמוד",
    pageTitlePlaceholder: "למשל: מה להביא",
    pageLabel: "עמוד",

    // ---- Studio: Stay Connected step ----
    stayConnectedStepBody: "הוסיפו את הפלטפורמות שבהן האורחים יכולים למצוא אתכם. רק קישורים עם כתובת מוצגים.",
    noLinksYet: "עדיין אין קישורים.",
  },
  studio: {
    // Shell and navigation
    mySpaces: "המרחבים שלי",
    mySpace: "המרחב שלי",
    backToMySpaces: "חזרה למרחבים שלי",
    studioMenu: "תפריט הסטודיו",
    openStudioMenu: "פתיחת תפריט הסטודיו",
    closeStudioMenu: "סגירת תפריט הסטודיו",
    navIdentity: "זהות",
    navBrand: "מיתוג",
    navModules: "מודולים",
    navPreviewPublish: "תצוגה ופרסום",
    // Saving. "unsaved changes" stays lower case: it sits inside a
    // sentence-case status strip, not on its own.
    unsavedChanges: "שינויים שלא נשמרו",
    saveFailed: "לא ניתן לשמור את השינויים. נסו שוב.",
    notLoggedIn: "צריך להתחבר.",
    notLoggedInToSave: "צריך להתחבר כדי לשמור.",
    // Brand. English is normalised to one spelling (en-GB "colour"):
    // Flow said "Color" and Teach said "colour" for the same control,
    // and two keys for one concept is how translations drift apart.
    lookAndFeel: "מראה ותחושה",
    colourPalette: "לוח הצבעים",
    palettePresets: "לוחות מוכנים",
    customColours: "צבעים משלכם",
    customHex: "קוד צבע",
    primaryColour: "צבע ראשי",
    accentColour: "צבע משני",
    navigationColour: "צבע הניווט",
    textColour: "צבע הטקסט",
    backgroundTint: "גוון הרקע",
    readabilityCheck: "בדיקת קריאות",
    primaryColourHelp: "משמש לפעולות עיקריות, להדגשות בניווט ולרגעים עוטפים.",
    accentColourHelp: "משמש לחיווי בזמן אמת, לתגיות ולהדגשות חמות.",
    navigationColourHelp: "משמש ללשונית הפעילה בניווט התחתון ולבחירות דומות.",
    textColourHelp: "משמש לכותרות, לשמות מפגשים ולציטוטים.",
    backgroundTintHelp: "גוון הרקע שמאחורי כל מסך. אם משאירים אותו, נשמר רקע הקלף המקורי.",
    // Media uploads
    uploadLogo: "העלאת לוגו",
    uploadHeroPhoto: "העלאת תמונה ראשית",
    uploadSpaceImage: "העלאת תמונת המרחב",
    heroPhotography: "התמונה הראשית",
    spaceImage: "תמונת המרחב",
    coverImage: "תמונת שער",
    logoFormats: "SVG, PNG · עדיף רקע שקוף",
    imageFormats: "JPG, PNG, WebP",
    heroFormats: "JPG, PNG, WebP · מומלץ רוחב 1600px ומעלה",
    // Publish and share
    publish: "פרסום",
    published: "פורסם",
    draft: "טיוטה",
    readyToPublish: "מוכנים לפרסם?",
    shareYourSpace: "שיתוף המרחב",
    guestAppLink: "קישור ל-Guest App",
    guestAppAddress: "הכתובת של ה-Guest App",
    anyoneWithLink: "כל מי שיש לו את הקישור",
    featuredOnInnerDwes: "מוצג ב-InnerDweS",
    guestsCanOpenNow: "האורחים יכולים להיכנס עכשיו.",
    visibleToGuests: "מוצג לאורחים",
    // Directory review status
    statusApproved: "אושר",
    statusPending: "ממתין לבדיקה",
    statusNotApproved: "לא אושר",
    statusNotSubmitted: "לא נשלח",
    statusInactive: "לא פעיל",
    // Stored-data and upload errors
    couldNotReadList: "לא ניתן לקרוא את הרשימה.",
    couldNotReadLinks: "לא ניתן לקרוא את הקישורים.",
    couldNotReadFocal: "לא ניתן לקרוא את נקודת המיקוד.",
    imageTooLarge: "התמונה חייבת להיות קטנה מ-8MB.",
    unsupportedImage: "נא להעלות תמונת JPG, PNG או WEBP.",
    noFileSelected: "לא נבחר קובץ.",
    imageNotProcessed: "לא ניתן היה לעבד את התמונה. נסו קובץ אחר.",
    someDetailsInvalid: "חלק מהפרטים לא היו תקינים.",
    someLinksInvalid: "חלק מהקישורים לא היו תקינים.",

    // Save actions. The section name is a parameter so there is one
    // key, not one per section ("Save Schedule", "Save Modules", ...).
    saveSection: "שמירת {section}",
    saveDraft: "שמירת טיוטה",
    saveAndContinue: "שמירה והמשך",
    publishing: "פרסום",
    publishingNow: "מפרסם…",
    republish: "פרסום מחדש",
    notVisibleUntilPublish: "שום דבר לא מוצג לאורחים עד שתפרסמו.",
    notVisibleUntilRepublish: "האורחים לא יראו שינויים נוספים עד פרסום מחדש.",

    // Guest App address availability
    checkAvailability: "בדיקת זמינות",
    checking: "בודק…",
    currentAddress: "זו הכתובת הנוכחית של המרחב.",
    addressRules: "אותיות קטנות באנגלית, ספרות ומקפים בלבד (3-63 תווים).",
    addressReserved: "הכתובת הזו שמורה.",
    addressAvailable: "זמינה.",
    addressTaken: "הכתובת הזו תפוסה.",
    reserveAddress: "שמירת הכתובת",
    reserving: "שומר…",

    // Readability check
    contrastGood: "הניגודיות נראית טובה",
    contrastLow: "הניגודיות עשויה להיות נמוכה מדי",
    swatchDark: "כהה",
    swatchWhite: "לבן",

    // Photo guidance, shared by every module that takes a photo
    photoLandscape2to1: "מומלץ: תמונה לרוחב, בערך 2:1.",
    photoThumbAndBanner: "התמונה מופיעה גם כתמונה ממוזערת מרובעת וגם כבאנר רחב, תלוי במקום - שמרו את הנושא במרכז.",
    photoVariableHeight: "התמונה מוצגת בגבהים שונים במקצת תלוי במקום - שמרו את הנושא במרכז והימנעו מחיתוך צמוד בקצוות.",
  },

};
