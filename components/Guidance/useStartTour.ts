"use client";

import { useCallback } from "react";
import { useGuidance } from "./GuidanceProvider";

/**
 * Hook to programmatically start a guidance tour
 *
 * @example
 * ```tsx
 * const startOnboarding = useStartTour("copanion-onboarding");
 *
 * <Button onClick={startOnboarding}>Start Tour</Button>
 * ```
 */
export const useStartTour = (tourId: string) => {
  const { startTour, hasCompletedTour } = useGuidance();

  const start = useCallback(() => {
    startTour(tourId);
  }, [tourId, startTour]);

  return start;
};

/**
 * Hook to check if a tour has been completed
 *
 * @example
 * ```tsx
 * const hasCompleted = useHasCompletedTour("copanion-onboarding");
 * ```
 */
export const useHasCompletedTour = (tourId: string) => {
  const { hasCompletedTour } = useGuidance();
  return hasCompletedTour(tourId);
};
