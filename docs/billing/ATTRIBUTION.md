# Guest App attribution: "Created with InnerDweS"

## What it is

An always-on, low-priority signature at the bottom of every Guest App. Component: `app/src/components/guest/created-with-footer.tsx` (`CreatedWithFooter({ locale, source })`). Rendered by both products:

| Product | Where | `source` |
|---|---|---|
| Flow (retreat Guest App) | `components/guest-app.tsx` | `flow` |
| Teach (Guest App) | `components/teach/teach-guest-app.tsx` | `teach` |

There is no per-Space switch to hide it; it is not configurable, not tied to billing status and appears for exempt and paid Spaces alike.

## Link

- Canonical URL: constant `BRAND_URL = "https://innerdwes.com"`. Deliberately never a Vercel alias or `SITE_URL`.
- Full link: `https://innerdwes.com/?ref=guest_app&src=flow` or `...&src=teach`.
- Opens in a new tab with `rel="noopener noreferrer"`; the accessible name comes from `attribution.linkLabel` ("{brand} - opens in a new tab").
- Tested: the Teach render contains `href="https://innerdwes.com/?ref=guest_app&amp;src=teach"` (`created-with-footer.test.ts`).

## Parameters

| Param | Values | Meaning |
|---|---|---|
| `ref` | `guest_app` | Fixed source marker |
| `src` | `teach`, `flow` | Which product's Guest App |

These are non-identifying: no Space id, slug, tenant, guest, locale or session value is added.

## No tracking

- No pixel, no script, no redirect wrapper, no cookie and no analytics call in the component; the only data is the two static query parameters above.
- Nothing about the Space or the viewer is sent to InnerDweS by rendering it.
- If the marketing site later measures `ref=guest_app` arrivals, that is an aggregate on the destination page and must not be joined to a Space or a person.

## Presentation

Normal document flow (no overlap with navigation, no layout shift), `flex-shrink-0 w-full text-center`, 11px / 16px line height, muted colour `rgb(90 84 74)`, link underlined, minimum 24px hit height. Text is `attribution.createdWith` with `{brand}` replaced by the link; the brand name `InnerDweS` is never translated and is placed by splitting the translation on a sentinel, so word order follows each language.

## Localization

Present in all seven locales. English: "Created with {brand}"; Turkish: "{brand} ile oluşturuldu". The Guest locale is the Space's locale, which today can only be `en/de/es/fr/he` (see LOCALIZATION.md); the `tr`/`it` attribution strings are in place for TASK 033. tr/it wording is unreviewed by natives.
