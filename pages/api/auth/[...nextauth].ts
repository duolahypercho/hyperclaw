import { NextApiRequest, NextApiResponse } from "next";
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { setCookie, deleteCookie } from "cookies-next";
import Jwt from "jsonwebtoken";
import { loginAuth, googleAuth } from "$/services/user";

export const authOptions = (req: any, res: any) => {
  const useSecureCookies = process.env.NEXTAUTH_URL!.startsWith("https://");
  const googleClientId = process.env.GOOGLE_CLIENT_ID!;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const cookieDomain =
    process.env.NODE_ENV === "production" && process.env.DOMAIN
      ? process.env.DOMAIN
      : undefined;
  const authOption: NextAuthOptions = {
    //Configure JWT
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const { password: Password, email }: any = credentials;
          try {
            const login = await loginAuth(email, Password);
            // check pasword and return result
            const { status, message, userData } = await login.data;
            if (status === 200) {
              const {
                email: userEmail,
                profilePic: image,
                _id: userId,
                Verified,
                channel,
                Firstname,
                Lastname,
                username,
                aboutme,
              }: {
                email: string;
                profilePic: string;
                _id: string;
                Verified: boolean;
                channel: { _id?: string };
                Firstname: string;
                Lastname: string;
                username: string;
                aboutme: string;
              } = userData;
              const info = {
                email: userEmail,
                image,
                id: userId,
                userId,
                Verified,
                channel,
                Firstname,
                Lastname,
                username,
                aboutme,
              };
              deleteCookie(`hypercho_user_token`, { req, res, path: "/" });
              if (userId) {
                // set the new id to the cookie
                const newToken = Jwt.sign(userId, process.env.NEXTAUTH_SECRET!);
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
              return info; //return when change successful
              //return when change successful
            } else if (status === 401) {
              throw new Error("This user doesn't exist"); //return when mail doesn't exist
            } else {
              throw new Error("Incorrect Password"); //return when password is wrong
            }
          } catch (e: any) {
            console.error(e);
            const errorMessage = e.response.data.message as string;
            if (
              errorMessage === "Incorrect Password" ||
              errorMessage === "This user doesn't exist"
            ) {
              throw new Error(e.response.data.message);
            } else {
              throw new Error("Something went wrong");
            }
          }
        },
      }),
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }),
    ],
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
          const newToken = Jwt.sign(userData._id, process.env.NEXTAUTH_SECRET!);
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
          const newToken = Jwt.sign(user.userId, process.env.NEXTAUTH_SECRET!);
          token.token = newToken; // Add the token to the JWT
          token.userId = user.userId;
          token.Firstname = user.Firstname;
          token.Lastname = user.Lastname;
          token.Verified = user.Verified;
          token.channel = user.channel;
          token.username = user.username;
          token.aboutme = user.aboutme;
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

            //@ts-ignore
            const image = profile?.image || profile?.picture || "";

            // Call backend to check if user exists or create new user
            const response = await googleAuth(
              profile.email,
              firstname,
              lastname,
              //@ts-ignore
              profile?.image || profile?.picture || ""
            );

            // Backend returns: { success, status, data: { user: {...} } }
            const { status, success, data } = response.data;
            const userData = data?.user; // Extract user from nested structure

            if ((status === 200 || success) && userData) {
              // Attach the backend user data to the user object
              // This will be available in the JWT callback
              (user as any).userData = userData;
              return true;
            } else {
              throw new Error("Failed to authenticate with Google");
            }
          } catch (error: any) {
            console.error("Google authentication error:", error);
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

