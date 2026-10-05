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

    // Generic field nouns. Shared by both Studios; a product adds a
    // key here only when the word is genuinely product-neutral.
    title: "Titel",
    description: "Beschreibung",
    date: "Datum",
    category: "Kategorie",
    location: "Ort",
    content: "Inhalt",
    label: "Bezeichnung",
    photo: "Foto",
    address: "Adresse",
    remove: "Entfernen",
    add: "Hinzufügen",
    edit: "Bearbeiten",
    done: "Fertig",
    show: "Anzeigen",
    dismiss: "Schließen",
    startTime: "Startzeit",
    endTime: "Endzeit",
    untitled: "Ohne Titel",
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

    // Explore. The heading is split so the emphasised word can sit
    // where each language puts it: "Your Retreat", "הריטריט שלך".
    exploreHeading: "Dein {em}",
    exploreHeadingEm: "Retreat",
    exploreEmpty: "Hier gibt es noch nichts zu entdecken.",
    eyebrowMeals: "Essen & Trinken",
    eyebrowTreatments: "Körperarbeit & Heilung",
    eyebrowFacilities: "Räume",
    eyebrowArrival: "Praktisches",
    eyebrowFaq: "Gut zu wissen",
    eyebrowStayConnected: "Kontakt halten",
    eyebrowMore: "Mehr",

    // Today
    goodMorning: "Guten Morgen.",
    todaysIntention: "Die Intention des Tages",
    happeningNow: "Jetzt im Gange",
    live: "Live",
    upNext: "Als Nächstes",
    nothingScheduledNow: "Gerade ist nichts geplant.",
    viewFullSchedule: "Ganzen Tagesplan ansehen",

    // Schedule
    nothingScheduledDay: "Für diesen Tag ist nichts geplant.",
    now: "Jetzt",
    sessionMeal: "Mahlzeit",

    // Facilitators. German "Begleitung" and the Hebrew plural avoid
    // gendering a team whose members are unknown.
    yourGuides: "Deine Begleitung",
    facilitators: "Begleitung",
    sessionsThisRetreat: "Einheiten in diesem Retreat",
    noFacilitators: "Noch keine Begleitung hinzugefügt.",

    // Facilities, FAQ
    spacesAmenities: "Räume & Ausstattung",
    faqFull: "Häufige Fragen",

    // Arrival
    practicalInformation: "Praktische Infos",
    gettingHere: "So kommst du an",
    onArrival: "Bei der Ankunft",
    whatToBring: "Was du mitbringst",
    importantNotes: "Wichtige Hinweise",
    checkIn: "Check-in",
    checkOut: "Check-out",
    openInMaps: "In Maps öffnen",

    // Meals - the meal kinds are a fixed system taxonomy, not
    // something the organizer types.
    mealBreakfast: "Frühstück",
    mealBrunch: "Brunch",
    mealLunch: "Mittagessen",
    mealDinner: "Abendessen",
    mealSpecial: "Besonderes",
    nothingAddedYet: "Noch nichts hinzugefügt.",

    // Treatments
    readMore: "Mehr lesen",
    showLess: "Weniger anzeigen",
    toBook: "Buchung",

    // Guest access code
    enterAccessCode: "Gib deinen 6-stelligen Zugangscode ein",
    accessCode: "6-stelliger Zugangscode",
    digitOf: "Ziffer {index} von 6",
    checking: "Wird geprüft…",
    backToHome: "Zurück zur Startseite",
    facilitatorsHeading: "Triff {em}",
    facilitatorsHeadingEm: "deine Begleitung",

    // Guest Access gate. Shown BEFORE a visitor has proven they may
    // see the Space, so there are only two variants - retreat and
    // neutral - and translating must not add a third that would reveal
    // which product a Space is.
    gatePrivateRetreat: "Privates Retreat",
    gatePrivateSpace: "Privater Space",
    gateOpenRetreat: "Retreat öffnen",
    gateOpen: "Öffnen",
    gateAskOrganizer: "Frag die Organisation deines Retreats nach dem Zugangscode.",
    gateAskOwner: "Frag den Inhaber dieses Space nach dem Zugangscode.",
    mealsHeading: "Heutige {em}",
    mealsHeadingEm: "Mahlzeiten",

    // ---- Studio: Identity step ----
    identityTitle: "Erzähl uns von deinem Retreat",
    identityBody: "Diese Angaben erscheinen überall in der Gäste-Erfahrung und helfen deinen Gästen, sich zurechtzufinden und willkommen zu fühlen.",
    retreatDetails: "Retreat-Details",
    retreatName: "Name des Retreats",
    retreatNamePlaceholder: "z. B. Wonderland Healing Center",
    timezone: "Zeitzone",
    timezoneHelp: "Zeitplan und „heute“ richten sich danach, nicht nach dem Gerät deiner Gäste.",
    guestAddress: "Gäste-Adresse",
    guestAddressBody: "Hier finden deine Gäste deinen Space, sobald er live ist. Du kannst sie jetzt reservieren und weiterbauen - sie bleibt dir erhalten.",
    reservedSuccessfully: "Erfolgreich reserviert.",
    retreatLogo: "Retreat-Logo",
    spaceImageBody: "Steht für den Space selbst - du siehst sie unter Meine Spaces, getrennt vom Titelbild, das deine Gäste auf „Heute“ sehen.",
    saveIdentityForLogo: "Speichere zuerst die Identität, um den Logo-Upload freizuschalten.",
    saveIdentityForSpaceImage: "Speichere zuerst die Identität, um den Space-Bild-Upload freizuschalten.",
    saveIdentityForPhotos: "Speichere zuerst die Identität, um Foto-Uploads freizuschalten.",
    continueToBrand: "Weiter zur Marke",

    // ---- Studio: Brand step ----
    brandTitle: "Gestalte deine Erfahrung",
    heroPhotographyBody: "Das Hauptbild, das deine Gäste auf „Heute“ sehen.",
    readabilitySample: "Aa",
    textColourTooLight: "Deine Text-Farbe ist für sich genommen vielleicht zu hell - wir dunkeln sie automatisch ab, wo es nötig ist, damit Text für Gäste immer lesbar bleibt.",
    continueToModules: "Weiter zu den Modulen",

    // ---- Studio: Modules step ----
    modulesTitle: "Wähle, worauf deine Gäste zugreifen können",
    toggleModule: "{module} ein- oder ausschalten",
    todayAlwaysIncluded: "„Heute“ ist immer dabei",
    todayAlwaysIncludedBody: "Der „Heute“-Screen ist der Kern der Gäste-Erfahrung und lässt sich nicht abschalten. Er speist sich automatisch aus deinen aktiven Modulen.",
    notYetAvailable: "Noch nicht verfügbar.",
    moduleScheduleDesc: "Dein Retreat-Programm und die täglichen Einheiten.",
    moduleFacilitatorsDesc: "Stell die Menschen vor, die die Erfahrung begleiten.",
    moduleMealsDesc: "Teile Essenszeiten, Menüs und Ernährungsinfos.",
    moduleTreatmentsDesc: "Zeig, welche Heil- und Körperarbeit verfügbar ist.",
    moduleFacilitiesDesc: "Hilf deinen Gästen, die Räume um sie herum zu entdecken.",
    moduleArrivalDesc: "Alles, was deine Gäste vor der Ankunft brauchen.",
    moduleInspirationDesc: "Ein Satz Inspiration, jeden Tag auf „Heute“.",
    moduleFaqDesc: "Beantworte Fragen, die Gäste vor und während ihres Aufenthalts stellen.",
    moduleCustomPagesDesc: "Füge eigene Seiten hinzu - Was mitbringen, Richtlinien, was du brauchst.",
    moduleStayConnectedDesc: "Teile Instagram, Website und weitere Links.",

    // ---- Studio: Schedule step ----
    stepScheduleTitle: "Stell deinen Zeitplan zusammen",
    stepScheduleBody: "Füge für jeden Tag deines Retreats Einheiten hinzu und ordne sie. Deine Gäste sehen das im Zeitplan.",
    editSession: "Einheit bearbeiten",
    sessionTitle: "Titel der Einheit",
    sessionTitlePlaceholder: "z. B. Morgen-Yoga-Flow",
    facilitator: "Begleitung",
    facilitatorPlaceholder: "z. B. Maya Cohen",
    locationPlaceholder: "z. B. Yoga-Shala",
    endTimeOptional: "Endzeit (optional)",
    notesOptional: "Notizen (optional)",
    notesPlaceholder: "Zusätzliche Infos für Gäste",

    // ---- Studio: Facilitators step ----
    addFacilitatorsTitle: "Füge deine Begleitung hinzu",
    addFacilitatorsBody: "Dein Team erscheint im Team-Screen. Fotos sind hier besonders wichtig - lade die besten hoch, die du hast.",
    noFacilitatorsYet: "Noch keine Begleitung",
    noPhotoYet: "Noch kein Foto",
    addFacilitator: "Begleitung hinzufügen",
    fullName: "Vollständiger Name",
    role: "Rolle",
    rolePlaceholder: "z. B. Yoga- & Atemarbeit-Begleitung",
    shortBiography: "Kurze Biografie",
    bioPlaceholder: "Ein paar Sätze über diese Person…",
    specialties: "Spezialgebiete (mit Komma getrennt)",
    specialtiesPlaceholder: "Vinyasa Flow, Pranayama, Atemarbeit",
    socialLinksOptional: "Social-Links (optional)",
    removeLinkOf: "{platform}-Link entfernen",
    pasteLinkOf: "{platform}-Link einfügen",
    linkMustBeHttps: "Gib einen vollständigen Link ein, der mit https:// beginnt (oder lass das Feld leer).",

    // ---- Studio: Preview & Publish step ----
    previewPublishBody: "Sieh deine Änderungen durch und veröffentliche, wenn du bereit bist. Deine Live-Guest-App aktualisiert sich nur, wenn du veröffentlichst.",
    guestAppIsLive: "Deine Guest App ist live",
    viewGuestApp: "Guest App ansehen",
    viewLiveGuestApp: "Live-Guest-App ansehen",
    chooseAddressInIdentity: "Wähle eine Adresse unter Identität",
    shareAndQr: "Teilen & QR-Code",
    resumeDraftLater: "Diesen Entwurf später über diesen Link fortsetzen",

    // ---- Studio: readiness checklist ----
    needRetreatName: "Füge unter Identität den Namen deines Retreats hinzu.",
    needAddress: "Wähle unter Identität eine Adresse.",
    needCoverImage: "Füge unter Marke ein Titelbild hinzu, damit deine Guest App einen einladenden ersten Eindruck macht.",
    needSchedule: "Füge mindestens einen Zeitplan-Eintrag hinzu, damit deine Gäste wissen, was passiert.",
    needFacilitators: "Füge die Menschen hinzu, die dein Retreat begleiten.",
    navContent: "Inhalt",

    // ---- Studio: module names, as the Studio lists them ----
    moduleArrivalInfo: "Ankunftsinfos",
    moduleCustomPages: "Eigene Seiten",
    moduleDailyInspiration: "Täglicher Impuls",

    // ---- Studio: session categories (a fixed system taxonomy) ----
    catYoga: "Yoga",
    catMeditation: "Meditation",
    catBreathwork: "Atemarbeit",
    catSound: "Klang",
    catCommunity: "Gemeinschaft",
    catOther: "Sonstiges",

    // ---- Studio: schedule and facilitator empty states ----
    untitledSession: "Einheit ohne Titel",
    noSessionsYet: "Noch keine Einheiten",
    nothingThisDay: "An diesem Tag ist nichts geplant",
    noSessionsBody: "Füge die Einheiten, Mahlzeiten und Aktivitäten hinzu, die deine Gäste im Zeitplan sehen. Starte unten mit + Einheit hinzufügen.",
    noFacilitatorsBody: "Füge die Lehrenden und Gastgebenden deines Retreats hinzu - ein Foto und eine kurze Biografie machen den Team-Screen persönlich. Starte unten mit der Kachel Begleitung hinzufügen.",
    unnamed: "Ohne Namen",
    noRoleSet: "Keine Rolle angegeben",
    facilitatorPhotoHint: "Empfohlen: Hoch- oder quadratisches Foto, nach dem Zuschnitt etwa 13:10 - wir verankern oben, halte Gesichter also im oberen Bereich.",
    myRetreatFallback: "Mein Retreat",

    // ---- Module catalog labels (the Studio's own module list) ----
    moduleFacilitatorsLabel: "Begleitung / Lehrende",
    moduleResources: "Materialien",
    moduleAudio: "Audio",
    moduleAnnouncements: "Mitteilungen",
    moduleCoverImageOf: "Titelbild für {module}",
  },
  studio: {
    // Shell and navigation
    mySpaces: "Meine Spaces",
    mySpace: "Mein Space",
    backToMySpaces: "Zurück zu meinen Spaces",
    studioMenu: "Studio-Menü",
    openStudioMenu: "Studio-Menü öffnen",
    closeStudioMenu: "Studio-Menü schließen",
    navIdentity: "Identität",
    navBrand: "Marke",
    navModules: "Module",
    navPreviewPublish: "Vorschau & Veröffentlichen",
    // Saving. "unsaved changes" stays lower case: it sits inside a
    // sentence-case status strip, not on its own.
    unsavedChanges: "nicht gespeicherte Änderungen",
    saveFailed: "Deine Änderungen konnten nicht gespeichert werden. Bitte versuch es erneut.",
    notLoggedIn: "Du musst angemeldet sein.",
    notLoggedInToSave: "Du musst angemeldet sein, um zu speichern.",
    // Brand. English is normalised to one spelling (en-GB "colour"):
    // Flow said "Color" and Teach said "colour" for the same control,
    // and two keys for one concept is how translations drift apart.
    lookAndFeel: "Aussehen & Gefühl",
    colourPalette: "Farbpalette",
    palettePresets: "Farbvorlagen",
    customColours: "Eigene Farben",
    customHex: "Eigener Hex-Wert",
    primaryColour: "Primärfarbe",
    accentColour: "Akzentfarbe",
    navigationColour: "Navigationsfarbe",
    textColour: "Textfarbe",
    backgroundTint: "Hintergrundton",
    readabilityCheck: "Lesbarkeitsprüfung",
    primaryColourHelp: "Für zentrale Aktionen, Navigations-Highlights und immersive Momente.",
    accentColourHelp: "Für Live-Anzeigen, Tags und warme Highlights.",
    navigationColourHelp: "Für den aktiven Tab der unteren Navigation und ähnliche Auswahlen.",
    textColourHelp: "Für Überschriften, Sitzungstitel und Zitate.",
    backgroundTintHelp: "Der Seitenton hinter jedem Screen. Unverändert lassen, um den Pergamentgrund zu behalten.",
    // Media uploads
    uploadLogo: "Logo hochladen",
    uploadHeroPhoto: "Titelbild hochladen",
    uploadSpaceImage: "Space-Bild hochladen",
    heroPhotography: "Titelbild",
    spaceImage: "Space-Bild",
    coverImage: "Titelbild",
    logoFormats: "SVG, PNG · transparenter Hintergrund bevorzugt",
    imageFormats: "JPG, PNG, WebP",
    heroFormats: "JPG, PNG, WebP · mind. 1600px Breite empfohlen",
    // Publish and share
    publish: "Veröffentlichen",
    published: "Veröffentlicht",
    draft: "Entwurf",
    readyToPublish: "Bereit zum Veröffentlichen?",
    shareYourSpace: "Teile deinen Space",
    guestAppLink: "Guest-App-Link",
    guestAppAddress: "Guest-App-Adresse",
    anyoneWithLink: "Alle mit dem Link",
    featuredOnInnerDwes: "Auf InnerDweS vorgestellt",
    guestsCanOpenNow: "Gäste können ihn jetzt öffnen.",
    visibleToGuests: "Für Gäste sichtbar",
    // Directory review status
    statusApproved: "Genehmigt",
    statusPending: "Wird geprüft",
    statusNotApproved: "Nicht genehmigt",
    statusNotSubmitted: "Nicht eingereicht",
    statusInactive: "Inaktiv",
    // Stored-data and upload errors
    couldNotReadList: "Die Liste konnte nicht gelesen werden.",
    couldNotReadLinks: "Die Links konnten nicht gelesen werden.",
    couldNotReadFocal: "Der Fokuspunkt konnte nicht gelesen werden.",
    imageTooLarge: "Das Bild muss kleiner als 8 MB sein.",
    unsupportedImage: "Bitte lade ein JPG-, PNG- oder WEBP-Bild hoch.",
    noFileSelected: "Keine Datei ausgewählt.",
    imageNotProcessed: "Dieses Bild konnte nicht verarbeitet werden. Versuch eine andere Datei.",
    someDetailsInvalid: "Einige Angaben waren nicht gültig.",
    someLinksInvalid: "Einige Links waren nicht gültig.",

    // Save actions. The section name is a parameter so there is one
    // key, not one per section ("Save Schedule", "Save Modules", ...).
    saveSection: "{section} speichern",
    saveDraft: "Entwurf speichern",
    saveAndContinue: "Speichern und weiter",
    publishing: "Veröffentlichung",
    publishingNow: "Wird veröffentlicht…",
    republish: "Neu veröffentlichen",
    notVisibleUntilPublish: "Für Gäste ist nichts sichtbar, bis du veröffentlichst.",
    notVisibleUntilRepublish: "Deine Gäste sehen weitere Änderungen erst, wenn du neu veröffentlichst.",

    // Guest App address availability
    checkAvailability: "Verfügbarkeit prüfen",
    checking: "Wird geprüft…",
    currentAddress: "Das ist die aktuelle Adresse deines Space.",
    addressRules: "Nur Kleinbuchstaben, Zahlen und Bindestriche (3-63 Zeichen).",
    addressReserved: "Diese Adresse ist reserviert.",
    addressAvailable: "Verfügbar.",
    addressTaken: "Diese Adresse ist schon belegt.",
    reserveAddress: "Diese Adresse reservieren",
    reserving: "Wird reserviert…",

    // Readability check
    contrastGood: "Der Kontrast sieht gut aus",
    contrastLow: "Der Kontrast ist möglicherweise zu gering",
    swatchDark: "Dunkel",
    swatchWhite: "Weiß",
  },

};
