import React, {
  createContext,
  ReactNode,
  useContext,
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import { fetchAssistantAPI } from "../services/assistant";
import { PersonalityData } from "../types/services";
import { Copanionkit } from "$/OS/AI/core/copanionkit";
import { getCopanionRuntimeUrl } from "$/services/http.config";
import { useUser } from "./UserProv";
import { getCachedToken } from "$/lib/auth-token-cache";
import { RateLimitInfo } from "$/services/rate-limit-client";
import { CopanionActionProvider } from "$/OS/AI/core/Providers/CopanionActionProv";

export interface exportedValue {
  personality: PersonalityData;
  chatid: string;
  setInfowithData: (data: PersonalityData) => void;
  setInfo: () => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

const initialState: exportedValue = {
  personality: {
    name: "",
    description: "",
    coverPhoto: "",
    WelcomeMessage: "",
    status: "",
    chatbotModel: "",
    tag: "",
    characteristics: {
      Personality: "",
      Tone: "",
      Background: "",
      Interests: "",
    },
  },
  chatid: "",
  setInfowithData: () => {},
  setInfo: () => {},
  loading: false,
  setLoading: () => {},
  buttonRef: { current: null },
};

export const AssistantContext = createContext<exportedValue>(initialState);

export const AssistantProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [chatid, setchatID] = useState<string>("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [personality, setPersonality] = useState<PersonalityData>(
    initialState.personality
  );

  // Memoize functions to prevent context from changing on every render
  const setInfowithData = useCallback(async (data: PersonalityData) => {
    setPersonality(data);
  }, []);

  const setInfo = useCallback(async () => {
    try {
      const getData = await fetchAssistantAPI();
      const getJson = await getData.data;
      if (getJson.status !== 200) {
        //error
        throw new Error(getJson.error);
      } else {
        setchatID(getJson.data._id);
        setPersonality(getJson.data.personality);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const value: exportedValue = useMemo(
    () => ({
      personality,
      chatid,
      setInfowithData,
      setInfo,
      loading,
      setLoading,
      buttonRef,
    }),
    [
      personality,
      chatid,
      setInfowithData,
      setInfo,
      loading,
      setLoading,
      buttonRef,
    ]
  );

  return (
    <AssistantContext.Provider value={value}>
        {children}
    </AssistantContext.Provider>
  );
};

export function useAssistant() {
  return useContext(AssistantContext);
}
