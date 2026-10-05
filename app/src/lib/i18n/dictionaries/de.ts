import type { Dictionary } from "./en";

/**
 * German (Deutsch).
 *
 * TRANSLATION STATUS: UNREVIEWED. Written for this release and not yet
 * checked by a native German speaker - see the CP3 report's open items.
 *
 * Decisions, fixed once so the product stays consistent:
 *   - Address the organizer and the guest with "Sie". A wellness product
 *     reads warmer with "du", but the Studio is a professional tool and
 *     mixing the two is worse than either; revisit with the reviewer.
 *   - Space is left as "Space" where it is the product noun, because
 *     "Raum" reads as a physical room. Compound forms are avoided.
 *   - Prefer short nouns over long compounds wherever a label sits in a
 *     narrow control: "Zeitplan" not "Unterrichtszeitplan",
 *     "Ankunft" not "Ankunftsinformationen", so 320px layouts hold.
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
    languageHelp: "Die Sprache, in der Ihr Space angezeigt wird. An Ihren Texten ändert sich nichts.",
    country: "Land",
    countryHelp: "Dient als Vorschlag für Ländervorwahl und Sprache. Bereits Gespeichertes bleibt unverändert.",
    recommended: "Empfohlen",
    allLanguages: "Alle Sprachen",
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
    contactCardSubtitle: "So erreichen Sie mich",
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

    howToContact: "So erreichen Sie mich",
    letsConnect: "Lassen Sie uns sprechen",
    messageOn: "Schreiben Sie mir auf {method}",
    studioAddress: "Adresse des Studios",
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
