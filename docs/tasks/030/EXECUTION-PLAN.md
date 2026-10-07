# TASK 030 — execution plan (PLANNING ONLY)

Written at the close of TASK 029. **No application code for any of this
has been written.** Nothing here is implemented, and nothing here should
be started until the owner opens the pack.

Baseline assumed: `main` at `fb9a14b`, migration head **0033** on both
Production and Staging, and `fix/029-studio-defects` merged first. Every
estimate below assumes 029 lands before 030 begins, because three of the
four workstreams touch files 029 changed.

---

## The four workstreams

| # | Workstream | Migration? | Touches | Parallel-safe with |
|---|---|---|---|---|
| **W1** | Populate Lena's Flow retreat "Return to Balance" | **No** | Production content only | W2, W3, W4 |
| **W2** | Teach — My Retreats module | **Yes, 0034** | Teach Studio, Teach Guest, publish_space, i18n ×5 | W3, W4 |
| **W3** | My Spaces hero-image fallback | No | `app/(site)/space/page.tsx`, image resolution | W1, W2, W4 |
| **W4** | My Spaces navigation feedback | No | shared Back control, both Studios | W1, W2, W3 |

**Dependency note:** only W2 carries a migration, so only W2 is gated on
the migration-before-code ordering that 0033 established. W3 and W4 are
pure front-end and can land in any order. W1 is data entry and depends on
no code at all — but it is the one that writes **Production** content, so
it needs its own authorization and its own gate.

**Critical ordering inside W2:** migration 0034 must reach Production
**before** the app code that reads the new shape, exactly as 0033 did.
`publish_space()` must be restated whole, and the conditional-key
discipline from 0033 applies: a Space with no retreats must publish a
byte-identical snapshot to what it produces today, or every existing
Teach snapshot changes for no reason.

---

## W1 — Populate Lena's "Return to Balance"

**Scope.** Enter the owner-approved content into the existing Production
Flow Space `a535bf4d-ea7d-4970-9240-c4b8db5fb961` (`teacherexample`)
through the normal Studio, then publish.

**Not in scope.** No schema change, no new modules, no code.

**Prerequisites.**
- The approved content, in final form, from the owner. It does not exist
  in the repository today.
- An authenticated Production Studio session. TASK 029 established the
  only workable route: the owner signs in in their own browser and the
  agent drives it. Budget this explicitly — it was the single recurring
  blocker of 029.

