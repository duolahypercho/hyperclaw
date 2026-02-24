import { Twitter } from "arctic";
import { getCookie } from "cookies-next";

export const twitter = new Twitter(
  process.env.TWITTER_CLIENT_ID!,
  process.env.TWITTER_CLIENT_SECRET!,
  process.env.TWITTER_CALLBACK_URL!
);

export function getTwitterSession() {
  const session = getCookie("twitter_session");
  return session || null;
}
