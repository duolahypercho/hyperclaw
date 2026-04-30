/**
 * Canonical site URL derived from NEXTAUTH_URL.
 * Trailing slash is stripped so callers can write `${SITE_URL}/path`.
 *
 * Community Edition default is the local dev server. Cloud builds override
 * this via NEXTAUTH_URL / NEXT_PUBLIC_URL at build time.
 */
export const SITE_URL = (
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "http://localhost:1000"
).replace(/\/$/, "");
