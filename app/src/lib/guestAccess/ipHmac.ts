import "server-only";
import { headers } from "next/headers";

/**
 * Server-only, keyed (HMAC) pseudonymization of the guest's request IP -
 * never the raw IP is stored (guest_access_ip_attempts.ip_hmac), and
 * never a plain/unsalted hash (plain SHA-256 of an IP is practically
 * reversible - the IPv4 space is small enough to rainbow-table - flagged
 * explicitly in the migration review). A keyed HMAC with a secret that
 * never leaves the server is the fix.
 *
 * Deployment reality this project actually runs on (confirmed via
 * `.netlify/` + proxy.ts/hostname.ts's own Netlify-preview handling -
 * this is a Netlify deployment, not Vercel): Netlify's edge sets
 * `x-nf-client-connection-ip` on every request that reaches a Next.js
 * Runtime function - this header is written by Netlify's own proxy
 * layer and cannot be set or overridden by the client; any value an
 * inbound request tries to supply for it is discarded before the
 * function sees it. That is the trusted source here, NOT a blind read
 * of `x-forwarded-for` - a generic `x-forwarded-for` can accumulate
 * multiple hops and, depending on proxy configuration, isn't guaranteed
 * to have its client-supplied entries stripped the same way Netlify's
 * own dedicated header is. `x-forwarded-for`'s first entry is kept only
 * as a fallback for local `next dev` (where no Netlify edge sits in
 * front of the request at all, so neither header may be present) -
 * never as the primary trusted source in a deployed environment.
 */

class MissingIpHmacSecretError extends Error {
  constructor() {
    super(
      "GUEST_ACCESS_IP_HMAC_SECRET is not set. Per-IP guest-access rate limiting cannot derive a " +
        "pseudonymous identifier without it - add it to your environment rather than allowing this " +
        "to silently skip throttling."
    );
    this.name = "MissingIpHmacSecretError";
  }
}

function getIpHmacSecret(): string {
  const secret = process.env.GUEST_ACCESS_IP_HMAC_SECRET;
  if (!secret) throw new MissingIpHmacSecretError();
  return secret;
}

/** Exported for direct unit testing - the header-precedence logic is the
 * part most worth pinning down with tests; deriveRequestIpHmac() itself
 * needs a real next/headers request context to call. */
export function resolveTrustedIp(h: Headers): string {
  const netlifyIp = h.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp.trim();

  // Fallback only - not present/trustworthy the same way in every
  // environment, but the best available signal in local dev where no
  // Netlify edge sits in front of the request.
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  // No usable header at all (e.g. a bare `next dev` request with
  // neither set) - a fixed placeholder still gets hashed and rate-
  // limited consistently, it just can't distinguish individual local
  // requesters. Never throw here - a missing IP header must not break
  // the guest route, only degrade the granularity of the throttle.
  return "unknown";
}

export async function deriveRequestIpHmac(): Promise<string> {
  const h = await headers();
  const ip = resolveTrustedIp(h);
  const secret = getIpHmacSecret();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
