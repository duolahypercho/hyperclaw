"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plug, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeviceSetupDialog } from "./DeviceSetupDialog";

interface OpenClawSetupPromptProps {
  /** Custom icon to display. Defaults to Plug. */
  icon?: React.ReactNode;
  /** Title text. Defaults to "Connect OpenClaw". */
  title?: string;
  /** Description text explaining what the feature needs OpenClaw for. */
  description?: string;
  /** Optional error message to display. */
  error?: string | null;
  /** Called when user clicks "Setup OpenClaw". If not provided, opens inline dialog. */
  onSetup?: () => void;
  /** Called when setup completes successfully (only used with inline dialog). */
  onSetupComplete?: () => void;
  /** Called when user clicks "Retry" (if provided). */
  onRetry?: () => void;
  /** Whether a retry is in progress. */
  retrying?: boolean;
  /** Additional className for the container. */
  className?: string;
  /** Size variant. */
  size?: "sm" | "md" | "lg";
  /** If true, opens external page instead of inline dialog. Default false. */
  externalSetup?: boolean;
}

/**
 * A friendly, non-alarming prompt shown in OpenClaw-specific features
 * when OpenClaw is not connected. Replaces error states with helpful
 * guidance to set up OpenClaw.
 */
export function OpenClawSetupPrompt({
  icon,
  title = "Connect OpenClaw",
  description = "This feature requires OpenClaw — your local AI gateway for scheduled tasks, multi-channel messaging, and agent orchestration.",
  error,
  onSetup,
  onSetupComplete,
  onRetry,
  retrying = false,
  className,
  size = "md",
  externalSetup = false,
}: OpenClawSetupPromptProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSetupComplete = useCallback(() => {
    setDialogOpen(false);
    onSetupComplete?.();
    // Also trigger retry to refresh the component's data
    onRetry?.();
  }, [onSetupComplete, onRetry]);

  const sizeStyles = {
    sm: {
      container: "p-4",
      icon: "w-10 h-10",
      iconInner: "w-5 h-5",
      title: "text-sm",
      description: "text-xs max-w-[220px]",
      button: "h-7 text-xs",
    },
    md: {
      container: "p-6",
      icon: "w-12 h-12",
      iconInner: "w-6 h-6",
      title: "text-base",
      description: "text-sm max-w-[280px]",
      button: "h-8 text-xs",
    },
    lg: {
      container: "p-8",
      icon: "w-16 h-16",
      iconInner: "w-8 h-8",
      title: "text-lg",
      description: "text-sm max-w-[320px]",
      button: "h-9 text-sm",
    },
  };

  const styles = sizeStyles[size];

  const handleSetup = () => {
    if (onSetup) {
      onSetup();
    } else if (externalSetup) {
      // Open Devices page in new tab
      window.open("/Tool/Devices", "_blank");
    } else {
      // Open inline dialog
      setDialogOpen(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        styles.container,
        className
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "rounded-xl bg-primary/10 flex items-center justify-center mb-4",
          styles.icon
        )}
      >
        {icon || (
          <Plug className={cn("text-primary", styles.iconInner)} />
        )}
      </div>

      {/* Title */}
      <h3
        className={cn(
          "font-medium text-foreground mb-2",
          styles.title
        )}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        className={cn(
          "text-muted-foreground leading-relaxed mb-4",
          styles.description
        )}
      >
        {description}
      </p>

      {/* Error message */}
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-4 max-w-[280px]">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className={cn("gap-1.5", styles.button)}
          >
            {retrying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : null}
            {retrying ? "Retrying..." : "Retry"}
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={handleSetup}
          className={cn("gap-1.5", styles.button)}
        >
          Setup OpenClaw
        </Button>
      </div>

      {/* Inline setup dialog */}
      <DeviceSetupDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onComplete={handleSetupComplete}
        title="Connect OpenClaw"
        description="Install the connector on your machine to enable OpenClaw features like scheduled tasks, multi-channel messaging, and agent orchestration."
      />
    </motion.div>
  );
}

export default OpenClawSetupPrompt;
