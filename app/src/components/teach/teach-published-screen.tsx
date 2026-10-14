import { parsePublishedTeachSpace, type PublishedTeachRow, type TeachGuestData } from "@/lib/teach/guestData";
import { checkFlowGuestUrl } from "@/lib/teach/flowLinkServer";
import { TeachGuestApp } from "./teach-guest-app";
import { GuestDesktopShell } from "@/components/guest/guest-desktop-shell";
import { guestMessages } from "@/lib/i18n/guestMessages";

/**
 * A retreat's linked InnerDweS Flow Space is checked AGAIN here, on every
 * render of the public page, not just when the teacher saved it. A Space
 * can be unpublished, lapse, or move behind an access code after the
 * teacher linked it, and the snapshot would still carry the old address.
 * An address that no longer names a public Flow Space is dropped (the
 * retreat itself still shows); a good one is replaced by its canonical
 * form. The check reuses the Guest App's own access resolution - nothing
 * is widened - and is memoised per request, so a page with several
 * retreats costs one lookup per distinct link.
 */
async function withVerifiedFlowLinks(data: TeachGuestData): Promise<TeachGuestData> {
  if (!data.retreats.some((r) => r.metadata.flowGuestUrl)) return data;
  const retreats = await Promise.all(
    data.retreats.map(async (r) => {
      if (!r.metadata.flowGuestUrl) return r;
      const check = await checkFlowGuestUrl(r.metadata.flowGuestUrl).catch(() => null);
      return { ...r, metadata: { ...r.metadata, flowGuestUrl: check && check.ok ? check.canonicalUrl : null } };
    })
  );
  return { ...data, retreats };
}

/**
 * Time to Teach counterpart of PublishedSpaceScreen: renders a Teach Space's
 * published snapshot (published_spaces only - never private tables). Every
 * field is re-validated by parsePublishedTeachSpace before it reaches the UI.
 */
export async function TeachPublishedSpaceScreen({ space }: { space: PublishedTeachRow }) {
  const data = await withVerifiedFlowLinks(parsePublishedTeachSpace(space));
  // TASK 033: the same shared desktop Guest shell as Time to Flow - a
  // centred phone-width column from 640px up, unchanged on a phone.
  return (
    <GuestDesktopShell brand={data.brand} locale={data.locale} loadingProduct="teach" loadingBackground={data.settings.teachStyle.background ?? null}>
      <TeachGuestApp data={data} messages={guestMessages(data.locale)} />
    </GuestDesktopShell>
  );
}
