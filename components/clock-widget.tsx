import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ClockWidgetProps {
  className?: string;
}

const ClockWidget = ({ className }: ClockWidgetProps) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format time as "4:45pm" (12-hour format, lowercase am/pm)
  const formatTime = (date: Date): string => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? " PM" : " AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes}${ampm}`;
  };

  // Format date as "11/3/2025" (M/D/YYYY)
  const formatDate = (date: Date): string => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  // Check if transparent background is requested
  const isTransparent = className?.includes("bg-transparent");

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-md transition-all duration-200",
        !isTransparent &&
          "bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background/70",
        className
      )}
    >
      <span className="text-xs font-medium text-foreground">
        {formatTime(currentTime)}
      </span>
      <span className="text-xs font-medium text-foreground">
        {formatDate(currentTime)}
      </span>
    </div>
  );
};

export default ClockWidget;
