# TASK 028D (CP4) — Guest shell and performance: how the numbers were produced

Every figure in the CP4 report comes from these scripts. They are here so
the numbers can be re-derived rather than taken on trust, and so a later
change to media delivery can be measured the same way.

## Why a local harness rather than Staging

The brief asked for measured before/after numbers. Measuring on Staging
would have given one set of absolute latencies and no control: Supabase
Storage, a remote Postgres and a CDN all move between runs, and the
"before" arm no longer exists there once the change is merged. So the
harness serves **the real rendered Guest HTML** against a **modelled**
`/api/media`, with both arms differing only in the policy under test.

What is real:

- the markup, from `fixture-render.tsx`, which streams the actual
  `TeachGuestApp` / `GuestApp` through `renderToReadableStream` — so
  React's `<head>` hoisting happens and the LCP preload hint is present
  exactly as it ships
- the real CSS, taken from a `next build`
- the real prefetcher: `fixture-client.ts` imports
  `lib/media/prefetch.ts` itself, driven by the inventory the app's own
  `teachPrefetchItems` / `guestPrefetchItems` computed at render time
- every image request, its order, its `loading`/`fetchpriority`, and the
  render the browser selected from the srcset
- response headers, and therefore browser cache behaviour

What is modelled, identically in both arms:

- `/api/media`'s three database round trips (25ms each) and its signing
  call (20ms), then a 302 to Storage (30ms). Absolute latency is
  therefore NOT Staging's; the deltas are honest because the model is
  the same on both sides.
- Storage's width transform, as a byte-scale by area ratio against the
  asset's natural width. Real Supabase re-encodes, usually to WebP, so
  real savings should be at least this good.

Throttling is Lighthouse's Slow 4G (1.6 Mbps, 150ms RTT) plus 4x CPU,
applied through CDP, because on loopback everything completes in a few
milliseconds and no ordering problem is visible.

## Running it

```sh
# 1. a production build, for the real stylesheet
cd app && npm run build
cat .next/static/chunks/*.css > /tmp/028d/site/app.css

# 2. render the fixtures (3 locales x both products x both tabs)
./docs/tasks/028d/fixture-build.sh "$PWD/app" ./docs/tasks/028d
node ./docs/tasks/028d/out/render.mjs /tmp/028d/site /app.css
python3 ./docs/tasks/028d/build-tab-fixtures.py /tmp/028d/site
cp ./docs/tasks/028d/out/prefetch.js /tmp/028d/site/

# 3. two servers: one reproducing today's behaviour, one with CP4's
MEDIA_MODE=legacy node docs/tasks/028d/perf-harness-server.mjs /tmp/028d/site 4191 &
MEDIA_MODE=cached node docs/tasks/028d/perf-harness-server.mjs /tmp/028d/site 4192 &

# 4. measure
node docs/tasks/028d/perf-load.mjs      http://localhost:4191 before 5
node docs/tasks/028d/perf-load.mjs      http://localhost:4192 after  5
node docs/tasks/028d/perf-tabswitch.mjs http://localhost:4191 before
node docs/tasks/028d/perf-tabswitch.mjs http://localhost:4192 after
node docs/tasks/028d/perf-prefetch.mjs  http://localhost:4192 flow explore
node docs/tasks/028d/perf-hero-hint.mjs http://localhost:4192 5
node docs/tasks/028d/browser-qa.mjs     http://localhost:4192 chromium qa-chromium.ndjson
node docs/tasks/028d/browser-qa.mjs     http://localhost:4192 webkit   qa-webkit.ndjson
```

The fixture media (`site/media/*.png`) is synthetic: a 1600px hero, a
256px logo, four 800px cards and a 600px portrait. No tenant data, no
Production or Staging asset, is used anywhere in here.

## What each script answers

| script | question |
| --- | --- |
| `perf-load.mjs` | cold and warm LCP, FCP, hero paint, and the Storage bytes a first and second visit cost |
| `perf-tabswitch.mjs` | does pressing a tab refetch media the session already has? (per-press, not per-total) |
| `perf-prefetch.mjs` | is warming the next tab worth it, does it ever duplicate a request, and does Save-Data stop it? |
| `perf-hero-hint.mjs` | is `<link rel=preload>` still worth anything once the hero `<img>` is already eager? |
| `browser-qa.mjs` | 7 widths x 2 engines x 2 products x 3 locales: overflow, bottom-nav anchoring, direction, mirroring, broken images, and whether each render matches its box |

`browser-qa.mjs` streams one NDJSON line per cell, so a long run stays
observable and a crash does not lose what it already measured.

## Three things the harness itself got wrong first

Recorded because each one would have produced a confident, false number.

1. **Tab switches modelled as navigations.** `page.goto` between three
   documents re-parses the HTML and re-discovers every image, which made
   tab navigation look like it refetched media. Driven as the React state
   switch it actually is, revisiting a tab costs zero requests — and did
   before CP4 too. An earlier CP4 note claiming "8 → 4" came from this
   mistake.
2. **Counting requests in the page.** Playwright's `request` event fires
   for cache hits, so browser-side counts showed no change while warm
   LCP collapsed. The harness keeps server-side counters at `/__stats`
   and those are the numbers reported.
3. **Grading renders per screen.** These apps are one document, so an
   image already fetched for a large box is reused for a small one — the
   teacher's portrait is both the 150px About photo and the 36px nav
   avatar. Flagging that as "oversized" was penalising a saved download;
   the grader now carries the largest box per source across the cell.
