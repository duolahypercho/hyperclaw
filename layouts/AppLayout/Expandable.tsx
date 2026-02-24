import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ExpandableProps {
  appRef: React.RefObject<HTMLDivElement>;
  showState: boolean;
  children: React.ReactNode;
  expandActive: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  className?: string;
  moveable: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

const Expandable = ({
  appRef,
  showState,
  children,
  expandActive,
  position,
  size,
  className,
  moveable,
  handleMouseDown,
}: ExpandableProps) => {
  // Calculate expand direction and safe position based on screen position
  const [expandDirection, setExpandDirection] = useState<"up" | "down">("down");
  const [safePosition, setSafePosition] = useState(position);
  const [hasCalculatedDirection, setHasCalculatedDirection] = useState(false);

  useEffect(() => {
    // Only calculate expand direction when first becoming expandActive
    // Don't recalculate during dragging to prevent jumping
    if (
      expandActive &&
      !hasCalculatedDirection &&
      typeof window !== "undefined"
    ) {
      const screenHeight = window.innerHeight;
      const screenWidth = window.innerWidth;
      const elementY = position.y;
      const elementX = position.x;
      const expandedHeight = 600;
      const margin = 20;

      // Check if expanding down would go off screen
      const wouldGoOffScreenDown =
        elementY + expandedHeight > screenHeight - margin;

      // Check if expanding up would go off screen
      const wouldGoOffScreenUp =
        elementY - (expandedHeight - size.height) < margin;

      // Choose direction based on which has more space
      const spaceBelow = screenHeight - elementY - margin;
      const spaceAbove = elementY - margin;

      let direction: "up" | "down" = "down";
      let calculatedY = elementY;

      if (wouldGoOffScreenDown && !wouldGoOffScreenUp) {
        // Must expand up
        direction = "up";
        // Calculate safe Y position for upward expansion
        calculatedY = Math.max(
          margin,
          Math.min(elementY, screenHeight - expandedHeight - margin)
        );
      } else if (wouldGoOffScreenUp && !wouldGoOffScreenDown) {
        // Must expand down
        direction = "down";
        // Calculate safe Y position for downward expansion
        calculatedY = Math.max(
          margin,
          Math.min(elementY, screenHeight - expandedHeight - margin)
        );
      } else {
        // Both directions possible, choose the one with more space
        direction = spaceBelow >= spaceAbove ? "down" : "up";

        if (direction === "up") {
          // Calculate safe Y position for upward expansion
          calculatedY = Math.max(
            margin,
            Math.min(elementY, screenHeight - expandedHeight - margin)
          );
        } else {
          // Calculate safe Y position for downward expansion
          calculatedY = Math.max(
            margin,
            Math.min(elementY, screenHeight - expandedHeight - margin)
          );
        }
      }

      // Ensure X position is also within bounds
      const calculatedX = Math.max(
        margin,
        Math.min(elementX, screenWidth - size.width - margin)
      );

      setExpandDirection(direction);
      setSafePosition({ x: calculatedX, y: calculatedY });
      setHasCalculatedDirection(true);
    }

    // Reset calculation flag when expandActive becomes false
    if (!expandActive) {
      setHasCalculatedDirection(false);
      setSafePosition(position); // Reset to original position
    }
  }, [
    expandActive,
    position.y,
    position.x,
    hasCalculatedDirection,
    size.height,
    size.width,
  ]);

  // Update safe position when not expanded to follow the normal position
  useEffect(() => {
    if (!expandActive) {
      setSafePosition(position);
    }
  }, [position, expandActive]);

  return (
    <AnimatePresence>
      {showState && (
        <motion.div
          ref={appRef}
          className="fixed z-10"
          style={{
            left: `${safePosition.x}px`,
            top: `${safePosition.y}px`,
            width: size.width,
          }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.2, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
          }}
        >
          <div className="relative w-full">
            <motion.div
              className={cn(
                `bg-background border border-primary/10 border-solid p-6 pt-0 rounded-md shadow-2xl grid grid-rows-[auto_1fr] w-full`,
                className
              )}
              animate={{
                height: expandActive ? 600 : "auto",
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                duration: 0.3,
              }}
              style={{
                transformOrigin: expandDirection === "up" ? "bottom" : "top",
              }}
            >
              {moveable && (
                <div
                  className="flex justify-center py-1 group"
                  onMouseDown={handleMouseDown}
                >
                  <div className="w-20 h-1 bg-muted-foreground/40 group-hover:bg-muted-foreground/60 transition-colors group-hover:scale-105 rounded-full" />
                </div>
              )}
              <div className="h-full overflow-auto">{children}</div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Expandable;
