"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GuidanceStep as GuidanceStepType, GuidanceStepPosition } from "./types";
import { GuidanceOverlay } from "./GuidanceOverlay";

interface GuidanceStepProps {
  step: GuidanceStepType;
  stepIndex: number;
  totalSteps: number;
  isActive: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onComplete?: () => void;
  showSkipButton?: boolean;
  showProgress?: boolean;
}

const getPositionStyles = (
  position: GuidanceStepPosition,
  targetRect: DOMRect | null,
  offset: { x?: number; y?: number } = {}
): React.CSSProperties => {
  if (!targetRect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const { x: offsetX = 0, y: offsetY = 0 } = offset;
  const spacing = 12; // Reduced spacing for closer positioning
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
  const hintWidth = 384; // max-w-sm = 384px
  const hintHeight = 200; // approximate height

  switch (position) {
    case "top": {
      // Position above the target, aligned to target's left edge
      let top = targetRect.top - spacing;
      let left = targetRect.left;
      
      // If hint goes above viewport, position below instead
      if (top - hintHeight < 0) {
        top = targetRect.bottom + spacing;
      }
      
      // Ensure hint stays within viewport horizontally
      if (left < 0) {
        left = 0;
      } else if (left + hintWidth > viewportWidth) {
        left = viewportWidth - hintWidth;
      }
      
      return {
        position: "fixed",
        top: `${top + offsetY}px`,
        left: `${left + offsetX}px`,
        transform: "translate(0, -100%)",
      };
    }
    case "bottom": {
      // Position below the target, aligned to target's left edge
      let top = targetRect.bottom + spacing;
      let left = targetRect.left;
      
      // If hint goes below viewport, position above instead
      if (top + hintHeight > viewportHeight) {
        top = targetRect.top - spacing;
      }
      
      // Ensure hint stays within viewport horizontally
      if (left < 0) {
        left = 0;
      } else if (left + hintWidth > viewportWidth) {
        left = viewportWidth - hintWidth;
      }
      
      return {
        position: "fixed",
        top: `${top + offsetY}px`,
        left: `${left + offsetX}px`,
        transform: "translate(0, 0)",
      };
    }
    case "left": {
      // Position to the left of the target, centered vertically
      let top = targetRect.top + targetRect.height / 2;
      // Position hint's left edge to the left of target
      let left = targetRect.left - hintWidth - spacing;
      
      // Check if hint would go off left edge
      if (left < 0) {
        // Not enough space, align hint's right edge to viewport right edge
        left = viewportWidth - hintWidth;
      }
      
      // Ensure hint doesn't go off right edge
      if (left + hintWidth > viewportWidth) {
        left = viewportWidth - hintWidth;
      }
      
      // Adjust vertical position if needed
      const halfHeight = hintHeight / 2;
      if (top - halfHeight < 0) {
        top = halfHeight;
      } else if (top + halfHeight > viewportHeight) {
        top = viewportHeight - halfHeight;
      }
      
      return {
        position: "fixed",
        top: `${top + offsetY}px`,
        left: `${left + offsetX}px`,
        transform: "translate(0, -50%)",
      };
    }
    case "right": {
      // Position to the right of the target, centered vertically
      let top = targetRect.top + targetRect.height / 2;
      let left = targetRect.right + spacing;
      
      // If hint goes off right edge, position to the left instead
      if (left + hintWidth > viewportWidth) {
        left = targetRect.left - spacing;
      }
      
      // If hint goes above or below viewport, adjust
      const halfHeight = hintHeight / 2;
      if (top - halfHeight < 0) {
        top = halfHeight;
      } else if (top + halfHeight > viewportHeight) {
        top = viewportHeight - halfHeight;
      }
      
      return {
        position: "fixed",
        top: `${top + offsetY}px`,
        left: `${left + offsetX}px`,
        transform: "translate(0, -50%)",
      };
    }
    case "center":
    default:
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
  }
};

export const GuidanceStep: React.FC<GuidanceStepProps> = ({
  step,
  stepIndex,
  totalSteps,
  isActive,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  showSkipButton = true,
  showProgress = true,
}) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [targetFound, setTargetFound] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (isActive && isMounted) {
      // Execute beforeStep callback
      if (step.beforeStep) {
        Promise.resolve(step.beforeStep()).catch(console.error);
      }

      // Find target element
      let element: HTMLElement | null = null;
      
      if (step.target.startsWith("[data-")) {
        const attrName = step.target.match(/\[data-([^\]]+)\]/)?.[1];
        if (attrName) {
          element = document.querySelector(`[data-${attrName}]`) as HTMLElement;
        }
      } else {
        element = document.querySelector(step.target) as HTMLElement;
      }

      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        setTargetFound(true);
        
        // Scroll into view
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      } else {
        setTargetFound(false);
        if (!step.skipIfNotFound) {
          // Retry after a short delay
          const timeout = setTimeout(() => {
            const retryElement = document.querySelector(step.target) as HTMLElement;
            if (retryElement) {
              const rect = retryElement.getBoundingClientRect();
              setTargetRect(rect);
              setTargetFound(true);
            }
          }, 500);
          return () => clearTimeout(timeout);
        }
      }
    } else {
      setTargetRect(null);
      setTargetFound(false);
    }
  }, [isActive, step.target, step.skipIfNotFound, step.beforeStep, isMounted]);

  if (!isMounted || !isActive) {
    return null;
  }

  // If target not found and skipIfNotFound is true, skip this step
  if (!targetFound && step.skipIfNotFound) {
    return null;
  }

  const position = step.position || "bottom";
  const positionStyles = getPositionStyles(position, targetRect, step.offset);

  const isLastStep = stepIndex === totalSteps - 1;
  const isFirstStep = stepIndex === 0;

  return (
    <>
      <GuidanceOverlay
        targetSelector={step.target}
        isActive={isActive && targetFound}
        padding={step.highlightPadding || 8}
        onTargetFound={(element) => {
          const rect = element.getBoundingClientRect();
          setTargetRect(rect);
        }}
      />
      {createPortal(
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
              style={positionStyles}
              className="z-[9999] max-w-sm w-full"
            >
              <div className="bg-popover border border-primary/30 rounded-lg shadow-xl backdrop-blur-sm p-4 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base text-foreground mb-1">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {showSkipButton && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={onSkip}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Progress */}
                {showProgress && totalSteps > 1 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
                        transition={{ duration: 0.3 }}
                        className="h-full bg-primary rounded-full"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {stepIndex + 1} / {totalSteps}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {!isFirstStep && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onPrevious}
                        className="flex items-center gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                    )}
                  </div>
                  <Button
                    onClick={isLastStep ? (onComplete ?? onSkip) : onNext}
                    size="sm"
                    className="flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isLastStep ? (
                      <>
                        <Check className="h-4 w-4" />
                        Complete
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
