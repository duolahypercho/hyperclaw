"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { Sparkles, Zap, Brain, Cpu, Loader2 } from "lucide-react";
import Image from "next/image";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ai" | "minimal";
  text?: string;
  className?: string;
}

// SVG as React component (inline for animation)
const CopanionSVG = ({ className = "", stroke = "#60a5fa" }) => (
  <svg
    width="100"
    height="50"
    viewBox="0 0 100 50"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Path animation - starts at 1s delay, after line completes */}
    <motion.path
      d="M20,0 A30,30 0 0,0 80,0"
      stroke={stroke}
      strokeWidth={4}
      fill="none"
      initial={{ pathLength: 0 }}
      animate={{
        pathLength: [0, 0, 1, 1, 1, 0, 0, 0],
      }}
      transition={{
        duration: 8, // Total cycle duration
        times: [0, 0.125, 0.25, 0.5, 0.625, 0.75, 0.875, 1], // Keyframe timing
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
    {/* Line animation - starts immediately */}
    <motion.line
      x1="20"
      y1="0"
      x2="80"
      y2="0"
      stroke={stroke}
      strokeWidth={6}
      initial={{ strokeDasharray: "60", strokeDashoffset: "60" }}
      animate={{
        strokeDashoffset: [60, 0, 0, 0, 0, 0, 60, 60],
      }}
      transition={{
        duration: 8, // Total cycle duration
        times: [0, 0.125, 0.25, 0.5, 0.625, 0.75, 0.875, 1], // Keyframe timing
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
  </svg>
);

export const Loading: React.FC<LoadingProps> = ({
  text = "Loading Hypercho...",
  className = "",
}) => {
  // Default variant - Hypercho Brand Loading
  return (
    <div
      className={`relative flex flex-col items-center justify-center min-h-[100vh] w-full bg-gradient-radial from-[#e0edfa] via-[#c7e0fa] to-[#e0edfa] dark:from-[#101a2b] dark:via-[#1e293b] dark:to-[#101a2b] transition-colors duration-500 ${className}`}
      style={{ overflow: "hidden" }}
    >
      {/* Logo */}
      <div
        className="relative z-20 flex items-center justify-center"
        style={{ width: 100, height: 50 }}
      >
        <CopanionSVG />
      </div>

      {/* Loading text */}
      <motion.p
        className="mt-3 text-muted-foreground text-base z-20 tracking-wide"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: 1.5,
          duration: 0.8,
          repeat: Infinity,
          repeatType: "reverse",
          repeatDelay: 0.5,
        }}
      >
        {text}
      </motion.p>
    </div>
  );
};

export default Loading;
