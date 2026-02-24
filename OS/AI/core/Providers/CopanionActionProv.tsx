import React, {
  createContext,
  ReactNode,
  useContext,
  useState,
  useRef,
  useMemo,
  useEffect,
} from "react";

export interface exportedValue {}

const initialState: exportedValue = {};

export const CopanionActionContext = createContext<exportedValue>(initialState);

export const CopanionActionProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
    
  const value: exportedValue = useMemo(() => ({}), []);

  return (
    <CopanionActionContext.Provider value={value}>
      {children}
    </CopanionActionContext.Provider>
  );
};

export function useCopanionAction() {
  return useContext(CopanionActionContext);
}
