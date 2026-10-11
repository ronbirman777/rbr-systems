/**
 * The draft objects a module_items row references: its image_ref and, for
 * audio items, metadata.audioRef. TASK 032.5 W0: Flow item deletion used to
 * clean up only image_ref, leaking the draft recording. Callers still pass
 * the result through removeDraftObjects, which keeps only this tenant's
 * draft paths (never published.* objects).
 */
export function rowDraftRefs(row: { image_ref?: unknown; metadata?: unknown } | null | undefined): string[] {
  if (!row) return [];
  const refs: string[] = [];
  if (typeof row.image_ref === "string") refs.push(row.image_ref);
  const audioRef = (row.metadata as { audioRef?: unknown } | null | undefined)?.audioRef;
  if (typeof audioRef === "string") refs.push(audioRef);
  return refs;
}
