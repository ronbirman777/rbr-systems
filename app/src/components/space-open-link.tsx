"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Task 011 (item D): the immediate, local half of Space-opening feedback -
 * acknowledges the tap and blocks a second one before Next.js's own
 * route-level loading.tsx (configurator/retreat/[tenantId]/loading.tsx)
 * even has a chance to mount, and before the (potentially slow, over a
 * real network) navigation itself resolves. `useTransition` marks the
 * navigation as non-blocking (matches how Next's own Link normally
 * behaves) while still giving this component a reliable `isPending` flag
 * to disable itself with - a plain onClick + router.push alone wouldn't
 * expose that.
 *
 * If navigation fails, `startTransition`'s pending state clears on its
 * own once the attempt settles (it does not hang indefinitely) - so this
 * never traps the user behind a disabled control.
 */
export function SpaceOpenLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  return (
    <a
      href={href}
      className={className}
      aria-disabled={isPending || clicked}
      style={(isPending || clicked) ? { pointerEvents: "none", opacity: 0.6 } : undefined}
      onClick={(e) => {
        e.preventDefault();
        if (isPending || clicked) return;
        setClicked(true);
        startTransition(() => {
          router.push(href);
        });
      }}
    >
      {children}
    </a>
  );
}
