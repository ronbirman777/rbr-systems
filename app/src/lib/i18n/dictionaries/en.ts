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

    // Generic field nouns. Shared by both Studios; a product adds a
    // key here only when the word is genuinely product-neutral.
    title: "Title",
    description: "Description",
    date: "Date",
    category: "Category",
    location: "Location",
    content: "Content",
    label: "Label",
    photo: "Photo",
    address: "Address",
    remove: "Remove",
    add: "Add",
    edit: "Edit",
    done: "Done",
    show: "Show",
    dismiss: "Dismiss",
    startTime: "Start time",
    endTime: "End time",
    untitled: "Untitled",
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

    // ---- Studio: Identity step ----
    identityTitle: "Tell us about your retreat",
    identityBody: "This information appears throughout your guest experience and helps guests feel oriented and welcomed.",
    retreatDetails: "Retreat details",
    retreatName: "Retreat name",
    retreatNamePlaceholder: "e.g. Wonderland Healing Center",
    timezone: "Timezone",
    timezoneHelp: "Schedule times and “today” are based on this, not the guest’s device.",
    guestAddress: "Guest address",
    guestAddressBody: "This is where guests will find your Space once it’s live. You can reserve it now and keep building - it won’t go anywhere.",
    reservedSuccessfully: "Reserved successfully.",
    retreatLogo: "Retreat logo",
    spaceImageBody: "Represents this Space itself - shown to you in My Spaces, separate from the Today Hero photo guests see.",
    saveIdentityForLogo: "Save your Identity first to unlock the logo upload.",
    saveIdentityForSpaceImage: "Save your Identity first to unlock the Space image upload.",
    saveIdentityForPhotos: "Save your Identity first to unlock photo uploads.",
    continueToBrand: "Continue to Brand",

    // ---- Studio: Brand step ----
    brandTitle: "Brand your experience",
    heroPhotographyBody: "The main image guests see on the Today screen.",
    readabilitySample: "Aa",
    textColourTooLight: "Your app text colour may be too light to read comfortably on its own - we’ll automatically darken it where needed so guest-facing text always stays legible.",
    continueToModules: "Continue to Modules",

    // ---- Studio: Modules step ----
    modulesTitle: "Choose what your guests can access",
    toggleModule: "Toggle {module}",
    todayAlwaysIncluded: "Today is always included",
    todayAlwaysIncludedBody: "The Today screen is the core of your guest experience and cannot be disabled. It automatically draws from your enabled modules.",
    notYetAvailable: "Not yet available.",
    moduleScheduleDesc: "Your retreat program and daily sessions.",
    moduleFacilitatorsDesc: "Introduce the people guiding the experience.",
    moduleMealsDesc: "Share meal times, menus and dietary information.",
    moduleTreatmentsDesc: "Present available healing and bodywork experiences.",
    moduleFacilitiesDesc: "Help guests discover the spaces around them.",
    moduleArrivalDesc: "Everything guests need before they arrive.",
    moduleInspirationDesc: "One inspirational sentence, shown each day on Today.",
    moduleFaqDesc: "Answer common questions guests ask before and during their stay.",
    moduleCustomPagesDesc: "Add your own pages - What to Bring, Guidelines, anything you need.",
    moduleStayConnectedDesc: "Share your Instagram, website and other social links.",

    // ---- Studio: Schedule step ----
    stepScheduleTitle: "Build your schedule",
    stepScheduleBody: "Add and arrange sessions for each day of your retreat. Your guests see this on the Schedule screen.",
    editSession: "Edit session",
    sessionTitle: "Session title",
    sessionTitlePlaceholder: "e.g. Morning Yoga Flow",
    facilitator: "Facilitator",
    facilitatorPlaceholder: "e.g. Maya Cohen",
    locationPlaceholder: "e.g. Yoga Shala",
    endTimeOptional: "End time (optional)",
    notesOptional: "Notes (optional)",
    notesPlaceholder: "Extra information for guests",

    // ---- Studio: Facilitators step ----
    addFacilitatorsTitle: "Add your facilitators",
    addFacilitatorsBody: "Your team appears on the Team screen. Photos are especially important here - upload the best you have.",
    noFacilitatorsYet: "No facilitators yet",
    noPhotoYet: "No photo yet",
    addFacilitator: "Add facilitator",
    fullName: "Full name",
    role: "Role",
    rolePlaceholder: "e.g. Yoga & Breathwork Facilitator",
    shortBiography: "Short biography",
    bioPlaceholder: "A few sentences about this facilitator…",
    specialties: "Specialties (comma-separated)",
    specialtiesPlaceholder: "Vinyasa Flow, Pranayama, Breathwork",
    socialLinksOptional: "Social links (optional)",
    removeLinkOf: "Remove {platform} link",
    pasteLinkOf: "Paste {platform} link",
    linkMustBeHttps: "Enter a full link starting with https:// (or leave this blank).",

    // ---- Studio: Preview & Publish step ----
    previewPublishBody: "Review your changes and publish when you’re ready. Your live guest app only updates when you choose to publish.",
    guestAppIsLive: "Your Guest App is live",
    viewGuestApp: "View Guest App",
    viewLiveGuestApp: "View live guest app",
    chooseAddressInIdentity: "Choose an address in Identity",
    shareAndQr: "Share & QR code",
    resumeDraftLater: "Resume this draft later at this link",

    // ---- Studio: readiness checklist ----
    needRetreatName: "Add your retreat name in Identity.",
    needAddress: "Choose an address in Identity.",
    needCoverImage: "Add a hero image in Brand so your Guest App has a welcoming first impression.",
    needSchedule: "Add at least one schedule item so guests know what is happening.",
    needFacilitators: "Add the people guiding your retreat.",
    navContent: "Content",

    // ---- Studio: module names, as the Studio lists them ----
    moduleArrivalInfo: "Arrival Info",
    moduleCustomPages: "Custom Pages",
    moduleDailyInspiration: "Daily Inspiration",

    // ---- Studio: session categories (a fixed system taxonomy) ----
    catYoga: "Yoga",
    catMeditation: "Meditation",
    catBreathwork: "Breathwork",
    catSound: "Sound",
    catCommunity: "Community",
    catOther: "Other",

    // ---- Studio: schedule and facilitator empty states ----
    untitledSession: "Untitled session",
    noSessionsYet: "No sessions yet",
    nothingThisDay: "Nothing scheduled this day",
    noSessionsBody: "Add the sessions, meals and activities guests will see on the Schedule screen. Use + Add Session below to start.",
    noFacilitatorsBody: "Add the teachers and hosts guiding your retreat - a photo and a short bio make the Team screen feel personal. Use the Add Facilitator tile below to start.",
    unnamed: "Unnamed",
    noRoleSet: "No role set",
    facilitatorPhotoHint: "Recommended: portrait or square photo, about 13:10 once cropped - we anchor to the top, so keep faces near the upper frame.",
    myRetreatFallback: "My Retreat",

    // ---- Module catalog labels (the Studio's own module list) ----
    moduleFacilitatorsLabel: "Facilitators / Teachers",
    moduleResources: "Resources",
    moduleAudio: "Audio",
    moduleAnnouncements: "Announcements",
    moduleCoverImageOf: "{module} cover image",
  },
  studio: {
    // Shell and navigation
    mySpaces: "My Spaces",
    mySpace: "My Space",
    backToMySpaces: "Back to My Spaces",
    studioMenu: "Studio menu",
    openStudioMenu: "Open Studio menu",
    closeStudioMenu: "Close Studio menu",
    navIdentity: "Identity",
    navBrand: "Brand",
    navModules: "Modules",
    navPreviewPublish: "Preview & Publish",
    // Saving. "unsaved changes" stays lower case: it sits inside a
    // sentence-case status strip, not on its own.
    unsavedChanges: "unsaved changes",
    saveFailed: "Couldn’t save your changes. Please try again.",
    notLoggedIn: "You need to be logged in.",
    notLoggedInToSave: "You need to be logged in to save.",
    // Brand. English is normalised to one spelling (en-GB "colour"):
    // Flow said "Color" and Teach said "colour" for the same control,
    // and two keys for one concept is how translations drift apart.
    lookAndFeel: "Look & feel",
    colourPalette: "Colour palette",
    palettePresets: "Palette presets",
    customColours: "Custom colours",
    customHex: "Custom hex",
    primaryColour: "Primary colour",
    accentColour: "Accent colour",
    navigationColour: "Navigation colour",
    textColour: "Text colour",
    backgroundTint: "Background tint",
    readabilityCheck: "Readability check",
    primaryColourHelp: "Used for key actions, navigation highlights and immersive moments.",
    accentColourHelp: "Used for live indicators, tags and warm highlights.",
    navigationColourHelp: "Used for the bottom navigation’s active tab, and other tab-like selections.",
    textColourHelp: "Used for headings, session titles and quote text.",
    backgroundTintHelp: "The page tint behind every screen. Leave it as-is to keep the default parchment ground.",
    // Media uploads
    uploadLogo: "Upload logo",
    uploadHeroPhoto: "Upload hero photo",
    uploadSpaceImage: "Upload Space image",
    heroPhotography: "Hero photography",
    spaceImage: "Space image",
    coverImage: "Cover image",
    logoFormats: "SVG, PNG · transparent background preferred",
    imageFormats: "JPG, PNG, WebP",
    heroFormats: "JPG, PNG, WebP · min 1600px wide recommended",
    // Publish and share
    publish: "Publish",
    published: "Published",
    draft: "Draft",
    readyToPublish: "Ready to publish?",
    shareYourSpace: "Share your Space",
    guestAppLink: "Guest App link",
    guestAppAddress: "Guest App address",
    anyoneWithLink: "Anyone with the link",
    featuredOnInnerDwes: "Featured on InnerDweS",
    guestsCanOpenNow: "Guests can open it right now.",
    visibleToGuests: "Visible to guests",
    // Directory review status
    statusApproved: "Approved",
    statusPending: "Pending review",
    statusNotApproved: "Not approved",
    statusNotSubmitted: "Not submitted",
    statusInactive: "Inactive",
    // Stored-data and upload errors
    couldNotReadList: "Could not read the list.",
    couldNotReadLinks: "Could not read the links.",
    couldNotReadFocal: "Could not read the focus point.",
    imageTooLarge: "Image must be under 8MB.",
    unsupportedImage: "Please upload a JPG, PNG or WEBP image.",
    noFileSelected: "No file selected.",
    imageNotProcessed: "That image could not be processed. Try a different file.",
    someDetailsInvalid: "Some details weren’t valid.",
    someLinksInvalid: "Some links weren’t valid.",

    // Save actions. The section name is a parameter so there is one
    // key, not one per section ("Save Schedule", "Save Modules", ...).
    saveSection: "Save {section}",
    saveDraft: "Save draft",
    saveAndContinue: "Save and continue",
    publishing: "Publishing",
    publishingNow: "Publishing…",
    republish: "Republish",
    notVisibleUntilPublish: "Nothing is visible to guests until you publish.",
    notVisibleUntilRepublish: "Guests won’t see further edits until you republish.",

    // Guest App address availability
    checkAvailability: "Check availability",
    checking: "Checking…",
    currentAddress: "This is your Space’s current address.",
    addressRules: "Use lowercase letters, numbers and hyphens only (3-63 characters).",
    addressReserved: "That address is reserved.",
    addressAvailable: "Available.",
    addressTaken: "That address is already taken.",
    reserveAddress: "Reserve this address",
    reserving: "Reserving…",

    // Readability check
    contrastGood: "Contrast looks good",
    contrastLow: "Contrast may be too low",
    swatchDark: "Dark",
    swatchWhite: "White",
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
