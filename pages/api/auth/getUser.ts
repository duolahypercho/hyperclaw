import type { NextApiRequest, NextApiResponse } from "next";
import { getCookie } from "cookies-next";

const getUser = (req: NextApiRequest, res: NextApiResponse) => {
  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;

  const cookie = getCookie("hypercho_user_token", {
    req,
    res,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  res.status(200).send(cookie);
};

export default getUser;
