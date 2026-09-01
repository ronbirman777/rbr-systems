/**
 * SHA-256 hex digest and a constant-time string comparison, both built on
 * the Web Crypto API (`globalThis.crypto`) rather than Node's `crypto`
 * module - this file runs in two different runtimes (the preview-access
 * Server Action, which is Node.js, and proxy.ts, which is the Edge
 * runtime), and Web Crypto is the one API both environments share.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
