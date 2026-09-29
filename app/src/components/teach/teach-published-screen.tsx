import { parsePublishedTeachSpace, type PublishedTeachRow } from "@/lib/teach/guestData";
import { TeachGuestApp } from "./teach-guest-app";

/**
 * Time to Teach counterpart of PublishedSpaceScreen: renders a Teach Space's
 * published snapshot (published_spaces only - never private tables). Every
 * field is re-validated by parsePublishedTeachSpace before it reaches the UI.
 */
export function TeachPublishedSpaceScreen({ space }: { space: PublishedTeachRow }) {
  const data = parsePublishedTeachSpace(space);
  return (
    <div className="flex-1 flex flex-col w-full">
      <TeachGuestApp data={data} />
    </div>
  );
}
