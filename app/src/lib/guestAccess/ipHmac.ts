import "server-only";
import { headers } from "next/headers";

/**
 * Server-only, keyed (HMAC) pseudonymization of the guest's request IP -
 * the raw IP is never stored (guest_access_ip_attempts.ip_hmac), and
 * never a plain/unsalted hash (plain SHA-256 of an IP is practically
 * reversible - the IPv4 space is small enough to rainbow-table - flagged
 * explicitly in the migration review). A keyed HMAC with a secret that
 * never leaves the server is the fix.
 *
 * DEPLOYMENT CONTRACT: Vercel (CLAUDE.md section 3). Vercel is the
 * production and preview platform; Netlify is legacy and no runtime
 * behavior may depend on it.
 *
 * Trusted source: `x-vercel-forwarded-for`. Vercel's own edge sets this
 * header on every request that reaches the application, and because it
 * lives in Vercel's reserved `x-vercel-*` namespace the platform
 * overwrites it - a value an inbound client tries to supply for it does
 * not survive to the function. That property is what makes it usable as
 * a rate-limit identity.
 *
 * Deliberately NOT trusted in a deployed environment: `x-forwarded-for`,
 * `x-real-ip`, and any `x-nf-*` header. A generic `x-forwarded-for`
 * accumulates hops and its leftmost entry is exactly the part a client
 * can prepend, so trusting it would let one attacker mint a fresh
 * rate-limit identity per request and brute-force a six-digit access
 * code. `x-forwarded-for` is consulted ONLY when the runtime is
 * demonstrably not Vercel (local `next dev`), and that path is selected
 * by the runtime marker - never merely because the Vercel header is
 * missing on a deployed request.
 *
 * Fail-closed: when a trusted IP cannot be established on Vercel,
 * deriveRequestIpHmac() returns null and the caller must abandon the
 * request before the rate-limit RPC, before code verification and
 * before issuing a cookie. There is deliberately no shared "unknown"
 * bucket - collapsing every unidentifiable client into one constant
 * identity would make the throttle meaningless for exactly the requests
 * that are hardest to attribute.
 */

/** Vercel's own edge-controlled client-IP header. */
export const VERCEL_TRUSTED_IP_HEADER = "x-vercel-forwarded-for";

/** Loopback identity used only on a demonstrably local, non-Vercel runtime. */
const LOCAL_DEV_FALLBACK_IP = "127.0.0.1";

export type TrustedIpResolution =
  | { ok: true; ip: string; source: "vercel" | "local" }
  | { ok: false; reason: "missing" | "malformed" };

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

/**
 * Vercel sets `VERCEL=1` in every deployed runtime (production, preview
 * and `vercel dev`). Only the absence of that marker selects the local
 * development path, so a deployed request can never fall back to
 * client-supplied forwarding data.
 */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^[0-9]{1,3}$/.test(part)) return false;
    // Reject leading zeros: "010" is ambiguous (octal in some parsers)
    // and never the canonical form of a real client address.
    if (part.length > 1 && part.startsWith("0")) return false;
    return Number(part) <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  // A zone index ("%eth0") is valid syntax but never meaningful for a
  // remote client address; accept at most one and validate the address.
  const zoneParts = value.split("%");
  if (zoneParts.length > 2) return false;
  const address = zoneParts[0];
  if (!address || !address.includes(":")) return false;

  const halves = address.split("::");
  if (halves.length > 2) return false;

  const parseGroups = (segment: string): string[] | null => {
    if (segment === "") return [];
    const groups = segment.split(":");
    return groups.some((group) => group === "") ? null : groups;
  };

  const head = parseGroups(halves[0] ?? "");
  if (head === null) return false;
  const tail = halves.length === 2 ? parseGroups(halves[1] ?? "") : [];
  if (tail === null) return false;

  const groups = [...head, ...tail];
  let groupCount = groups.length;

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i] as string;
    if (group.includes(".")) {
      // An IPv4-mapped tail ("::ffff:192.0.2.1") occupies the final two groups.
      if (i !== groups.length - 1) return false;
      if (!isValidIpv4(group)) return false;
      groupCount += 1;
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return false;
  }

  // "::" compresses at least one group; without it every group must be present.
  return halves.length === 2 ? groupCount <= 7 : groupCount === 8;
}

function isValidIpLiteral(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}

/**
 * Reads the leftmost entry of a comma-separated forwarding header.
 * Returns null when the header is absent or carries no non-empty entry.
 */
function firstForwardedEntry(raw: string | null): string | null {
  if (raw === null) return null;
  const first = raw.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * Exported for direct unit testing - the trust decision is the part most
 * worth pinning down, and deriveRequestIpHmac() itself needs a real
 * next/headers request context to call. `runtime` is passed explicitly
 * so a test never has to mutate the ambient environment to exercise both
 * the deployed and the local path.
 */
export function resolveTrustedIp(h: Headers, runtime: { isVercel: boolean }): TrustedIpResolution {
  if (runtime.isVercel) {
    const candidate = firstForwardedEntry(h.get(VERCEL_TRUSTED_IP_HEADER));
    if (candidate === null) return { ok: false, reason: "missing" };
    if (!isValidIpLiteral(candidate)) return { ok: false, reason: "malformed" };
    return { ok: true, ip: candidate, source: "vercel" };
  }

  // Local `next dev` only - reached solely because the Vercel runtime
  // marker is absent, never because a deployed request lacked a header.
  const forwarded = firstForwardedEntry(h.get("x-forwarded-for"));
  if (forwarded === null) return { ok: true, ip: LOCAL_DEV_FALLBACK_IP, source: "local" };
  if (!isValidIpLiteral(forwarded)) return { ok: false, reason: "malformed" };
  return { ok: true, ip: forwarded, source: "local" };
}

/**
 * Returns the keyed identity for this request, or null when no trusted
 * client IP could be established. A null result is a hard stop for the
 * caller - see verifyAction.ts. Throws only when the HMAC secret itself
 * is missing, which is a misconfiguration rather than a request problem.
 */
export async function deriveRequestIpHmac(): Promise<string | null> {
  const secret = getIpHmacSecret();
  const h = await headers();
  const resolution = resolveTrustedIp(h, { isVercel: isVercelRuntime() });
  if (!resolution.ok) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(resolution.ip));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
