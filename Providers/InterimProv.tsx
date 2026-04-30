import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export interface exportedValue {
  mobileScreen: boolean | null;
  tabletScreen: boolean | null;
  screenSize: number;
  mobilePortrait: boolean | null;
  mobileLandscape: boolean | null;
}
const initialState: exportedValue = {
  mobileScreen: null,
  tabletScreen: null,
  screenSize: 0,
  mobilePortrait: null,
  mobileLandscape: null,
};

export const InterimContext = createContext<exportedValue>(initialState);
const MAXMOBILESCREENSIZE: number = 569;
const MAXTABLETSCREENSIZE: number = 750;
export const InterimProvider = ({ children }: { children: ReactNode }) => {
  const [screenSize, setScreenSize] = useState<number>(0);
  const [mobileScreen, setMobileScreen] = useState<boolean | null>(null);
  const [tabletScreen, setTabletScreen] = useState<boolean | null>(null);
  const [mobilePortrait,setMobilePortrait] = useState<boolean | null>(null);
  const [mobileLandscape,setMobileLandscape] = useState<boolean | null>(null);

  //to get the mobile screen size in respect to the screen orientation
  const isMobileorTablet = () => {
    const screenOrientation: string = (window.screen as any).orientation
      ? screen.orientation.type
      : Math.abs(+window.orientation) === 90
      ? "landscape"
      : "portrait";
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    setScreenSize(screenWidth);
    if (screenOrientation.includes("landscape")) {
      setMobilePortrait(false);
      setMobileLandscape(true);
      if (screenWidth <= MAXMOBILESCREENSIZE) {
        setMobileScreen(true);
        setTabletScreen(false);
        return;
      }
      if (screenWidth <= MAXTABLETSCREENSIZE) {
        setMobileScreen(false);
        setTabletScreen(true);
        return;
      }
      setMobileScreen(false);
      setTabletScreen(false);
    } else {
      setMobilePortrait(true);
      setMobileLandscape(false);
      if (screenWidth <= MAXMOBILESCREENSIZE) {
        setMobileScreen(true);
        return;
      }
      if (screenWidth <= MAXTABLETSCREENSIZE) {
        setMobileScreen(false);
        setTabletScreen(true);
        return;
      }
      setTabletScreen(false);
      setMobileScreen(false);
    }
  };

  useEffect(() => {
    isMobileorTablet();
    if ((window.screen as any).orientation) {
      screen.orientation.addEventListener("change", isMobileorTablet);
    }
    window.addEventListener("resize", isMobileorTablet);
    return () => {
      window.removeEventListener("resize", isMobileorTablet);
      if ((window.screen as any).orientation) {
        screen.orientation.removeEventListener("change", isMobileorTablet);
      }
    };
  }, []);

  const value: exportedValue = useMemo(() => ({
    mobileScreen,
    tabletScreen,
    screenSize,
    mobilePortrait,
    mobileLandscape,
  }), [mobileScreen, tabletScreen, screenSize, mobilePortrait, mobileLandscape]);

  return (
    <>
      <InterimContext.Provider value={value}>{children}</InterimContext.Provider>
    </>
  );
};

//export useInterim
export function useInterim() {
  return useContext(InterimContext);
}
