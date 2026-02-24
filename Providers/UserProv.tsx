import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { setCachedToken, clearCachedToken } from "$/lib/auth-token-cache";
import {
  getUserInfo,
  getUserMembership,
  UserMembership,
} from "../services/user";
import { getUserId } from "../utils";
import { channelData } from "../types/next-auth";
import { useRouter } from "next/router";
import { signOut } from "next-auth/react";
//Update Provider for user's infomation if user updated their info.

type sessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "network error"
  | "error";
interface userInfoTypes {
  email: string;
  profilePic: string;
  channel?: channelData;
  Firstname: string;
  Lastname: string;
  username: string;
  aboutme: string;
}

export interface exportedValue {
  userInfo: userInfoTypes;
  membership: UserMembership | null;
  setId: (data?: userInfoTypes) => void;
  status: sessionStatus;
  userId: string | null;
  logout: () => void;
}

const initialState: exportedValue = {
  userInfo: {
    email: "",
    profilePic: "1",
    channel: undefined,
    Firstname: "",
    Lastname: "",
    username: "",
    aboutme: "",
  },
  membership: null,
  setId: () => {},
  status: "loading",
  userId: null,
  logout: () => {},
};

export const UserInfoContext = createContext<exportedValue>(initialState);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { status: sessionStatus, data: sessionData } = useSession();
  const [userInfo, setuserInfo] = useState<userInfoTypes>(
    initialState.userInfo
  );
  const [membership, setMembership] = useState<UserMembership | null>(null);
  const [status, setStatus] = useState<sessionStatus>("loading");
  const { route } = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  const logout = async () => {
    try {
      setStatus("unauthenticated");
      setMembership(null);
      clearCachedToken(); // Clear cached token on logout
      await signOut({ redirect: false });
    } catch {
      setStatus("unauthenticated");
      setMembership(null);
    }
  };

  const setId = async () => {
    try {
      // Prefer NextAuth session userId; fall back to cookie if present
      const derivedUserId = sessionData?.user?.userId || (await getUserId());
      if (derivedUserId) {
        setUserId(derivedUserId);
      }

      if (sessionData?.user?.userId) {
        // Cache the token for axios interceptors
        setCachedToken(sessionData.user.token);

        // Fetch user info and membership in parallel
        const [userInfoRes, membershipRes] = await Promise.allSettled([
          getUserInfo(),
          getUserMembership(),
        ]);

        // Set user info
        if (userInfoRes.status === "fulfilled") {
          const userData: userInfoTypes = userInfoRes.value.data.data;
          const {
            email: userEmail,
            profilePic,
            channel,
            Firstname,
            Lastname,
            username,
            aboutme,
          } = userData;
          const info = {
            email: userEmail,
            profilePic,
            channel,
            Firstname,
            Lastname,
            username,
            aboutme,
          };
          setuserInfo(info);
        }

        // Set membership
        if (membershipRes.status === "fulfilled") {
          const response = membershipRes.value.data;
          const membershipData = response?.data || null;
          setMembership(membershipData);
        } else {
          // If membership fetch fails, set to null (user might not have a membership)
          setMembership(null);
        }

        setTimeout(() => {
          setStatus("authenticated");
        }, 300);
        return;
      }
      // If we get here without sessionData, reflect unauthenticated state
      setStatus("unauthenticated");
    } catch (e: any) {
      if (e.message === "Network Error") {
        setStatus("network error");
        return;
      }
      // Do not force sign out here; just mark error and let session resolver update status
      console.error("UserProvider error", e);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (
      sessionData &&
      typeof sessionData === "string" &&
      sessionData === "session"
    ) {
      setStatus("unauthenticated");
      return;
    }

    if (sessionStatus === "authenticated") {
      setId();
      return;
    }
    setStatus(sessionStatus);
  }, [route, sessionStatus]);

  const value = {
    userInfo,
    membership,
    setId,
    status,
    userId,
    logout,
  };

  return (
    <>
      <UserInfoContext.Provider value={value}>
        {children}
      </UserInfoContext.Provider>
    </>
  );
};

export function useUser() {
  return useContext(UserInfoContext);
}
