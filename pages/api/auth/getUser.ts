import type { NextApiRequest, NextApiResponse } from "next";
import { getCookie } from "cookies-next";
import { verifyToken } from "$/lib/shared-auth";

const getUser = (req: NextApiRequest, res: NextApiResponse) => {
  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;

  const token = getCookie("hypercho_user_token", {
    req,
    res,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  if (!token || typeof token !== "string") {
    return res.status(200).json({ userId: "" });
  }

  try {
    const { userId } = verifyToken(token, process.env.NEXTAUTH_SECRET!);
    return res.status(200).json({ userId });
  } catch {
    return res.status(200).json({ userId: "" });
  }
};

export default getUser;
