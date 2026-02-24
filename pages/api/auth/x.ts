import { NextApiRequest, NextApiResponse } from "next";
import { twitter } from "$/lib/auth/x";
import { generateState, generateCodeVerifier } from "arctic";
import { setCookie } from "cookies-next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const useSecureCookies = process.env.NEXTAUTH_URL!.startsWith("https://");
  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;

  try {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    const url = await twitter.createAuthorizationURL(state, codeVerifier, [
      "tweet.read",
      "tweet.write",
      "users.read",
      "offline.access",
    ]);

    setCookie("twitter_oauth_state", state, {
      req,
      res,
      maxAge: 60 * 60 * 24 * 30,
      secure: useSecureCookies,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    setCookie("twitter_code_verifier", codeVerifier, {
      req,
      res,
      maxAge: 60 * 60 * 24 * 30,
      secure: useSecureCookies,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    res.status(200).json({ url: url.toString() });
  } catch (error) {
    console.error("Twitter auth error:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
