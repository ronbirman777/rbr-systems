import "server-only";

/**
 * Signed, stateless guest-access session token - no server-side session
 * table. Web Crypto (not Node's `crypto` module) so this works in either
 * the Node or Edge runtime unchanged, matching the same reasoning
 * preview-gate/hash.ts already documents for this exact tradeoff.
 *
 * Payload: { tenantId, version, exp }. `version` is the Space's current
 * guest_access.version at the moment the code was verified - the caller
 * (verifyAction.ts) compares it against the LIVE version on every guest
 * request (via get_guest_access_version, service-role only), so a code
 * reset/rotation invalidates every previously-issued token immediately
 * with no session store to clean up.
 */

export const GUEST_ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function guestAccessCookieName(tenantId: string): string {
  return `idw_guest_access_${tenantId}`;
}

type TokenPayload = { tenantId: string; version: number; exp: number };

class MissingGuestAccessSecretError extends Error {
  constructor(varName: string) {
    super(
      `${varName} is not set. Guest Access code verification cannot issue or check a session without it - ` +
        `add it to your environment (a long random string; see the Distribution phase migration review for why ` +
        `this is a separate secret from GUEST_ACCESS_IP_HMAC_SECRET) rather than allowing this to silently no-op.`
    );
    this.name = "MissingGuestAccessSecretError";
  }
}

function getTokenSecret(): string {
  const secret = process.env.GUEST_ACCESS_TOKEN_SECRET;
  if (!secret) throw new MissingGuestAccessSecretError("GUEST_ACCESS_TOKEN_SECRET");
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

async function hmacSha256(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(sig));
}

/** Constant-time string comparison - a plain `===` on signatures leaks
 * timing information byte-by-byte, a known forgery side-channel for
 * HMAC verification (flagged explicitly in the migration review). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function signGuestAccessToken(tenantId: string, version: number): Promise<string> {
  const secret = getTokenSecret();
  const payload: TokenPayload = {
    tenantId,
    version,
    exp: Math.floor(Date.now() / 1000) + GUEST_ACCESS_COOKIE_MAX_AGE_SECONDS,
  };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a guest-access cookie token against the tenant it claims to
 * belong to and the Space's CURRENT version (fetched by the caller via
 * get_guest_access_version, never trusted from the token holder).
 * Fails closed on every malformed/expired/mismatched case - never
 * throws for a bad token, since an attacker-supplied cookie value must
 * never crash the guest route.
 */
export async function verifyGuestAccessToken(
  token: string,
  expectedTenantId: string,
  currentVersion: number
): Promise<boolean> {
  const secret = getTokenSecret();
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return false;

  let expectedSignature: string;
  try {
    expectedSignature = await hmacSha256(payloadB64, secret);
  } catch {
    return false;
  }
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return false;
  }
  if (typeof payload.tenantId !== "string" || typeof payload.version !== "number" || typeof payload.exp !== "number") {
    return false;
  }
  if (payload.tenantId !== expectedTenantId) return false;
  if (payload.version !== currentVersion) return false;
  if (payload.exp < Math.floor(Date.now() / 1000)) return false;

  return true;
}
