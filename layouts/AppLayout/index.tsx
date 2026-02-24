import React, { useRef, memo, useMemo } from "react";
import { initialSizeType, ResizeDirection, useDraggable } from "./useDraggable";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "$/utils";
import Expandable from "./Expandable";

interface AppLayoutProps {
  children: React.ReactNode;
  showState: boolean;
  uniqueKey: string;
  initialSize?: initialSizeType;
  className?: string;
  moveable?: boolean;
  expandActive?: boolean;
  variant?: "minimal" | "default" | "expandable";
}

const AppLayout = memo(
  ({
    children,
    showState,
    uniqueKey,
    initialSize,
    className,
    moveable = true,
    expandActive = false,
    variant = "default",
  }: AppLayoutProps) => {
    const appRef = useRef<HTMLDivElement>(null);
    const { position, size, handleMouseDown, handleResizeStart } = useDraggable(
      {
        elementRef: appRef,
        id: uniqueKey,
        initialSize,
        isExpandable: variant === "expandable",
        expandActive: variant === "expandable" ? expandActive : false,
        expandedHeight: 600, // Height when expanded
      }
    );

    // Memoize animation variants to prevent unnecessary re-renders
    const animationVariants = useMemo(
      () => ({
        initial: { scale: 0.2, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.2, opacity: 0 },
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 25,
        },
      }),
      []
    );

    if (variant === "minimal") {
      return (
        <AnimatePresence>
          {showState && (
            <motion.div
              ref={appRef}
              className="fixed z-10"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: size.width,
                height: "auto",
              }}
              initial={animationVariants.initial}
              animate={animationVariants.animate}
              exit={animationVariants.exit}
              transition={animationVariants.transition}
            >
              <div className="relative w-full h-full">
                <div
                  className={cn(
                    `bg-background border border-primary/10 border-solid p-6 pt-0 rounded-md shadow-2xl transition-all duration-300 grid grid-rows-[auto_1fr] w-full h-fit overflow-hidden`,
                    className
                  )}
                >
                  {moveable && (
                    <div
                      className="flex justify-center py-1 group"
                      onMouseDown={handleMouseDown}
                    >
                      <div className="w-20 h-1 bg-muted-foreground/40 group-hover:bg-muted-foreground/60 transition-colors group-hover:scale-105 rounded-full" />
                    </div>
                  )}
                  <div className="h-fit overflow-auto">{children}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      );
    }

    if (variant === "expandable") {
      return (
        <Expandable
          appRef={appRef}
          showState={showState}
          children={children}
          expandActive={expandActive}
          position={position}
          size={size}
          className={className}
          moveable={moveable}
          handleMouseDown={handleMouseDown}
        />
      );
    }

    return (
      <AnimatePresence>
        {showState && (
          <motion.div
            ref={appRef} // Add ref to the motion.div
            className="fixed z-10 select-none"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              width: size.width,
              height: size.height,
            }}
            initial={animationVariants.initial}
            animate={animationVariants.animate}
            exit={animationVariants.exit}
            transition={animationVariants.transition}
          >
            <div className="relative w-full h-full">
              <div
                className={cn(
                  `bg-background border border-primary/10 border-solid p-6 pt-0 rounded-md shadow-2xl transition-all duration-300 grid grid-rows-[auto_1fr] w-full h-full overflow-hidden`,
                  className
                )}
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
              </div>
              {moveable && (
                <>
                  <div
                    className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.TopLeft)
                    }
                  />
                  <div
                    className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.TopRight)
                    }
                  />
                  <div
                    className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.BottomRight)
                    }
                  />
                  <div
                    className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.BottomLeft)
                    }
                  />
                  <div
                    className="absolute top-0 w-full h-1 cursor-n-resize z-40"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.Top)
                    }
                  />
                  <div
                    className="absolute bottom-0 w-full h-1 cursor-s-resize z-40"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.Bottom)
                    }
                  />
                  <div
                    className="absolute left-0 top-0 h-full w-1 cursor-w-resize z-40"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.Left)
                    }
                  />
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-e-resize z-40"
                    onMouseDown={(e) =>
                      handleResizeStart(e, ResizeDirection.Right)
                    }
                  />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

AppLayout.displayName = "AppLayout";

export default AppLayout;
