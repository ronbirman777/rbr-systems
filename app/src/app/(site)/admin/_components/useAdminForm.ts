"use client";

import { startTransition, useActionState, useCallback, useRef, type FormEvent } from "react";
import type { AdminActionResult } from "../billing/actions";

type Act = (prev: AdminActionResult | null, fd: FormData) => Promise<AdminActionResult>;

/**
 * useActionState for Admin forms that must survive a step-up re-verify.
 *
 * - Submits through onSubmit + startTransition instead of `<form action>`: React resets every uncontrolled field
 *   after a `<form action>` submission, which wiped what the admin typed when the server answered
 *   "step_up_required". Native constraint validation still runs (the submit event only fires on a valid form).
 * - Remembers the FormData of the last submission so `retry()` can re-send exactly that request once the inline
 *   step-up box has verified a fresh code. The server action re-authorises everything (admin row, AAL2, recent
 *   MFA timestamp) on the retry; nothing is trusted from the client.
 */
export function useAdminForm(action: Act) {
  const [state, dispatch, pending] = useActionState<AdminActionResult | null, FormData>(action, null);
  const last = useRef<FormData | null>(null);

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      const fd = submitter ? new FormData(e.currentTarget, submitter) : new FormData(e.currentTarget);
      last.current = fd;
      startTransition(() => dispatch(fd));
    },
    [dispatch],
  );

  const retry = useCallback(() => {
    const fd = last.current;
    if (fd) startTransition(() => dispatch(fd));
  }, [dispatch]);

  return { state, pending, onSubmit, retry };
}
