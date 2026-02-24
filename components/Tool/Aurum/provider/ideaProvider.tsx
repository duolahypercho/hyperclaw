import React, { createContext, useContext, useState, ReactNode } from "react";
import { IdeaAnalysis } from "../type";

interface IdeaContextType {
  // Add your state and methods here as needed
  ideaReport: IdeaAnalysis;
  setIdeaReport: React.Dispatch<React.SetStateAction<IdeaAnalysis>>;
}

const IdeaContext = createContext<IdeaContextType | undefined>(undefined);

export const useIdea = () => {
  const context = useContext(IdeaContext);
  if (!context) {
    throw new Error("useIdea must be used within an IdeaProvider");
  }
  return context;
};

interface IdeaProviderProps {
  children: ReactNode;
  ideaData: IdeaAnalysis;
}

export const IdeaProvider = ({ children, ideaData }: IdeaProviderProps) => {
  const [ideaReport, setIdeaReport] = useState<IdeaAnalysis>(ideaData);

  const value = {
    ideaReport,
    setIdeaReport,
  };

  return <IdeaContext.Provider value={value}>{children}</IdeaContext.Provider>;
};
