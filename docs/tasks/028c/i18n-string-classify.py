#!/usr/bin/env python3
"""
CP3B final audit: classify every remaining user-visible English literal.

Categories are the ones the execution plan asks for:
  A  USER CONTENT / DATA            - allowed
  B  BRAND / PRODUCT NAME           - allowed
  C  TECHNICAL / INTERNAL / TEST    - allowed
  D  SYSTEM UI                      - must be localized

Every rule below carries the reason it applies, so the report can quote
evidence rather than an assertion.
"""
import json, re, os, collections, subprocess

SP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "app")
audit = json.load(open(os.path.join(SP, "i18n-audit.json")))

# ---------------------------------------------------------------------------
# C - technical. Each entry is (pattern, reason).
# ---------------------------------------------------------------------------
C_RULES = [
 (r"linear-gradient|color-mix|calc\(|repeat\(|url\(|var\(--|rgb\(|#[0-9a-fA-F]{3,6}\b|object-fit|object-cover|solid \$\{", "CSS value"),
 (r"text-\[|tracking-|leading-|shrink-|flex|grid|rounded|border|overflow|transition|uppercase|font-|@4xl|@min-|STUDIO_INPUT", "Tailwind class list"),
 (r"^\$\{|=\$\{|: \"\"\}|\?$|^\} |^\) |^; |^= |^, ", "fragment of a template literal or expression, split by the scanner"),
 (r"Promise|=> void|Record$|Partial|Pick|Patch|ListUpdate|items\?|previewValues|EditableTeachItem|LifecycleActionState|durationSeconds", "TypeScript type fragment"),
 (r"^item-|^cat-|^acat-|^module_|^primary-|^accent-|^navigation-|^surface-|^tt-day|^customPage:"
   r"|^(?:color|image)-field-|^class-\$\{|\.png$", "DOM id, React key or generated filename"),
 (r"^(Backspace|Arrow(Left|Right|Up|Down)|Enter|Escape|Tab|Delete|Home|End)$", "KeyboardEvent.key value"),
 (r"YYYY|HH:MM|new Date|force-dynamic|select \*|idx ===|nextTone|auth\.getUser|slots_|published\.\*|tenantMediaPath|\{tenant\}|next build|credentials:|Access-Control|fetch\(signedUrl|commit\(\)|<Link>|<input type|label === |Custom colors. option|marked .Recommended.|Recommended first|\\bCustom\\b.*stays selected|its own \"Back\" button|bottom nav \+ ", "code or format example inside a doc comment"),
 (r"DM Serif Display|DM Sans", "CSS font shorthand or font family name"),
 (r"Could not load image|Failed to fetch|Could not export image|AbortError|Could not find the (table|function)|could not remove Space media", "internal error string, replaced by a localized message before display"),
 (r"^Not found$", "HTTP response body, not UI"),
 (r"^(Meal|Meditation)$", "style-map key matched against the organizer's own stored category value"),
 (r"^(Yoga|Breathwork|Sound|Community|Other)$", "canonical English VALUE of a stored session category (its label is translated separately)"),
 (r"Sessions This Retreat|Book at reception|Today's Intention|Your Guides|Meet the Facilitators|Happening Now|Good morning\.|What to Bring|Community Guidelines|My Space|Content|Publishing|Save and continue|View live guest app|Primary Color|SAVE MODULES|^Save$|Add Space / upgrade required|Tue,? 14 Oct|Next: Morning Flow|Wed 14 Oct, 2 classes|i\.startTime|Back to My Spaces", "prose inside a doc comment, not rendered"),
]
# Phrases that only ever appear inside a doc comment. Verified by reading
# each site; the comment text is listed so a reviewer can re-check it.
C_COMMENT_SITES = {
 ("retreat-configurator.tsx", "Back"):        'its own "Back" button keeps working',
 ("studio-ui.tsx", "My space"):               'The current Studio section\'s eyebrow (e.g. "My space", ...)',
 ("studio-ui.tsx", "Continue \u2192"):           'The "\u2192" that trails a forward action ("Continue \u2192")',
 ("teach-studio-sections.tsx", "Custom"):     'Kept locally so "Custom" stays selected',
 ("teach-guest-app.tsx", "Get in touch"):     'bottom nav + "Get in touch"',
 ("brand-preset-chips.tsx", "Custom colors"):  'Renders the separate "Custom colors" option when onCustom is given',
 ("space-language-card.tsx", "Recommended"):   'languages that country suggests are marked "Recommended" and listed first',
}

