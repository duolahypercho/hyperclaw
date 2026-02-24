import { memo, useEffect, useState } from "react";
import { motion, useAnimation } from "framer-motion";
import { FOCUS } from "../types";

export const PomodoroAnimation = memo(
  ({
    session,
    nextSession,
    duration = 0.8,
  }: {
    session: string;
    nextSession: { name: string; duration: string };
    duration?: number; // Duration in seconds
  }) => {
    const [progress, setProgress] = useState(0);
    const controls = useAnimation();

    useEffect(() => {
      // Animate progress from 0 to 100% over the specified duration
      const interval = 16; // ~60fps
      const increment = 100 / ((duration * 1000) / interval);
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= 100) {
          setProgress(100);
          clearInterval(timer);
        } else {
          setProgress(current);
        }
      }, interval);

      return () => clearInterval(timer);
    }, [duration]);

    useEffect(() => {
      controls.start({
        scale: [1, 1.1, 1],
        transition: {
          duration: 0.6,
          repeat: Infinity,
          ease: "easeInOut",
        },
      });
    }, [controls]);

    return (
      <motion.div
        key="transition"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center justify-center overflow-hidden w-full"
      >
        {/* Progress Ring */}
        <div className="relative w-32 h-32 mb-6">
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="4"
            />
            {/* Progress circle with glow effect */}
            <motion.circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 45}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 45 }}
              animate={{
                strokeDashoffset: 2 * Math.PI * 45 * (1 - progress / 100),
                opacity: [0.8, 1, 0.8],
              }}
              transition={{
                strokeDashoffset: { duration: 0.1, ease: "linear" },
                opacity: { duration: 1, repeat: Infinity, ease: "easeInOut" },
              }}
              style={{
                filter: "drop-shadow(0 0 4px hsl(var(--primary)))",
              }}
            />
          </svg>
          {/* Centered emoji with glow */}
          <motion.div
            animate={controls}
            className="absolute inset-0 flex items-center justify-center text-5xl"
            style={{
              filter: "drop-shadow(0 0 8px rgba(255, 255, 255, 0.3))",
            }}
          >
            {session === FOCUS ? "🎉" : "☕"}
          </motion.div>
        </div>

        {/* Pulsing dots indicator */}
        <div className="flex gap-2 mb-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-lg font-semibold text-center mb-2"
        >
          {session === FOCUS ? "Good Work!" : "Time to work!"}
        </motion.div>

        {/* Next session info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="text-sm text-muted-foreground text-center"
        >
          Next: {nextSession.name} ({nextSession.duration})
        </motion.div>
      </motion.div>
    );
  }
);
