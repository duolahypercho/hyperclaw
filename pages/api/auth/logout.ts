import type { NextApiRequest, NextApiResponse } from "next";
import { deleteCookie } from "cookies-next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Clear custom httpOnly auth cookie if present
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://");
  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;

  deleteCookie("hypercho_user_token", {
    req,
    res,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
    secure: !!useSecureCookies,
  });

  res.status(200).json({ ok: true });
}