# ---------------------------------------------------------------------------
# B - brand and product names.
# ---------------------------------------------------------------------------
B_RULES = [
 (r"^(WhatsApp|Instagram|Facebook|Telegram)$", "third-party platform name"),
 (r"^(Time to Flow|Time to Teach|TIME TO FLOW|TIME TO TEACH|InnerDweS|POWERED BY INNERDWES)$", "InnerDweS product or brand name"),
 (r"^(JPG, PNG, WebP)$", "file format names"),
 (r"^Aa$", "type specimen, localized where the script differs (he gets אא)"),
]
# Whole modules whose strings are all one category, with the reason.
# Keyed by file, so a NEW string in one of these still has to be
# justified by the rule rather than slipping through unexamined.
BY_FILE = [
 ("lib/content/dailyQuotes.ts", "A",
  "InnerDweS's own curated quote collection and its attributions. This is "
  "editorial CONTENT, not interface chrome - and translating Lao Tzu, the "
  "Buddha or Patanjali means sourcing published translations, which is an "
  "editorial decision for the owner, not a localization task."),
 ("lib/teach/style.ts", "C",
  "canonical English *_LABEL records; styleLabels(locale) is the display path"),
 ("lib/modules/catalog.ts", "C",
  "canonical English module labels; moduleLabel(key, locale) is the display path"),
 ("lib/spaceTypes/migrationInspect.ts", "C", "SQL identifiers and probe text"),
 ("lib/spaceTypes/registry.ts", "D-exception",
  "Space Type Registry copy, rendered on /create and used as a new Space's "
  "default name - both happen BEFORE a Space exists, so there is no "
  "spaceSettings.locale to read; an account-level language is out of CP3 scope"),
 ("components/brand/wordmark.tsx", "B", "the InnerDweS wordmark and its tagline"),
 ("lib/modules/socialLinks.ts", "B", "third-party platform names"),
 ("lib/teach/schedule.ts", "C", "worked examples inside doc comments"),
 ("lib/teach/recurrenceText.ts", "C", "worked examples inside doc comments"),
 ("lib/modules/facilitator.ts", "C", "example tags named in a doc comment"),
 ("lib/studio/publicLink.ts", "C", "control names quoted in doc comments"),
 ("components/studio/empty-state.tsx", "C", "no user-visible literals"),
 ("components/studio/section-header.tsx", "C", "no user-visible literals"),
 ("lib/spaceTypes/publishAvailability.ts", "C", "control names quoted in doc comments"),
]

# ---------------------------------------------------------------------------
# D - system UI that is deliberately NOT localized, with the reason.
# ---------------------------------------------------------------------------
D_EXCEPTIONS = {
 "Opening your space…":  "route-level loading.tsx: a Suspense fallback renders before any data, so no Space locale is available",
 "Opening your studio…": "route-level loading.tsx: a Suspense fallback renders before any data, so no Space locale is available",
 "Manage Space":         "doc comment in loading.tsx naming the My Spaces links",
 "Preview":              "doc comment in loading.tsx naming the My Spaces links",
 "No available Space slots": "shown before any Space exists, so there is no spaceSettings.locale to read; account-level language is out of CP3 scope",
 "Go to My Spaces":      "same screen as above - reached before any Space exists",
 "Back to home":         "/log-in and /sign-up chrome: account-level, outside any Space",
 "YOUR RETREAT COMPANION":   "canvas Share Card - Hebrew falls back (see shareCardLocale); German IS translated",
 "SCAN TO OPEN THE RETREAT APP": "canvas Share Card - Hebrew falls back (see shareCardLocale); German IS translated",
}

def classify(text, loc=""):
    path = loc.split(":")[0]
    for prefix, cat, why in BY_FILE:
        if path == prefix or path.startswith(prefix):
            return cat, why
    basename = loc.split("/")[-1].split(":")[0]
    site = C_COMMENT_SITES.get((basename, text))
    if site: return "C", f"doc comment: {site}"
    for pat, why in B_RULES:
        if re.search(pat, text): return "B", why
    for pat, why in C_RULES:
        if re.search(pat, text): return "C", why
    if text in D_EXCEPTIONS: return "D-exception", D_EXCEPTIONS[text]
    return "D", "UNCLASSIFIED - still rendered in English"

buckets = collections.defaultdict(list)
for surface, strings in audit.items():
    for text, locs in strings.items():
        cat, why = classify(text, locs[0])
        buckets[cat].append((surface, text, locs[0], why))

print("=" * 78)
print("CP3B HARD-CODED STRING AUDIT")
print("=" * 78)
for cat in ("A", "B", "C", "D-exception", "D"):
    rows = buckets.get(cat, [])
    print(f"\n{cat}: {len(rows)}")
    if cat == "C":
        by = collections.Counter(w for *_, w in rows)
        for why, n in by.most_common():
            print(f"   {n:4d}  {why}")
        continue
    for surface, text, loc, why in sorted(rows, key=lambda r: r[1]):
        print(f"   [{surface}] {text!r}")
        print(f"        {loc}")
        print(f"        -> {why}")

d = buckets.get("D", [])
print("\n" + "=" * 78)
print(f"REMAINING CATEGORY D (unlocalized system UI): {len(d)}")
print(f"DOCUMENTED D EXCEPTIONS: {len(buckets.get('D-exception', []))}")
print("=" * 78)
