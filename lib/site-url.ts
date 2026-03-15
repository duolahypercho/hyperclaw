/**
 * Canonical site URL derived from NEXTAUTH_URL.
 * Trailing slash is stripped so callers can write `${SITE_URL}/path`.
 */
export const SITE_URL = (
  process.env.NEXTAUTH_URL ||
  process.env.NEXT_PUBLIC_URL ||
  "https://app.claw.hypercho.com"
).replace(/\/$/, "");
