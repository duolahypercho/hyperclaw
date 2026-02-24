"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface GuidanceContextType {
  activeTour: string | null;
  currentStep: number;
  isActive: boolean;
  startTour: (tourId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  hasCompletedTour: (tourId: string) => boolean;
}

const GuidanceContext = createContext<GuidanceContextType | undefined>(undefined);

export const useGuidance = () => {
  const context = useContext(GuidanceContext);
  if (!context) {
    throw new Error("useGuidance must be used within a GuidanceProvider");
  }
  return context;
};

interface GuidanceProviderProps {
  children: React.ReactNode;
}

export const GuidanceProvider: React.FC<GuidanceProviderProps> = ({ children }) => {
  const [activeTour, setActiveTour] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedTours, setCompletedTours] = useState<Set<string>>(new Set());

  // Load completed tours from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("hypercho-guidance-completed");
    if (stored) {
      try {
        const completed = JSON.parse(stored) as string[];
        setCompletedTours(new Set(completed));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const startTour = useCallback((tourId: string) => {
    setActiveTour(tourId);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => prev + 1);
  }, []);

  const previousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    setActiveTour(null);
    setCurrentStep(0);
  }, []);

  const completeTour = useCallback(() => {
    if (activeTour) {
      const newCompleted = new Set(completedTours);
      newCompleted.add(activeTour);
      setCompletedTours(newCompleted);
      
      // Persist to localStorage
      localStorage.setItem(
        "hypercho-guidance-completed",
        JSON.stringify(Array.from(newCompleted))
      );
    }
    setActiveTour(null);
    setCurrentStep(0);
  }, [activeTour, completedTours]);

  const hasCompletedTour = useCallback(
    (tourId: string) => {
      return completedTours.has(tourId);
    },
    [completedTours]
  );

  const value: GuidanceContextType = {
    activeTour,
    currentStep,
    isActive: activeTour !== null,
    startTour,
    nextStep,
    previousStep,
    skipTour,
    completeTour,
    hasCompletedTour,
  };

  return (
    <GuidanceContext.Provider value={value}>{children}</GuidanceContext.Provider>
  );
};
