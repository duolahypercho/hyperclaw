"use client";

import { useState, useEffect, HTMLAttributes } from "react";
import { cn } from "$/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

interface TimeSelectProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "defaultValue"> {
  onTimeChange?: (time: string) => void; // Changed to expect a string
  showSeconds?: boolean;
  className?: string;
  defaultValue?: string; // Changed to expect a string
}

export function TimeSelect({
  onTimeChange,
  showSeconds = false,
  className,
  defaultValue = "00:00", // Default string value
  ...props
}: TimeSelectProps) {
  const [hours, setHours] = useState<number>(
    defaultValue ? parseInt(defaultValue.split(":")[0]) : 0
  );
  const [minutes, setMinutes] = useState<number>(
    defaultValue ? parseInt(defaultValue.split(":")[1]) : 0
  );
  const [seconds, setSeconds] = useState<number>(
    defaultValue && showSeconds ? parseInt(defaultValue.split(":")[2]) : 0
  );

  // Format time as string whenever hours, minutes, or seconds change
  useEffect(() => {
    const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}${
      showSeconds ? `:${seconds.toString().padStart(2, "0")}` : ""
    }`;
    onTimeChange?.(formattedTime);
  }, [hours, minutes, seconds, showSeconds, onTimeChange]);

  const containerAnimation = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: "easeOut" },
  };

  const selectAnimation = {
    hover: { scale: 1.02 },
    tap: { scale: 0.98 },
  };

  return (
    <motion.div
      {...props}
      initial="initial"
      animate="animate"
      variants={containerAnimation}
      className={cn("flex items-center gap-3 p-0 rounded-lg", className)}
    >
      <Clock className="w-5 h-5 text-primary" />

      <motion.div whileHover="hover" whileTap="tap" variants={selectAnimation}>
        <Select
          value={hours.toString()}
          onValueChange={(value) => setHours(parseInt(value))}
        >
          <SelectTrigger className="w-[70px]">
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 24 }, (_, i) => (
              <SelectItem key={i} value={i.toString()}>
                {i.toString().padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      <span className="text-primary-foreground">:</span>

      <motion.div whileHover="hover" whileTap="tap" variants={selectAnimation}>
        <Select
          value={minutes.toString()}
          onValueChange={(value) => setMinutes(parseInt(value))}
        >
          <SelectTrigger className="w-[70px]">
            <SelectValue placeholder="MM" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 60 }, (_, i) => (
              <SelectItem key={i} value={i.toString()}>
                {i.toString().padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {showSeconds && (
        <>
          <span className="text-primary-foreground">:</span>
          <motion.div
            whileHover="hover"
            whileTap="tap"
            variants={selectAnimation}
          >
            <Select
              value={seconds.toString()}
              onValueChange={(value) => setSeconds(parseInt(value))}
            >
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="SS" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 60 }, (_, i) => (
                  <SelectItem key={i} value={i.toString()}>
                    {i.toString().padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
