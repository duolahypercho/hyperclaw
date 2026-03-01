"use client";

import React, { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useGuidance } from "./GuidanceProvider";
import { GuidanceStep } from "./GuidanceStep";
import { GuidanceConfig } from "./types";

interface GuidanceProps {
  config: GuidanceConfig;
  autoStart?: boolean;
  checkCompletion?: boolean;
}

export const Guidance: React.FC<GuidanceProps> = ({
  config,
  autoStart = false,
  checkCompletion = true,
}) => {
  const {
    activeTour,
    currentStep,
    isActive,
    startTour,
    nextStep,
    previousStep,
    skipTour,
    completeTour,
    hasCompletedTour,
  } = useGuidance();

  const isThisTourActive = activeTour === config.id;
  const currentStepData = config.steps[currentStep];

  useEffect(() => {
    if (autoStart && !checkCompletion) {
      startTour(config.id);
    } else if (autoStart && checkCompletion && !hasCompletedTour(config.id)) {
      startTour(config.id);
    }
  }, [autoStart, checkCompletion, config.id, startTour, hasCompletedTour]);

  const handleNext = () => {
    if (currentStepData?.afterStep) {
      Promise.resolve(currentStepData.afterStep())
        .then(() => {
          if (currentStep < config.steps.length - 1) {
            nextStep();
          } else {
            handleComplete();
          }
        })
        .catch(console.error);
    } else {
      if (currentStep < config.steps.length - 1) {
        nextStep();
      } else {
        handleComplete();
      }
    }
  };

  const handlePrevious = () => {
    previousStep();
  };

  const handleSkip = () => {
    if (config.onSkip) {
      config.onSkip();
    }
    // Mark as completed even when skipped
    completeTour();
    
    // Also save to custom storage key if provided
    if (config.storageKey) {
      localStorage.setItem(config.storageKey, "true");
    }
  };

  const handleComplete = () => {
    if (config.onComplete) {
      config.onComplete();
    }
    completeTour();
    
    // Also save to custom storage key if provided
    if (config.storageKey) {
      localStorage.setItem(config.storageKey, "true");
    }
  };

  if (!isThisTourActive || !currentStepData) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <GuidanceStep
        key={currentStep}
        step={currentStepData}
        stepIndex={currentStep}
        totalSteps={config.steps.length}
        isActive={isThisTourActive}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onSkip={handleSkip}
        onComplete={handleComplete}
        showSkipButton={config.showSkipButton !== false}
        showProgress={config.showProgress !== false}
      />
    </AnimatePresence>
  );
};
