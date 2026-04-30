import { Session, DefaultSession } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";
type channelData = {
  _id: string;
  username: string;
  channelName: string;
  channelPic: string;
  channelBanner: string;
};
/** Example on how to extend the built-in session types */
declare module "next-auth" {
  interface Session {
    user: {
      token: string;
      userId: string;
      Verified: boolean;
      Firstname: string;
      Lastname: string;
      email: string;
      image: number;
      username: string;
      channel: channelData;
    } & DefaultSession;
  }
}

/** Example on how to extend the built-in types for JWT */
declare module "next-auth/jwt" {
  interface JWT {
    user: {
      token: string;
      userId: string;
      Verified: boolean;
      Firstname: string;
      Lastname: string;
      email: string;
      image: number;
      username: string;
      channel: channelData;
    } & DefaultJWT;
  }
}
