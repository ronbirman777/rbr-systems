import { createClient } from "@/lib/supabase/server";
import { hasRecoveryFlowContext } from "@/lib/supabase/recovery";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { UpdatePasswordForm } from "../recovery-form";

/**
 * Task 012. Reads cookies/session on every request - never statically
 * cached, matching the same `force-dynamic` convention already used on
 * /space (Task 011) for exactly the same reason: a stale cached render
 * of an authenticated/recovery-specific page must never be served from
 * the browser's back-forward cache or any edge cache after the recovery
 * context that produced it is gone.
 */
export const dynamic = "force-dynamic";

/**
 * Task 012 requirement: "`/reset-password` must validate the user on the
 * server with `getUser()` before rendering a usable form. A direct
 * unauthenticated visit has no usable recovery session and shows a
 * request-new-link state." An ordinary already-signed-in session (valid
 * `getUser()`, but no recovery-flow-context cookie for that exact user -
 * see lib/supabase/recovery.ts) gets the identical request-new-link
 * state, not a silent "change your password" account-settings screen -
 * UI visibility here is not authorization either way; `updatePassword()`
 * (recoveryActions.ts) independently repeats both checks itself.
 *
 * Deliberately always renders the SAME `<UpdatePasswordForm>` element
 * here - never a top-level `if` that swaps in a differently-shaped
 * "request a new link" component instead. Confirmed directly (real
 * browser, Next.js's own documented behavior - see the long comment on
 * `hadInitialRecoveryContext` in recovery-form.tsx) that Next.js re-
 * renders a page's own Server Component tree whenever ANY Server Action
 * invoked from it sets/deletes a cookie - including the later, expected
 * local-sign-out cleanup that legitimately runs once the password update
 * succeeds. If this page's own top-level conditional depended on that
 * same live cookie state, that later, entirely-successful cleanup would
 * unmount the form (and its "your password was updated" success message)
 * out from under the user, replacing it with "request a new link" a
 * moment after the real success was already shown - reproduced directly
 * before this structure existed. Passing the server-verified snapshot
 * down as a prop that the client component reads exactly once keeps this
 * page's own initial gate intact while never letting a later, expected
 * cookie mutation erase an already-rendered result.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasContext = user ? await hasRecoveryFlowContext(user.id) : false;

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm">
        <InnerDweSMark size={28} className="mb-6" />
        <UpdatePasswordForm hadInitialRecoveryContext={!!user && hasContext} />
      </div>
    </main>
  );
}