**Risks.**
- This is Lena's **real** Space. Every prior task has carried "do not
  modify Lena"; W1 is the first that deliberately does. The guard rails
  invert, so they must be restated: capture a full pre-edit snapshot
  (`modules` md5, `published_at`, every module's row count) before the
  first keystroke, and diff after.
- Publishing overwrites the live Guest App. Rollback is re-publishing the
  previous draft, which is **not** the same as restoring the snapshot —
  worth rehearsing on Staging first.

**Gate.** Owner approval of the content itself, then a Production content
gate. Not a code release.

---

## W2 — Teach: My Retreats module

The only substantial engineering package. A teacher lists the retreats
they run: multiple retreats, each with location, dates, duration, price,
registration method, external links, an optional link to an InnerDweS
Flow Space, and a cover image.

### Data model

Follow the generic module storage 029 already uses — `module_items` keyed
`moduleKey = 'teachRetreats'` — rather than a dedicated table. Schedule is
the only dedicated table in the product and it earned that by being
queried by date; retreats are a flat list read as a whole.

Per item: `title`, `location`, `startDate`, `endDate`, `durationLabel`,
`priceAmount`, `priceCurrency`, `registrationMethod`
(`external` | `email` | `whatsapp` | `innerdwes`), `registrationTarget`,
`flowSpaceId` (nullable), `imageRef`, `enabled`, `sortOrder`.

**Open product questions — ask before building, do not assume:**
1. Can a retreat span months, or is it always a single date range?
2. Is price a single number, or a range / "from" price / multiple tiers?
3. When `registrationMethod = innerdwes`, does the card deep-link to the
   Flow Guest App, or embed its summary?
4. Do past retreats disappear automatically, or does the teacher archive
   them by hand?

Question 4 in particular changes the data model: automatic expiry needs a
date-aware read, which is what pushed Schedule into its own table.

### Migration 0034

- Nothing new structurally if `module_items` is reused — but
  `publish_space()` must be restated whole to emit `teachRetreats`, and
  `build_teach_payload()` with it.
- **Conditional emission is mandatory**: no key when the module is absent
  or empty, so existing Teach snapshots stay byte-identical. 0033's
  `jsonb_pick` is the precedent and the tool.
- `publishSpaceRegression.test.ts` must be extended **before** the
  migration is written, so the guard exists while the change is made.

### Application

- Teach Studio: a new section following the `collapsible-item-row`
  pattern — which, after 029, means real 44×44 tiled controls, not
  pseudo-element hit areas.
- Teach Guest: an Explore card plus a list and detail screen. Titles go
  through the two-line clamp 029 introduced.
- i18n: roughly 35–45 new keys **× 5 locales**, in both namespaces as
  needed. `interpolationCallSites.test.ts` and the parity tests will
  enforce the shape; the *wording* needs the same contextual review 029
  ran, and the glossary gets a new row per term.
- Hebrew, German, Spanish and French wordings are **AI-drafted until a
  native speaker reviews them** — carry 029's caveat forward rather than
  quietly dropping it.

### Testing

- Unit: schema parse/validate, sort-order persistence, registration-method
  validation, price formatting per locale (`Intl.NumberFormat`).
- Publish: snapshot byte-equality for a Space with no retreats; correct
  emission for one with retreats.
- Browser: Studio CRUD and reorder (reusing `reorder-hit-area.mjs`), Guest
  list and detail at the full width matrix 320→1440 in five locales.
- Regression: every existing Teach snapshot still renders.

**Estimate.** The largest of the four. Migration + Studio + Guest + 200+
translated strings + the QA matrix.

---

## W3 — My Spaces hero-image fallback

**Chain:** Teach hero → profile image → module/brand image → generic
placeholder.

**Where.** `app/(site)/space/page.tsx` and whatever resolves the card
image today. Pure resolution logic, no schema.

**Design note.** Make the chain a single pure function with a declared
order and unit-test each rung, rather than a chain of `??` at the call
site. The bug this prevents is a half-broken middle rung that silently
falls through to the placeholder and looks deliberate.

**Testing.** Unit tests per rung (each present / each missing); a visual
check of My Spaces with a Space at each rung. No migration, no release
gate beyond the normal one.

---

## W4 — My Spaces navigation feedback

Pressed and loading feedback for Back navigation, consistent across Teach
and Flow.

**Where.** The shared Back control used by both Studios.

**Design note.** 029 already built this pattern for the top-bar Republish:
`disabled` + `aria-busy` + a visible pending label, driven by
`useTransition`, with the pressed state distinct from the loading state.
Reuse it rather than inventing a second idiom — and reuse its test, which
asserts a second click cannot double-submit.

**Testing.** Unit test on the shared control; browser check that Back
shows feedback and cannot be double-fired. Small, self-contained, and the
natural first thing to land.

---

## Suggested sequencing

```
Gate 0  merge fix/029-studio-defects                     (release gate)
   |
   +-- W4  navigation feedback      small, independent ──┐
   +-- W3  hero-image fallback      small, independent ──┤ land together
   |                                                     │
   +-- W1  Lena content             needs owner content + Production session
   |
   +-- W2  My Retreats
        1. product questions answered
        2. publish regression test extended
        3. migration 0034 -> Staging -> verify
        4. app code + i18n
        5. full QA matrix
        6. migration 0034 -> Production  (before app code)
        7. app code -> Production
```

W3 and W4 are parallel-safe with everything and with each other — they
touch different files. W2 should not start until its four product
questions are answered, because two of them change the data model.

## Release gates and rollback

| Workstream | Gate | Rollback |
|---|---|---|
| W1 | Owner approval of the content; Production content gate | Re-publish the previous draft. **Rehearse on Staging first** — republishing is not snapshot restoration. |
| W2 | Standard release gate **plus** the 0033-style migration gate: baseline fingerprints, apply to Production before app code, verify `publish_space` md5 and snapshot byte-equality | Rehearsed SQL rollback script for 0034, written with the migration, not after. Physical restore is not a rollback path — PITR is off. |
| W3 | Standard release gate | Revert the commit |
| W4 | Standard release gate | Revert the commit |

## Explicitly out of scope

- **Billing** — its own workstream. W2 touches price *display* only; it
  must not read, write or imply anything about `space_entitlements`.
- **Legal / Infra** — separate.
- Native-speaker localization review — needed, but it is a review task
  with no code, and it should not gate W3 or W4.

## Carried over from TASK 029

1. **Authenticated Staging QA is unsolved.** It blocked C8–C13 twice. W2
   needs real Studio QA, so solve the credential path *before* W2 starts,
   not during it.
2. **No locale has had native-speaker review.**
3. The Production QA Space `qa029check` holds 1 of 15 owner slots and its
   complimentary entitlement expires **2026-10-14**.
4. This automation layer does not deliver clicks within ~60px of the
   viewport's left edge — budget for it in any new browser harness.
