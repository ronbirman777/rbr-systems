import type { Dictionary } from "./en";

/**
 * German (Deutsch).
 *
 * TRANSLATION STATUS: UNREVIEWED. Written for this release and not yet
 * checked by a native German speaker - see the CP3 report's open items.
 *
 * TERMINOLOGY, fixed once so the product stays consistent:
 *
 *   ADDRESS: informal "du / dein / deine" throughout, for organizers and
 *   guests alike (owner decision, CP3B). InnerDweS is a personal wellness
 *   product; "Sie" puts corporate distance between a teacher and their
 *   students. Warm and modern, still professional - never slangy.
 *
 *   InnerDweS   never translated, never declined
 *   Space       kept as "Space" - it is a defined product concept, and
 *               "Raum" reads as a physical room
 *   Guest App   "Guest App" (product concept), guests are "Gäste"
 *   Zeitplan    schedule; Kurs = class; Übung = practice
 *   Veröffentlichen = publish
 *
 *   Prefer short nouns over long compounds wherever a label sits in a
 *   narrow control: "Zeitplan" not "Unterrichtszeitplan", "Ankunft" not
 *   "Ankunftsinformationen", so 320px layouts hold.
 */
export const de: Dictionary = {
  common: {
    save: "Speichern",
    saving: "Wird gespeichert…",
    saved: "Gespeichert",
    cancel: "Abbrechen",
    close: "Schließen",
    back: "Zurück",
    next: "Weiter",
    previous: "Zurück",
    retry: "Erneut versuchen",
    copy: "Link kopieren",
    copied: "Kopiert",
    download: "Herunterladen",
    open: "Öffnen",
    search: "Suchen",

    loading: "Wird geladen…",
    error: "Etwas ist schiefgelaufen.",
    required: "Erforderlich",
    optional: "Optional",
    none: "Keine",

    language: "Sprache",
    languageHelp: "Die Sprache, in der dein Space angezeigt wird. An deinen Texten ändert sich nichts.",
    country: "Land",
    countryHelp: "Dient als Vorschlag für Ländervorwahl und Sprache. Was du schon gespeichert hast, bleibt unverändert.",
    recommended: "Empfohlen",
    allLanguages: "Alle Sprachen",

    // Shared nouns - every product reuses these
    contact: "Kontakt",
    gallery: "Galerie",
    email: "E-Mail",
    phone: "Telefon",
    website: "Website",
    map: "Karte",
    today: "Heute",
    every: "Jeden",
    learnMore: "Mehr erfahren",
    mainContent: "Hauptinhalt",
    backTo: "Zurück zu {label}",

    // Audio player controls. Non-directional on purpose:
    // "Play" is an action, not a direction, so it is never mirrored.
    play: "Abspielen",
    pause: "Pause",
    seek: "Zeitleiste",
    skipBack15: "15 Sekunden zurück",
    skipForward15: "15 Sekunden vor",
    all: "Alle",
  },

  teach: {
    navHome: "Start",
    navSchedule: "Zeitplan",
    navAbout: "Über mich",
    navExplore: "Entdecken",

    todaysClasses: "Kurse heute",
    noClassesToday: "Heute keine Kurse",
    nextClass: "Als Nächstes",
    seeFullSchedule: "Ganzen Zeitplan ansehen",
    seeTheSchedule: "Zum Zeitplan",
    getInTouch: "Kontakt aufnehmen",
    todaysInspiration: "Impuls des Tages",
    fromTeacher: "Von {name}",

    exploreReadings: "Meine Texte",
    exploreAudio: "Meine Audios",
    exploreContact: "Kontakt aufnehmen",
    exploreHeading: "Entdecken",
    moreFrom: "Mehr von {name}",
    exploreEmpty: "Bald mehr",
    exploreEmptyBody: "Texte, Audios und Seiten erscheinen hier.",
    contactCardTitle: "Kontakt",
    contactCardSubtitle: "So erreichst du mich",
    readingsEyebrow: "Gedanken & Artikel",
    audioEyebrow: "Übungen zum Anhören",
    noReadings: "Noch keine Texte",
    noReadingsBody: "Geschriebene Gedanken erscheinen hier.",
    noAudio: "Noch keine Audios",
    noAudioBody: "Geführte Übungen erscheinen hier.",

    chooseDay: "Tag wählen",
    noClassesOnDay: "An diesem Tag keine Kurse",
    privateSessions: "Einzelstunden",
    allLevels: "Alle Level",

    howToContact: "So erreichst du mich",
    letsConnect: "Lass uns sprechen",
    messageOn: "Schreib mir auf {method}",
    studioAddress: "Adresse des Studios",

    // Class card facts and badges
    price: "Preis",
    spots: "Plätze",
    maxParticipants: "max. {count}",
    length: "Dauer",
    minutes: "{count} Min.",
    minutesRead: "{count} Min. Lesezeit",
    ended: "Beendet",
    untilDate: "bis {date}",
    classDetails: "Details zu {title}",
    howToRegister: "So meldest du dich an",
    howToGetThere: "So findest du uns",
    directions: "Wegbeschreibung",
    availableForPrivate: "Für Einzelstunden verfügbar",

    // Home and schedule
    inspirationFrom: "Impuls des Tages · von {name}",
    nextClassLine: "Als Nächstes: {title} · {date} {time}",
    newClassesSoon: "Neue Kurse folgen bald",
    oneToOne: "Einzeln",
    privateThisWeek: "Einzelstunden diese Woche",
    groupClasses: "Gruppenkurse",
    scheduleType: "Art des Zeitplans",
    thisWeekWith: "Diese Woche mit {name}",
    nextTwoWeeksWith: "Die nächsten zwei Wochen mit {name}",
    daysWithSessions: "Tage mit Terminen",
    noClassesTwoWeeks: "Keine Kurse in den nächsten zwei Wochen",
    noPrivateThisDay: "Keine freien Zeiten an diesem Tag",
    noPrivateTwoWeeks: "Keine freien Zeiten in den nächsten zwei Wochen",

    // About Me. Hebrew and German both avoid a first-person
    // verb here, because the teacher's gender is unknown and a
    // gendered verb would guess at it.
    aboutMe: "Über mich",
    teachingPhilosophy: "Meine Lehrphilosophie",
    stylesITeach: "Meine Stilrichtungen",
    trainingCerts: "Ausbildung & Zertifikate",
    galleryPhoto: "Galeriefoto {index}",
    teacherFallback: "Lehrkraft",

    // Readings and audio
    externalArticle: "Externer Artikel",
    alsoPublishedExternally: "Auch extern veröffentlicht",
    readFullArticle: "Ganzen Artikel lesen",
    audioUnavailable: "Audio nicht verfügbar",
    audioLoadError: "Dieses Audio konnte nicht geladen werden – bitte versuch es erneut.",
    contactSoon: "Kontaktdaten folgen bald",

    // Registration calls to action. Platform names stay as
    // they are - they are brands, not words.
    bookYourSpot: "Platz reservieren",
    joinViaWhatsapp: "Über WhatsApp anmelden",
    registerOnWebsite: "Auf der Website anmelden",
    messageOnInstagram: "Auf Instagram schreiben",
    registerOnFacebook: "Über Facebook anmelden",
    registerByEmail: "Per E-Mail anmelden",
    bookWithVenue: "Beim Veranstaltungsort buchen",
    bookWithNamed: "Bei {venue} buchen",
    book: "Buchen",
    bookASession: "Stunde buchen",
    privateSession: "Einzelstunde",
    externalBookingLink: "Externer Buchungslink",
    hostVenueLink: "Link zum Veranstaltungsort",

    // Default message templates. These are system copy the
    // organizer may overwrite in the Studio; the {{variables}} are
    // substituted by renderTemplate and must survive translation.
    classWhatsappTemplate: "Hallo {{teacher_name}}, ich würde gern bei {{class_name}} am {{date}} um {{start_time}} dabei sein. Kannst du mir bestätigen, dass noch ein Platz frei ist?\n{{space_url}}",
    privateWhatsappTemplate: "Hallo {{teacher_name}}, ich würde gern eine Einzelstunde am {{date}} zwischen {{start_time}} und {{end_time}} buchen.",
    reading: "Text",
    noteFrom: "Eine Notiz von {name}",
    yourTeacher: "deiner Lehrkraft",

    // Recurrence, assembled rather than formatted. Hebrew has a
    // dual form, so "every 2 weeks" is "כל שבועיים" and never
    // "כל 2 שבועות" - hence the explicit two-* keys.
    recurEveryDay: "jeden Tag",
    recurEveryWeek: "jede Woche",
    recurEveryMonth: "jeden Monat",
    recurEveryTwoDays: "alle 2 Tage",
    recurEveryTwoWeeks: "alle 2 Wochen",
    recurEveryTwoMonths: "alle 2 Monate",
    recurEveryNDays: "alle {count} Tage",
    recurEveryNWeeks: "alle {count} Wochen",
    recurEveryNMonths: "alle {count} Monate",
    recurOnDays: "am {days}",
    recurOnDayOfMonth: "am {day}",
    recurNoEnd: "Ohne Enddatum",
    recurUntil: "Bis {date}",
    recurOnce: "1-mal",
    recurTwice: "2-mal",
    recurNTimes: "{count}-mal",
    repeatsSummary: "Wiederholt sich {summary}",

    // Private availability windows
    availEveryWeekday: "Jeden {weekday}",
    availWeekly: "Wöchentlich",
    availOneOff: "Einmalig",
    availHidden: "ausgeblendet",

    // "Teaching since" avoids a conjugated verb: Hebrew and German
    // would both have to guess the teacher's gender.
    teachingSince: "Unterrichtet seit {year}",
    teachingSinceYears: "Unterrichtet seit {year} · {years}",
    yearOne: "1 Jahr",
    yearTwo: "2 Jahre",
    yearsN: "{count} Jahre",
    hostedAt: "Findet statt bei {venue}",
    today: "HEUTE",
    classOne: "1 Kurs",
    classesN: "{count} Kurse",
    windowOne: "1 Zeitfenster",
    windowsN: "{count} Zeitfenster",
  },

  flow: {
    navToday: "Heute",
    navSchedule: "Zeitplan",
    navTeam: "Team",
    navExplore: "Entdecken",

    welcome: "Willkommen",
    arrivalInfo: "Ankunft",
    meals: "Mahlzeiten",
    treatments: "Behandlungen",
    facilities: "Einrichtungen",
    faq: "Fragen",
    stayConnected: "In Kontakt bleiben",
    contact: "Kontakt",
    call: "Anrufen",
    whatsapp: "WhatsApp",
    nothingYet: "Hier gibt es noch nichts",
  },
};
