import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { setCachedToken, clearCachedToken } from "$/lib/auth-token-cache";
import { clearTokenCache, clearAuthExpired } from "$/lib/hub-direct";
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

export interface MembershipPackage {
  name: string;
  maxToken: number;
  generate_response_daily: number;
}

export interface UserMembership {
  startDate: string | Date;
  endDate: string | Date;
  package: MembershipPackage;
  isFreePlan: boolean;
  customerId: string;
}

export interface exportedValue {
  userInfo: userInfoTypes;
  membership: UserMembership | null;
  setId: (data?: userInfoTypes) => void;
  status: sessionStatus;
  userId: string | null;
  logout: () => void;
  /** True when the hub returned 401 — JWT expired. Resets on re-authentication. */
  hubAuthExpired: boolean;
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
  hubAuthExpired: false,
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

  const logout = () => {
    console.log("[LOGOUT] function called");
    console.log("[LOGOUT] cookies before:", document.cookie);
    setStatus("unauthenticated");
    setMembership(null);
    clearCachedToken();
    clearTokenCache();
    // In Electron, clear persisted cookies/storage
    if (typeof window !== "undefined" && window.electronAPI?.clearAuthSession) {
      window.electronAPI.clearAuthSession().catch(() => {});
    }
    // Navigate directly to logout endpoint — it clears all cookies then redirects to login
    console.log("[LOGOUT] navigating to /api/auth/logout");
    window.location.href = "/api/auth/logout";
  };

  const setId = async (data?: userInfoTypes) => {
    if (data) {
      setuserInfo(data);
      return;
    }

    try {
      // Prefer NextAuth session userId; fall back to cookie if present
      const derivedUserId = sessionData?.user?.userId || (await getUserId());
      if (derivedUserId) {
        setUserId(derivedUserId);
      }

      if (sessionData?.user?.userId) {
        // Cache the token for axios interceptors
        setCachedToken(sessionData.user.token);
        // Clear auth-expired flag so hub retry loops resume with the fresh token
        clearAuthExpired();

        const sessionUser = sessionData.user as any;
        const email = sessionUser.email || "";
        const fallbackName =
          sessionUser.name ||
          [sessionUser.Firstname, sessionUser.Lastname].filter(Boolean).join(" ") ||
          "Local User";
        const [fallbackFirst = "Local", ...fallbackLastParts] = fallbackName.split(" ");
        setuserInfo({
          email,
          profilePic: sessionUser.image ? String(sessionUser.image) : "",
          channel: sessionUser.channel,
          Firstname: sessionUser.Firstname || fallbackFirst,
          Lastname: sessionUser.Lastname || fallbackLastParts.join(" "),
          username: sessionUser.username || email.split("@")[0] || "local-user",
          aboutme: sessionUser.aboutme || "",
        });
        // Community Edition has no hosted billing membership.
        setMembership(null);

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

  // Track the session userId so the effect re-runs when the logged-in user
  // changes (e.g. fresh login after logout, or switching accounts).
  const sessionUserId = sessionData?.user?.userId;

  useEffect(() => {
    if (
      sessionData &&
      typeof sessionData === "string" &&
      sessionData === "session"
    ) {
      setStatus("unauthenticated");
      return;
    }

    if (sessionStatus === "authenticated" && sessionUserId) {
      setId();
      return;
    }
    setStatus(sessionStatus);
  }, [route, sessionStatus, sessionUserId]);

  const fnsRef = useRef({ setId, logout });
  fnsRef.current = { setId, logout };

  // Surface a re-login banner when the hub returns 401 (JWT expired).
  // The banner is dismissed automatically when the user signs in again
  // (clearAuthExpired is called by setId on successful auth).
  const [hubAuthExpired, setHubAuthExpired] = useState(false);

  useEffect(() => {
    const handler = () => setHubAuthExpired(true);
    window.addEventListener("hyperclaw:auth-expired", handler);
    return () => window.removeEventListener("hyperclaw:auth-expired", handler);
  }, []);

  // When the session is re-established, clear the expired flag.
  useEffect(() => {
    if (sessionStatus === "authenticated" && sessionUserId) {
      setHubAuthExpired(false);
    }
  }, [sessionStatus, sessionUserId]);

  const value = useMemo(() => ({
    userInfo,
    membership,
    setId: (...args: Parameters<typeof setId>) => fnsRef.current.setId(...args),
    status,
    userId,
    logout: () => fnsRef.current.logout(),
    hubAuthExpired,
  }), [userInfo, membership, status, userId, hubAuthExpired]);

  return (
    <>
      <UserInfoContext.Provider value={value}>
        {hubAuthExpired && (
          <div
            role="alert"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              background: "oklch(35% 0.18 25)",
              color: "#fff",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              gap: 12,
            }}
          >
            <span>
              <strong>Session expired.</strong> Your hub connection has timed out — please sign in again to reconnect.
            </span>
            <button
              onClick={() => fnsRef.current.logout()}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.4)",
                color: "#fff",
                borderRadius: 6,
                padding: "4px 14px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </button>
          </div>
        )}
        {children}
      </UserInfoContext.Provider>
    </>
  );
};

export function useUser() {
  return useContext(UserInfoContext);
}
