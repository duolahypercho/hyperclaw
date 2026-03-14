import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://");
  const cookiePrefix = useSecureCookies ? "__Secure-" : "";
  const securePart = useSecureCookies ? "; Secure" : "";

  const host = req.headers.host?.split(":")[0] || "localhost";

  const cookieNames = [
    "hypercho_user_token",
    `${cookiePrefix}next-auth.session-token`,
    "next-auth.session-token",
    `${cookiePrefix}next-auth.csrf-token`,
    "next-auth.csrf-token",
    `${cookiePrefix}next-auth.callback-url`,
    "next-auth.callback-url",
  ];

  // Clear cookies for BOTH host-only (no Domain) and explicit Domain variants.
  // A cookie set with Domain=localhost is different from one without Domain.
  const setCookies: string[] = [];
  for (const name of cookieNames) {
    // Host-only clear (no Domain attribute)
    setCookies.push(
      `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${securePart}`
    );
    // Explicit Domain clear
    setCookies.push(
      `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Domain=${host}${securePart}`
    );
  }

  // Also clear for production domain if configured
  if (process.env.DOMAIN) {
    for (const name of cookieNames) {
      setCookies.push(
        `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Domain=${process.env.DOMAIN}${securePart}`
      );
    }
  }

  res.setHeader("Set-Cookie", setCookies);

  if (req.method === "GET") {
    res.redirect(302, "/auth/Login");
    return;
  }

  res.status(200).json({ ok: true });
}
