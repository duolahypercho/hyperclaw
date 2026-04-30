import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useMemo } from "react";
import { useInteractApp } from "@OS/Provider/InteractAppProv";
import { cn } from "../../utils";

export type AnimationType = "Left" | "Right" | "Top" | "Bottom" | "Search";

export interface RightContentLayoutType {
  body: React.ReactNode;
  className?: string;
  width?: string;
  animation?: AnimationType;
  onAnimationComplete?: () => void;
  animationKey?: string;
}

const RightContentLayout = ({
  rightContent,
}: {
  rightContent?: RightContentLayoutType;
}) => {
  if (!rightContent) return null;

  const {
    body,
    className,
    width = "420px",
    animation = "Left",
    onAnimationComplete,
    animationKey,
  } = rightContent;
  const { detail } = useInteractApp();

  // Optimized animation variants
  const slideVariants = {
    hidden: {
      opacity: 0,
    },
    visible: {
      opacity: 1,
    },
    exit: {
      opacity: 0,
    },
  };

  // Optimized transition - faster and smoother
  const transition = {
    type: "tween" as const,
    duration: 0.2, // Reduced from 0.3 for snappier feel
    ease: "easeOut" as const,
    delay: 0.05, // Small delay to let width animation start
  };

  return (
    <motion.div
      initial={false}
      animate={{
        width: detail ? width : "0px",
      }}
      transition={{
        type: "tween",
        duration: 0.15, // Very fast width animation
        ease: "easeOut",
      }}
      className="h-full overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {detail && (
          <motion.div
            key={animationKey || "detail"}
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={transition}
            onAnimationComplete={onAnimationComplete}
            className="h-full flex flex-col"
            style={{ width }}
          >
            <div
              className={cn(
                "w-full h-full mx-auto bg-card shadow-sm flex flex-col border border-solid border-primary/10 border-t-0 border-r-0 border-b-0 overflow-y-auto customScrollbar2",
                className
              )}
            >
              {body}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RightContentLayout;
