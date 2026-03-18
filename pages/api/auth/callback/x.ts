import type { NextApiRequest, NextApiResponse } from "next";
import { twitter } from "$/lib/auth/x";
import { OAuth2RequestError } from "arctic";
import { verifyToken } from "$/lib/shared-auth";
import { getCookie } from "cookies-next";
import { TwitterApi } from "twitter-api-v2";
import { XUserLogin } from "$/services/tools/x";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get the URL from req
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const fullUrl = `${protocol}://${req.headers.host}${req.url}`;
  const url = new URL(fullUrl);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;

  const cookieOptions = {
    req,
    res,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };

  const storedState = getCookie("twitter_oauth_state", cookieOptions);

  const codeVerifier = getCookie("twitter_code_verifier", cookieOptions);

  if (
    !state ||
    !storedState ||
    state !== storedState ||
    !code ||
    !codeVerifier
  ) {
    return res.status(400).json({ error: "Invalid state" });
  }

  try {
    const tokens = await twitter.validateAuthorizationCode(
      code as string,
      codeVerifier as string
    );
    // Get user ID from cookie
    const userToken = getCookie("hypercho_user_token", cookieOptions);

    const { userId } = verifyToken(userToken as string, process.env.NEXTAUTH_SECRET!);

    if (!userId) {
      throw new Error(`User not found`);
    }

    // Store tokens securely (e.g., in database)

    // Get Twitter user information
    const twitterClient = new TwitterApi(tokens.accessToken());
    const { data: userInfo } = await twitterClient.v2.me({
      "user.fields": [
        "id",
        "name",
        "username",
        "profile_image_url",
        "verified",
        "verified_type",
        "public_metrics",
      ],
    });

    // Check for verification: legacy verified OR premium blue checkmark
    const isVerified =
      userInfo.verified === true || userInfo.verified_type === "blue";

    try {
      const xUser = await XUserLogin({
        userId,
        oauthResponse: {
          access_token: tokens.accessToken(),
          refresh_token: tokens.refreshToken(),
        },
        followersCount: userInfo.public_metrics?.followers_count ?? 0,
        followingCount: userInfo.public_metrics?.following_count ?? 0,
        twitterUserId: userInfo.id,
        verified: isVerified,
        username: userInfo.username,
        name: userInfo.name,
        profileImageUrl: userInfo.profile_image_url ?? "",
      });
    } catch (e) {
      if (e instanceof OAuth2RequestError) {
        throw new Error(`OAuth error`);
      }
      throw new Error(`Internal Service Error`);
    }

    res.setHeader("Content-Type", "text/html");
    res.end(`
      <script>
        window.opener?.postMessage({ source: "twitter-oauth", success: true }, window.location.origin);
        window.close();
      </script>
      `);
  } catch (e) {
    console.error("Twitter auth error:", e);
    res.setHeader("Content-Type", "text/html");

    if (e instanceof OAuth2RequestError) {
      res.end(`
        <script>
        window.opener?.postMessage({ source: "twitter-oauth", success: false, error: "OAuth2 Request Error"  }, window.location.origin);
        window.close();
      </script>
      `);
    }

    res.end(`
      <script>
      window.opener?.postMessage({ source: "twitter-oauth", success: false, error: "Internal server error"  }, window.location.origin);
      window.close();
    </script>
    `);
  }
}
