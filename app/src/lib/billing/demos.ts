import { GUEST_PUBLIC_ORIGIN } from "@/lib/site-url";

/**
 * The live sales demos are the EXISTING published Guest Apps - no duplicate demo
 * application. Referenced by their stable public slugs (never a preview alias,
 * never a deployment URL). Guest routes only: no link here can expose Studio or
 * any configuration tool.
 */
export const DEMO_SPACE_SLUGS = { teach: "teacherexample", retreat: "example" } as const;

export function demoUrl(spaceType: "teach" | "retreat"): string {
  return `${GUEST_PUBLIC_ORIGIN.replace(/\/$/, "")}/s/${DEMO_SPACE_SLUGS[spaceType]}`;
}
