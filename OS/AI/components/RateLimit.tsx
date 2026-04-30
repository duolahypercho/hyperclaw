"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePricingModal } from "$/Providers/PricingModalProv";
import { Button } from "@/components/ui/button";

interface RateLimitProps {
  remaining: number;
  limit: number;
  resetTime: number;
  className?: string;
  onClose?: () => void;
}

export const RateLimit: React.FC<RateLimitProps> = ({
  remaining,
  limit,
  resetTime,
  className = "",
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const { openModal } = usePricingModal();

  // Calculate usage percentage
  const usagePercentage = useMemo(
    () => ((limit - remaining) / limit) * 100,
    [remaining, limit]
  );

  // Format reset time as static date/time
  const formattedResetTime = useMemo(() => {
    const date = new Date(resetTime);
    const now = new Date();

    // Check if it's today
    const isToday = date.toDateString() === now.toDateString();

    // Check if it's tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    // Format time as HH:MM AM/PM
    const timeString = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) {
      return `Today at ${timeString}`;
    } else if (isTomorrow) {
      return `Tomorrow at ${timeString}`;
    } else {
      // Format as "Mon, Jan 1 at 12:00 PM"
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  }, [resetTime]);

  // Determine status and styling
  const getStatusInfo = useMemo(() => {
    if (remaining === 0) {
      return {
        icon: AlertTriangle,
        color: "text-destructive",
        bgColor: "bg-destructive/10 border-destructive/30",
        dotColor: "bg-destructive",
      };
    } else if (usagePercentage >= 80) {
      return {
        icon: AlertTriangle,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10 border-yellow-500/30",
        dotColor: "bg-yellow-500",
      };
    } else {
      return {
        icon: CheckCircle2,
        color: "text-primary",
        bgColor: "bg-primary/10 border-primary/30",
        dotColor: "bg-primary",
      };
    }
  }, [remaining, usagePercentage]);

  const statusInfo = getStatusInfo;

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose?.(), 200);
  };

  // Don't show the component at all in normal state
  const shouldShow = useMemo(
    () => remaining === 0 || usagePercentage >= 80,
    [remaining, usagePercentage]
  );

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "flex items-center justify-between gap-4 px-4 py-2.5 rounded-lg border backdrop-blur-sm",
            statusInfo.bgColor,
            className
          )}
        >
          {/* Left: Status Info - Two Lines */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* First Line: Messages Left */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="font-medium text-foreground">
                {remaining}/{limit}
              </span>
              <span className="text-muted-foreground font-medium">
                Messages Left
              </span>
            </div>

            {/* Second Line: Reset Time */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-muted-foreground font-medium">
                Resets {formattedResetTime}
              </span>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Upgrade Now Button - Only show when rate limit is hit */}
            {remaining === 0 && (
              <Button
                onClick={openModal}
                size="sm"
                variant="default"
                className="h-8 px-3 text-xs font-medium gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade Now
              </Button>
            )}

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="group p-1.5 hover:bg-background/50 rounded transition-colors"
              aria-label="Close rate limit indicator"
            >
              <X className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RateLimit;
