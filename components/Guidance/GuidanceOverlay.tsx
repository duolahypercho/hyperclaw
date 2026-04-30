"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface GuidanceOverlayProps {
  targetSelector: string;
  isActive: boolean;
  padding?: number;
  onTargetFound?: (element: HTMLElement) => void;
  onTargetNotFound?: () => void;
}

export const GuidanceOverlay: React.FC<GuidanceOverlayProps> = ({
  targetSelector,
  isActive,
  padding = 8,
  onTargetFound,
  onTargetNotFound,
}) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (!isActive || !isMounted) {
      setTargetRect(null);
      return;
    }

    const findTarget = () => {
      // Try data attribute first
      let element: HTMLElement | null = null;
      
      if (targetSelector.startsWith("[data-")) {
        const attrName = targetSelector.match(/\[data-([^\]]+)\]/)?.[1];
        if (attrName) {
          element = document.querySelector(`[data-${attrName}]`) as HTMLElement;
        }
      } else {
        // Try as CSS selector
        element = document.querySelector(targetSelector) as HTMLElement;
      }

      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        onTargetFound?.(element);
        
        // Scroll element into view if needed
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });

        // Set up ResizeObserver to track element position changes
        if (observerRef.current) {
          observerRef.current.disconnect();
        }

        observerRef.current = new ResizeObserver(() => {
          const newRect = element!.getBoundingClientRect();
          setTargetRect(newRect);
        });

        observerRef.current.observe(element);

        // Also listen to scroll events
        const handleScroll = () => {
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            const newRect = element!.getBoundingClientRect();
            setTargetRect(newRect);
          }, 10);
        };

        window.addEventListener("scroll", handleScroll, true);
        window.addEventListener("resize", handleScroll);

        return () => {
          if (observerRef.current) {
            observerRef.current.disconnect();
          }
          window.removeEventListener("scroll", handleScroll, true);
          window.removeEventListener("resize", handleScroll);
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
        };
      } else {
        setTargetRect(null);
        onTargetNotFound?.();
      }
    };

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(findTarget, 100);

    return () => {
      clearTimeout(timeout);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [targetSelector, isActive, isMounted, padding, onTargetFound, onTargetNotFound]);

  if (!isMounted || !isActive || !targetRect) {
    return null;
  }

  const highlightLeft = targetRect.left - padding;
  const highlightTop = targetRect.top - padding;
  const highlightWidth = targetRect.width + padding * 2;
  const highlightHeight = targetRect.height + padding * 2 ;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;

  return createPortal(
    <AnimatePresence>
      {isActive && targetRect && (
        <>
          {/* Top section - covers entire width above highlight */}
          {highlightTop > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: `${highlightTop}px`,
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 9997,
                pointerEvents: "auto",
              }}
            />
          )}
          
          {/* Bottom section - covers entire width below highlight */}
          {highlightTop + highlightHeight < viewportHeight && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "fixed",
                top: `${highlightTop + highlightHeight}px`,
                left: 0,
                width: "100%",
                height: `${viewportHeight - (highlightTop + highlightHeight)}px`,
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 9997,
                pointerEvents: "auto",
              }}
            />
          )}

          {/* Left section - covers left side of highlight area */}
          {highlightLeft > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "fixed",
                top: `${highlightTop}px`,
                left: 0,
                width: `${highlightLeft}px`,
                height: `${highlightHeight}px`,
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 9997,
                pointerEvents: "auto",
              }}
            />
          )}

          {/* Right section - covers right side of highlight area */}
          {highlightLeft + highlightWidth < viewportWidth && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "fixed",
                top: `${highlightTop}px`,
                left: `${highlightLeft + highlightWidth}px`,
                width: `${viewportWidth - (highlightLeft + highlightWidth)}px`,
                height: `${highlightHeight}px`,
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 9997,
                pointerEvents: "auto",
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};