// TASK 032.5 POC - playback token (04-SECURITY-STREAMING-METERING.md §D.2).
//   token   = "v1." + kid + "." + b64url(payload) + "." + b64url(HMAC-SHA256(K[kid], "v1." + kid + "." + b64url(payload)))
//   payload = { t: tenantId, k: objectKey, kd: "pub"|"draft", ia: issuedAt, x: expiresAt, ep: epochAtMint, n: nonce }
// No identity of any kind is carried: the nonce is per playback resolve, never per listener.

export type TokenPayload = { t: string; k: string; kd: "pub" | "draft"; ia: number; x: number; ep: number; n: string; s?: "poc-mint" };

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const keyCache = new Map<string, CryptoKey>();
async function hmacKey(secret: string): Promise<CryptoKey> {
  let k = keyCache.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey("raw", unb64url(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, k);
  }
  return k;
}

export async function sign(keys: Record<string, string>, kid: string, payload: TokenPayload): Promise<string> {
  const head = `v1.${kid}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(keys[kid]), enc.encode(head));
  return `${head}.${b64url(sig)}`;
}

/** Signature + shape only. Expiry, key binding and epoch are checked by the caller. Constant-time via subtle.verify. */
export async function verify(keys: Record<string, string>, token: string): Promise<TokenPayload | null> {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, kid, body, sig] = parts;
  const secret = Object.prototype.hasOwnProperty.call(keys, kid) ? keys[kid] : undefined;
  if (!secret) return null;
  let sigBytes: Uint8Array;
  try { sigBytes = unb64url(sig); } catch { return null; }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sigBytes, enc.encode(`v1.${kid}.${body}`));
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64url(body))) as TokenPayload;
    if (typeof p.t !== "string" || typeof p.k !== "string" || (p.kd !== "pub" && p.kd !== "draft")) return null;
    if (![p.ia, p.x, p.ep].every((v) => Number.isFinite(v)) || typeof p.n !== "string") return null;
    return p;
  } catch { return null; }
}

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
