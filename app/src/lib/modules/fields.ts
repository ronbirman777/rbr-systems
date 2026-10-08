import { z } from "zod";

/**
 * The zod field primitives every module's metadata schema is built from.
 *
 * These live here, and not inside a product's schema file, for one
 * reason: Time to Teach and Time to Flow must validate the SAME field the
 * same way. A reading's `category` is capped at 60 characters and trimmed
 * to null when blank in both products, or the two drift and a Space that
 * round-trips through the wrong one silently changes shape. Keeping the
 * definition in a single place makes that drift impossible rather than
 * merely unlikely.
 *
 * Moved verbatim out of lib/teach/schemas.ts (where `optText` and the ISO
 * date regex were first written) so that lib/modules/* never has to import
 * from lib/teach/* - the dependency has to point this way, since Flow
 * content cannot depend on Teach.
 */

/** Optional free text: trimmed, empty -> null, length-capped. */
export const optText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => {
      const t = v?.trim();
      return t ? t : null;
    });

/** A calendar date with no time or zone, "YYYY-MM-DD". */
export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Whether "YYYY-MM-DD" names a real calendar day. `isoDateString` only
 * checks the shape, so "2027-02-31" passes it; this rejects such dates
 * without ever constructing a Date from the local zone (the day is
 * rebuilt in UTC and compared field by field).
 */
export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d, 12));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** A real calendar date, "YYYY-MM-DD". */
export const calendarDateString = isoDateString.refine(isValidIsoDate, "Not a real calendar date.");
