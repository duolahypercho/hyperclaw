import { NextApiRequest, NextApiResponse } from "next";
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { setCookie, deleteCookie } from "cookies-next";
import Jwt from "jsonwebtoken";
import { signToken } from "$/lib/shared-auth";
import logger from "$/lib/logger";

const isLoopbackHost = (hostHeader: string | undefined): boolean => {
  const header = hostHeader || "";
  const host = header.startsWith("[")
    ? header.slice(1, header.indexOf("]"))
    : header.split(":")[0];
  return ["localhost", "127.0.0.1", "::1"].includes(host);
};

const isLoopbackAddress = (address: string | undefined): boolean =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address || "");

const isLocalCredentialsRequest = (req: NextApiRequest | undefined): boolean =>
  isLoopbackHost(req?.headers?.host) &&
  isLoopbackAddress(req?.socket?.remoteAddress);

export const authOptions = (req: any, res: any) => {
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const allowNetworkCredentials =
    process.env.HYPERCLAW_ALLOW_NETWORK_LOGIN === "true";
  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;

  // Build providers list — only include Google if credentials are configured
  const providers: NextAuthOptions["providers"] = [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { password: Password, email }: any = credentials;
        try {
          if (!allowNetworkCredentials && !isLocalCredentialsRequest(req)) {
            throw new Error(
              "Local credentials are disabled for non-localhost access. Set HYPERCLAW_ALLOW_NETWORK_LOGIN=true only if you understand the risk."
            );
          }

          if (!email || !Password) {
            throw new Error("Invalid email or password");
          }

          // Community Edition uses the credentials form as a local identity
          // bootstrap, not as hosted password authentication.
          const normalizedEmail = String(email).trim().toLowerCase();
          const username = normalizedEmail.split("@")[0] || "local-user";
          const userId = `local-${normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
          const info = {
            email: normalizedEmail,
            image: "",
            id: userId,
            userId,
            Verified: true,
            channel: { tier: "free" },
            Firstname: username,
            Lastname: "",
            username,
            aboutme: "",
          };
          deleteCookie(`hypercho_user_token`, { req, res, path: "/" });
          const newToken = signToken(
            userId,
            process.env.NEXTAUTH_SECRET!,
            "free"
          );
          setCookie(`hypercho_user_token`, newToken, {
            req,
            res,
            httpOnly: true,
            secure: useSecureCookies,
            maxAge: 60 * 60 * 24 * 30,
            sameSite: "lax",
            path: "/",
            ...(cookieDomain ? { domain: cookieDomain } : {}),
          });
          return info;
        } catch (e: any) {
          logger.warn({ err: e }, "Login failed");
          throw new Error(e?.message || "Something went wrong");
        }
      },
    }),
  ];

  if (googleClientId && googleClientSecret) {
    providers.push(
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        authorization: {
          params: {
            prompt: "select_account", // Always show Google account picker (e.g. after logout)
          },
        },
      })
    );
  }

  const authOption: NextAuthOptions = {
    //Configure JWT
    providers,
    // callbacks
    callbacks: {
      jwt: async ({ token, user, account, trigger, session }: any) => {
        if (req.url === `/api/auth/session?update`) {
          token.Verified = true;
          return token;
        }

        // Handle Google OAuth sign-in
        if (user && account?.provider === "google") {
          // User data from Google OAuth
          const googleUser = user;
          const anyUser = user as any;

          // IMPORTANT: Only process if userData exists (successful backend auth)
          // If userData doesn't exist, the signIn callback failed, so skip token creation
          if (!anyUser.userData) {
            return token; // Return unchanged token, don't populate with invalid data
          }
          // User data was fetched from backend successfully
          const userData = anyUser.userData;
          const newToken = signToken(
            userData._id,
            process.env.NEXTAUTH_SECRET!,
            userData.channel?.tier || "free"
          );
          token.token = newToken;
          token.userId = userData._id;
          token.Firstname = userData.Firstname;
          token.Lastname = userData.Lastname;
          token.Verified = userData.Verified;
          token.channel = userData.channel;
          token.username = userData.username;
          token.aboutme = userData.aboutme;

          // Set the hypercho_user_token cookie
          deleteCookie(`hypercho_user_token`, { req, res, path: "/" });
          setCookie(`hypercho_user_token`, newToken, {
            req,
            res,
            httpOnly: true,
            secure: useSecureCookies,
            maxAge: 60 * 60 * 24 * 30,
            sameSite: "lax",
            path: "/",
            ...(cookieDomain ? { domain: cookieDomain } : {}),
          });
        }

        // Handle Credentials sign-in
        if (user && account?.provider === "credentials") {
          // Create the JWT token here
          const newToken = signToken(
            user.userId,
            process.env.NEXTAUTH_SECRET!,
            (user as any).channel?.tier || "free"
          );
          token.token = newToken; // Add the token to the JWT
          token.userId = user.userId;
          token.Firstname = user.Firstname;
          token.Lastname = user.Lastname;
          token.Verified = user.Verified;
          token.channel = user.channel;
          token.username = user.username;
          token.aboutme = user.aboutme;
        }

        // Auto-refresh the hub token when it's expired, about to expire,
        // or uses the old string-payload format (no exp field at all).
        if (token.token && token.userId) {
          try {
            const decoded = Jwt.decode(token.token) as any;
            const exp = typeof decoded === "object" ? decoded?.exp : undefined;
            const now = Math.floor(Date.now() / 1000);
            const twoDays = 2 * 24 * 60 * 60;
            // Refresh if: no exp (old format), expired, or within 2 days of expiring
            if (!exp || exp < now || exp - now < twoDays) {
              const tier = (typeof decoded === "object" ? decoded?.tier : undefined)
                || token.channel?.tier || "free";
              token.token = signToken(
                token.userId,
                process.env.NEXTAUTH_SECRET!,
                tier
              );
            }
          } catch { /* keep existing token */ }
        }

        return token;
      },
      session: ({ session, token }: any) => {
        if (token) {
          session.user.token = token.token; // Add the token to the session
          session.user.userId = token.userId;
          session.user.Firstname = token.Firstname;
          session.user.Lastname = token.Lastname;
          session.user.Verified = token.Verified;
          session.user.channel = token.channel;
          session.user.username = token.username;
          session.user.aboutme = token.aboutme;

          // Pass flag if account was just linked
          if (token.accountJustLinked) {
            session.user.accountJustLinked = true;
          }
        }
        return session;
      },
      signIn: async ({ user, account, profile, email, credentials }) => {
        // For credentials provider, authorize() already handles validation
        if (account?.provider === "credentials") {
          return true;
        }

        // Handle OAuth providers (like Google)
        if (account?.provider === "google") {
          if (!profile?.email) {
            throw new Error("Email is required for Google sign-in");
          }

          try {
            // Extract name parts from Google profile
            const fullName = profile.name || "";
            const nameParts = fullName.split(" ");
            const firstname = nameParts[0] || "";
            const lastname = nameParts.slice(1).join(" ") || "";

            const username = profile.email.split("@")[0] || "local-user";
            (user as any).userData = {
              _id: `google-${profile.email.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}`,
              email: profile.email,
              Firstname: firstname || username,
              Lastname: lastname,
              Verified: true,
              channel: { tier: "free" },
              username,
              aboutme: "",
            };
            return true;
          } catch (error: any) {
            logger.error({ err: error }, "Google authentication error");
            throw new Error(
              error.response?.data?.message || "Google authentication failed"
            );
          }
        }

        // Default return for any other provider
        return true;
      },
    },
    secret: process.env.NEXTAUTH_SECRET!,
    pages: {
      signIn: "/auth/Login",
      signOut: "/auth/Login",
      error: "/auth/Login", // Error code passed in query string
    },
    events: {
      // Clear custom auth cookie and ensure session is fully cleared on logout (Google or credentials).
      signOut: async () => {
        deleteCookie("hypercho_user_token", { req, res, path: "/" });
      },
    },
    cookies: {
      sessionToken: {
        name: `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`,
        options: {
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
          ...(cookieDomain ? { domain: cookieDomain } : {}),
          secure: useSecureCookies,
        },
      }
    },
  };
  return authOption;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  return NextAuth(req, res, authOptions(req, res));
};

export default handler;
