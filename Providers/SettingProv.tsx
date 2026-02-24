import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  SetStateAction,
  Dispatch,
} from "react";

export interface exportedValue {
  isTimer: boolean;
  isRandom: boolean;
  isChanged: boolean;
  isShowPauseHint: boolean;
  isShowOptionHint: boolean;
  setIsTimer: Dispatch<SetStateAction<boolean>>;
  setIsRandom: Dispatch<SetStateAction<boolean>>;
  setIsChanged: Dispatch<SetStateAction<boolean>>;
  setIsShowPauseHint: Dispatch<SetStateAction<boolean>>;
  setIsShowOptionHint: Dispatch<SetStateAction<boolean>>;
  handlePauseHintClick: () => void;
  handleOptionHintClick: () => void;
}

const initialState: exportedValue = {
  isTimer: true,
  isRandom: true,
  isChanged: false,
  isShowPauseHint: true,
  isShowOptionHint: true,
  setIsTimer: () => {},
  setIsRandom: () => {},
  setIsChanged: () => {},
  setIsShowPauseHint: () => {},
  setIsShowOptionHint: () => {},
  handlePauseHintClick: () => {},
  handleOptionHintClick: () => {},
};

export interface exportedIplayerSetting {
  isTimer: boolean;
  isRandom: boolean;
  isShowPauseHint: boolean;
  isShowOptionHint: boolean;
}

const initialIplayerSetting: exportedIplayerSetting = {
  isTimer: true,
  isRandom: true,
  isShowPauseHint: true,
  isShowOptionHint: true,
};

export const SettingContext = createContext<exportedValue>(initialState);

export const SettingProvider = ({ children }: { children: ReactNode }) => {
  //Iplayer
  const [isTimer, setIsTimer] = useState<boolean>(
    initialIplayerSetting.isTimer
  ); //Timer
  const [isRandom, setIsRandom] = useState<boolean>(
    initialIplayerSetting.isRandom
  ); //Random
  const [isShowPauseHint, setIsShowPauseHint] = useState<boolean>(
    initialIplayerSetting.isShowPauseHint
  ); //Pause hint
  const [isShowOptionHint, setIsShowOptionHint] = useState<boolean>(
    initialIplayerSetting.isShowOptionHint
  ); //Pause hint

  const [isChanged, setIsChanged] = useState<boolean>(false);

  const handlePauseHintClick = () => {
    setIsShowPauseHint(false);
    setIsChanged(true);
  };

  const handleOptionHintClick = () => {
    setIsShowOptionHint(false);
    setIsChanged(true);
  };

  //useEffect for getting stored value of iplayer setting from localstorage
  useEffect(() => {
    const localData = window.localStorage.getItem("iplayerSetting");
    if (!localData) {
      localStorage.setItem(
        "iplayerSetting",
        JSON.stringify({ isTimer, isRandom, isShowPauseHint, isShowOptionHint })
      );
      return;
    }
    const localValue = JSON.parse(localData);
    setIsTimer(localValue.isTimer);
    setIsRandom(localValue.isRandom);
    setIsShowPauseHint(localValue.isShowPauseHint);
    setIsShowOptionHint(localValue.isShowOptionHint);
  }, []);

  useEffect(() => {
    if (isChanged) {
      localStorage.removeItem("iplayerSetting");
      localStorage.setItem(
        "iplayerSetting",
        JSON.stringify({ isTimer, isRandom, isShowPauseHint, isShowOptionHint })
      );
      setIsChanged(false);
    }
  }, [isChanged]);

  const value: exportedValue = {
    isTimer,
    isRandom,
    isChanged,
    isShowPauseHint,
    isShowOptionHint,
    setIsTimer,
    setIsRandom,
    setIsChanged,
    setIsShowPauseHint,
    setIsShowOptionHint,
    handlePauseHintClick,
    handleOptionHintClick,
  };

  return (
    <>
      <SettingContext.Provider value={value}>
        {children}
      </SettingContext.Provider>
    </>
  );
};

//export useIplayer
export function useSetting() {
  return useContext(SettingContext);
}
