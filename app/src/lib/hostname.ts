import { isReservedSlug, slugFormatError } from "@/lib/slug";

/**
 * Centralized hostname resolution - Domain Phase 2. This is the ONLY place
 * in the app that interprets the Host header; proxy.ts calls classifyHostname
 * once per request and acts on the result. Nothing else should parse
 * hostnames on its own. Pure, framework-free functions - takes a plain
 * string, returns a plain discriminated union - so this is fully unit-
 * testable without a running server or a real request object, and doesn't
 * care whether the caller got the value from a real request, a curl -H
 * override, or a test fixture.
 *
 * Production topology (not yet live - see the Domain Phase 2 report for
 * what's still required before DNS cutover):
 *   innerdwes.com          -> marketing (canonical)
 *   www.innerdwes.com      -> redirects to the apex (see proxy.ts)
 *   app.innerdwes.com      -> Time to Flow Studio (organizer auth, My
 *                              Spaces, configurator, publish)
 *   <slug>.innerdwes.com   -> the published Guest Space for that slug,
 *                              looked up the exact same way /s/[slug]
 *                              already does - the hostname is a lookup
 *                              key only, never an authorization decision.
 *   anything else under
 *   *.innerdwes.com        -> fails closed (see the "blocked" kind below
 *                              and proxy.ts) - never falls through to
 *                              marketing content.
 */

export const PRODUCTION_APEX = "innerdwes.com";
export const PRODUCTION_WWW = "www.innerdwes.com";
export const PRODUCTION_APP = "app.innerdwes.com";

export type HostnameKind =
  | { kind: "marketing-apex" }
  | { kind: "marketing-www" }
  | { kind: "app" }
  | { kind: "guest"; slug: string }
  | { kind: "localhost" }
  | { kind: "netlify-preview" }
  /** Recognizably under the production innerdwes.com namespace (matches
   * the apex suffix) but not a valid target: a reserved/infrastructure
   * word, a malformed label, or a multi-level subdomain. Deliberately
   * distinct from "unknown" - proxy.ts fails these closed (404) rather
   * than letting them fall through to the marketing homepage, per the
   * Domain Phase 2 hardening requirement. */
  | { kind: "blocked" }
  /** Not recognizably part of the innerdwes.com namespace at all (an
   * unrelated domain, or a missing/empty Host header). No special
   * handling - ordinary routing applies, exactly as it did before this
   * module existed. */
  | { kind: "unknown" };

/**
 * Strips a port suffix and normalizes case - the only pre-processing every
 * classification path shares. Returns null for an empty/missing Host
 * header (malformed request) rather than throwing, so callers can fail
 * safely with a single check.
 */
function normalizeHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0]?.trim().toLowerCase();
  return host ? host : null;
}

export function classifyHostname(hostHeader: string | null | undefined): HostnameKind {
  const host = normalizeHost(hostHeader);
  if (!host) return { kind: "unknown" };

  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost")) {
    return { kind: "localhost" };
  }

  // Every Netlify preview/draft/branch deploy shares this suffix - the
  // specific hash or branch prefix varies per deploy, the suffix doesn't.
  if (host.endsWith(".netlify.app")) {
    return { kind: "netlify-preview" };
  }

  if (host === PRODUCTION_APEX) return { kind: "marketing-apex" };
  if (host === PRODUCTION_WWW) return { kind: "marketing-www" };
  if (host === PRODUCTION_APP) return { kind: "app" };

  const apexSuffix = `.${PRODUCTION_APEX}`;
  if (host.endsWith(apexSuffix)) {
    const label = host.slice(0, -apexSuffix.length);

    // Defense in depth against a spoofed/malformed Host header, not just a
    // format nicety: a label containing another dot (e.g. a Host of
    // "foo.bar.innerdwes.com" or an attempted
    // "evil.innerdwes.com.attacker.com" trick that still happens to end in
    // the right suffix), an empty label, a reserved infrastructure word,
    // or anything that wouldn't pass the exact same format check the
    // database enforces on slugs is never treated as a guest lookup - it's
    // "blocked" instead, so nothing downstream ever constructs a lookup or
    // a redirect from unvalidated attacker-controlled input, and proxy.ts
    // fails it closed rather than serving marketing content for it.
    if (!label || label.includes(".") || isReservedSlug(label) || slugFormatError(label)) {
      return { kind: "blocked" };
    }
    return { kind: "guest", slug: label };
  }

  return { kind: "unknown" };
}
