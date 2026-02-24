"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import Live2DModelComponent from "./live2d/Live2DModel";

interface Live2DWrapperProps {
  modelSrc: string;
  width?: number;
  height?: number;
  className?: string;
  fillParent?: boolean; // New prop to fill parent container
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onError?: (error: Error) => void;
  onModelReady?: (model: any) => void; // New prop to pass model reference
  // Action system props
  onActionTrigger?: (
    actionId: string,
    motionGroup?: string | number,
    motionIndex?: number
  ) => void;
  onExpressionChange?: (expression: string) => void;
  onSoundPlay?: (soundId: string) => void;
}

type LoadingState = "idle" | "loading" | "success" | "error";

/**
 * Professional wrapper for Live2D model with proper loading states,
 * error handling, and retry logic.
 */
export const Live2DWrapper: React.FC<Live2DWrapperProps> = ({
  modelSrc,
  width = 350,
  height = 260,
  className = "",
  fillParent = false,
  onLoadStart,
  onLoadComplete,
  onError,
  onModelReady,
  onActionTrigger,
  onExpressionChange,
  onSoundPlay,
}) => {
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    onLoadStart?.();
  }, [onLoadStart]);

  const handleRetry = () => {
    setError(null);
    setLoadingState("loading");
    setRetryCount((prev) => prev + 1);
    onLoadStart?.();
  };

  const handleUseFallback = () => {
    setUseFallback(true);
    setLoadingState("success");
    onLoadComplete?.();
  };

  const handleLoadComplete = () => {
    setLoadingState("success");
    onLoadComplete?.();
  };

  const handleModelReady = (model: any) => {
    onModelReady?.(model);
  };

  const handleError = (err: Error) => {
    console.error("❌ Live2D model loading error:", err);

    // Provide more specific error messages based on error type
    let userFriendlyMessage = err.message;
    if (err.message.includes("Failed to load required dependencies")) {
      userFriendlyMessage =
        "Live2D runtime failed to load. Please refresh the page.";
    } else if (err.message.includes("Canvas element not available")) {
      userFriendlyMessage = "Display initialization failed. Please try again.";
    } else if (
      err.message.includes("network") ||
      err.message.includes("fetch")
    ) {
      userFriendlyMessage =
        "Network error loading character model. Check your connection.";
    }

    const enhancedError = new Error(userFriendlyMessage);
    setError(enhancedError);
    setLoadingState("error");
    onError?.(enhancedError);
  };

  return (
    <div
      className={`relative ${className}`}
      style={fillParent ? { width: "100%", height: "100%" } : { width, height }}
    >
      <AnimatePresence mode="wait">
        {/* Loading State */}
        {loadingState === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm"
          >
            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <Loader2 className="w-8 h-8 text-primary" />
            </motion.div>
            <motion.p
              className="mt-3 text-sm text-muted-foreground"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Loading character...
            </motion.p>
            {retryCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground/70">
                Retry attempt {retryCount}
              </p>
            )}
          </motion.div>
        )}

        {/* Error State */}
        {loadingState === "error" && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/5 backdrop-blur-sm p-4"
          >
            <div className="flex flex-col items-center gap-3 text-center max-w-[280px]">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  Failed to Load Character
                </h4>
                <p className="text-xs text-muted-foreground">
                  {error?.message || "An unexpected error occurred"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  className="gap-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  Try Again
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleUseFallback}
                  className="gap-2"
                >
                  Use Fallback
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live2D Model or Fallback - Always render but hide when not ready */}
      <div
        className={`w-full h-full ${
          loadingState === "success"
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        } transition-opacity duration-300`}
      >
        {useFallback ? (
          // Fallback UI when Live2D fails
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm rounded-lg">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center"
            >
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Hypercho Companion
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Character model unavailable
              </p>
              <motion.div
                animate={{
                  scale: [1, 1.05, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-2 h-2 mx-auto rounded-full bg-primary"
              />
            </motion.div>
          </div>
        ) : (
          // Live2D Model
          <Live2DModelComponent
            key={`model-${retryCount}`} // Force remount on retry
            modelSrc={modelSrc}
            width={fillParent ? undefined : width}
            height={fillParent ? undefined : height}
            className="w-full h-full"
            onLoadComplete={handleLoadComplete}
            onLoadError={handleError}
            onModelReady={handleModelReady}
            onActionTrigger={onActionTrigger}
            onExpressionChange={onExpressionChange}
            onSoundPlay={onSoundPlay}
          />
        )}
      </div>
    </div>
  );
};
