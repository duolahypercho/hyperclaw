// components/Tool/X/component/CharacterCounter.tsx
import { cn } from "$/utils";
import { motion } from "framer-motion";
import { useMemo } from "react";

interface CharacterCounterProps {
  count: number;
  maxCount: number;
  verified: boolean;
  width?: string;
  height?: string;
}

export function CharacterCounter({
  count,
  maxCount,
  verified,
}: CharacterCounterProps) {
  const isOverLimit = useMemo(() => count > maxCount, [count, maxCount]);
  const isNearLimit = useMemo(() => count > maxCount * 0.8, [count, maxCount]);
  const showCount = useMemo(() => maxCount - count <= 20, [maxCount, count]);
  const percentage = useMemo(
    () => Math.min((count / maxCount) * 100, 100),
    [count, maxCount]
  );

  // Calculate the circumference of the circle
  const size = 24;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate the stroke dash offset based on the percentage
  const strokeDashoffset = useMemo(
    () => circumference - (percentage / 100) * circumference,
    [percentage, circumference]
  );

  if (isOverLimit) {
    if (verified) {
      // Show the full circle (100% progress) for verified users, regardless of count
      return (
        <div className="relative inline-flex items-center justify-center">
          <svg
            className={cn("transform -rotate-90 w-6 h-6 text-accent")}
            viewBox="0 0 24 24"
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              opacity={0.2}
            />
            {/* Full progress circle */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            />
          </svg>
        </div>
      );
    }

    return (
      <motion.span
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className={cn(
          "text-sm font-medium flex items-center justify-center",
          count - maxCount > 10 ? "text-destructive" : "text-destructive/80"
        )}
      >
        {maxCount - count}
      </motion.span>
    );
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        className={cn(
          "transform -rotate-90 w-6 h-6",
          isNearLimit ? "text-destructive/80" : "text-accent"
        )}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          opacity={0.2}
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />
      </svg>
      {/* Counter text - only show when last 20 characters */}
      {showCount && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            "absolute text-xs font-medium",
            isNearLimit ? "text-destructive/80" : "text-primary"
          )}
        >
          {maxCount - count}
        </motion.span>
      )}
    </div>
  );
}
