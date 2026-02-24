import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "$//utils";
import { motion } from "framer-motion";

interface EllipsisTooltipProps {
  children: React.ReactNode;
  className?: string;
  expandedClassName?: string;
  as?: "span" | "div";
  onClick?: React.MouseEventHandler<HTMLSpanElement | HTMLDivElement>;
  onHoverChange?: (hovered: boolean) => void;
  expandedExtra?: (onClick: () => void) => React.ReactNode;
}

export const EllipsisTooltip: React.FC<EllipsisTooltipProps> = ({
  children,
  className,
  expandedClassName,
  as = "span",
  onClick,
  onHoverChange,
  expandedExtra,
}) => {
  const containerRef = useRef<HTMLDivElement | HTMLSpanElement>(null);
  const [isEllipsised, setIsEllipsised] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [overlayHovered, setOverlayHovered] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const checkEllipsis = () => {
      const el = containerRef.current;
      if (!el) return;
      if (
        el.scrollWidth > el.clientWidth ||
        el.scrollHeight > el.clientHeight
      ) {
        setIsEllipsised(true);
      } else {
        setIsEllipsised(false);
      }
    };
    checkEllipsis();
    window.addEventListener("resize", checkEllipsis);
    return () => window.removeEventListener("resize", checkEllipsis);
  }, [children]);

  useEffect(() => {
    if (hovered && containerRef.current) {
      setRect(containerRef.current.getBoundingClientRect());
    }
  }, [hovered]);

  useEffect(() => {
    if (onHoverChange) {
      onHoverChange(hovered || overlayHovered);
    }
  }, [hovered, overlayHovered, onHoverChange]);

  const Comp = as;

  // The expanded overlay
  const expanded =
    (hovered || overlayHovered) && isEllipsised && rect
      ? createPortal(
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 24,
              duration: 0.18,
            }}
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              zIndex: 9999,
              pointerEvents: "auto",
            }}
            className={cn(
              "shadow-lg px-2 py-1 animate-fade-in border border-solid border-t-0 border-r-0 border-l-0 border-primary/10 flex flex-row gap-1 items-start justify-between",
              expandedClassName
            )}
            onMouseEnter={() => setOverlayHovered(true)}
            onMouseLeave={() => setOverlayHovered(false)}
            onClick={onClick}
          >
            <span className="flex-1">{children}</span>
            {expandedExtra && (
              <div className="ml-2">
                {expandedExtra(() => {
                  setHovered(false);
                  setOverlayHovered(false);
                })}
              </div>
            )}
          </motion.div>,
          document.body
        )
      : null;

  return (
    <>
      <Comp
        ref={containerRef as any}
        className={cn(
          "relative overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer transition-colors duration-150",
          className
        )}
        tabIndex={0}
        onMouseEnter={() => isEllipsised && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
      >
        {children}
        {expandedExtra && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            {expandedExtra(() => {
              setHovered(false);
              setOverlayHovered(false);
            })}
          </div>
        )}
      </Comp>
      {expanded}
    </>
  );
};

export default EllipsisTooltip;
