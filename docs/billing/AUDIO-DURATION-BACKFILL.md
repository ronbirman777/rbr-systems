# Audio duration provenance backfill (TASK 032, migration 0046)

## Why

From migration 0046 a paid (enforced: paid, non-exempt) Space can publish an attached recording only when the server measured that exact file. The measurement is recorded as server provenance in `public.billing_audio_verifications`: the file ref, the whole-second length, and the size and sha256 of the measured bytes. The Studio finalize path writes it on every new upload (`billing_audio_attach_verified`).

Audio attached before 0046 has no provenance row. On a paid Space, `publish_space()` refuses it with hint `AUDIO_UNVERIFIED`. The same applies to a direct `published_spaces` write. There are two ways to fix this:

1. The owner uploads the file again, so it goes through the finalize path. This always works.
2. An operator runs `app/scripts/audio-duration-backfill.mjs`. The script re-measures every attached file on the server and stamps provenance where the stored length is correct.

Legacy Spaces (no billing row) and exempt Spaces are not enforced. They are never inspected and never affected.

## What the script does

For every attached audio file on every enforced Space, the script:

1. downloads the stored draft with the service role;
2. measures it with the Studio's own parser (`src/lib/media/audioDuration.ts`, rounded to whole seconds as at attach);
3. computes its size and sha256;
4. compares an existing published sibling's bytes with the draft's;
5. prints one line per file: Space, item, stored duration, re-measured duration, size, provenance status and verdict. Provenance status is `verified`, `stale` or `none`.

| Verdict | Meaning | What `--apply` does |
|---|---|---|
| `ok` | stored length = server measurement, and any published sibling holds the same bytes | stamps provenance (`source = 'backfill'`, run id) |
| `mismatch` | stored length differs from the measurement | records an audit row with the stored value as found; stamps nothing; the duration is NOT changed |
| `unmeasurable` | the object exists but its length cannot be determined, or the ref is not a versioned draft audio ref of that item | audit row only |
| `missing_object` | the draft is not in Storage | audit row only |
| `published_mismatch` | a published copy exists whose bytes differ from the draft | audit row only |

Only `ok` is ever stamped. Everything else stays unpublishable on that Space until the owner uploads the file again. The script never deletes, uploads, moves or overwrites media. It never writes `module_items`, and it never changes a duration.

**`--apply`** works as follows:

- It runs only after the dry-run report.
- It runs on Staging only. `scripts/stagingGuard.mjs` refuses any URL other than the Staging project's, the Production ref, and any key that is not a Staging service-role key, before a client exists.
- It uses one run id (`bf-YYYYMMDD-xxxxxxxx`).
- It calls `billing_audio_backfill_record()` once per file that is not already verified. Under the same per-Space lock as the attach trigger, that function re-reads the row. It stamps only if the row's current ref and stored length still equal what was measured (a changed row gives `skipped_changed`). It writes one row in `billing_audio_backfill_findings` per call.

Counts are asserted at three points:

- **Before writing:** a second inspection must return the same files and verdicts, or nothing is written.
- **After writing:** the number of audit rows for the run must equal the number of calls.
- **After writing:** the number of provenance rows carrying the run id must equal the number of stamps the database reported. That is never more than the number of `ok` verdicts.

```
cd app
SUPABASE_URL=<staging url> SUPABASE_SECRET_KEY=<staging service-role key> node scripts/audio-duration-backfill.mjs            # dry run
SUPABASE_URL=<staging url> SUPABASE_SECRET_KEY=<staging service-role key> node scripts/audio-duration-backfill.mjs --apply    # Staging only
... --tenant <uuid>     # one Space only
```

The script needs Node 23.6 or later, because it imports the TypeScript parser directly. The key comes only from the environment and is never printed.

## Staging procedure

1. 0046 is applied to Staging under its own authorisation, and the matching application is deployed to the `staging` environment.
2. Dry run. Keep the output; it contains Space and item ids only, no personal data.
3. Review every non-`ok` line with the Space owner (synthetic QA Spaces: the QA owner).
4. `--apply` once. Check that the script ends with `done: run <id>`. If it reports `COUNT ASSERTION FAILED`, stop and review. Provenance rows are additive, and a re-run skips rows that are already verified.
5. Run the dry run again: every `ok` file should now show `provenance=verified`.

## Production procedure (plan only; requires explicit owner authorisation)

**Today Production has no paid Spaces.** No `space_subscriptions` row exists before 0036, and paid checkout stays OFF until launch. On Production the backfill is therefore a no-op before launch. It would list nothing, because no Space is enforced. Lena, Return to Balance and the internal/QA Spaces are legacy or exempt, so they are not enforced and not affected.

If a paid Space ever exists on Production with pre-0046 audio (for example, 0046 applied after launch):

1. **Dry run first, read-only.** The script as written refuses Production by design (Staging guard). A Production run needs a separate, explicitly authorised task. That task would either run a read-only variant of this script with a Production-specific guard, or reproduce the report with read-only queries plus service-role downloads.
2. **Owner approval** of the dry-run report, file by file.
3. Stamping, if approved, goes only through `billing_audio_backfill_record()` (audited, run-scoped, count-asserted). Never through direct inserts into `billing_audio_verifications`.
4. **No media modification:** no delete, upload, overwrite or move of any object, and no change to any `durationSeconds`. Files with a mismatch or that cannot be measured are reported to their owner, who uploads them again.
5. Record the run id, counts and approval in the release notes.

## Rollback

The 0046 rollback drops both tables, which removes all provenance and the backfill audit rows. Export the findings first if needed (see the rollback file header). After 0046 is re-applied, existing paid-Space audio is unverified again until it is uploaded again or backfilled.

## Tests

- `app/scripts/audioBackfillCore.test.ts`: verdict and provenance logic, arguments, run id and apply plan, plus a static safety audit of the script (guard before client, no media/item write calls, count assertions).
- Database side of the recorder: `rehearse-billing-rollback.sh` step 4c, checks 13-17 (stamp only on match, flag mismatch with the stored length kept, skip a stale read, one audit row per call).
- Staging: `billing-db-verify.mjs` P9.
