"use client";

import React from "react";
import { motion } from "framer-motion";

const HistorySkeleton: React.FC = () => {
  const shimmerVariants = {
    initial: { opacity: 0.5 },
    animate: {
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  const ConversationSkeleton = () => (
    <div className="p-2 rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <motion.div
            variants={shimmerVariants}
            initial="initial"
            animate="animate"
            className="w-3.5 h-3.5 bg-muted rounded flex-shrink-0"
          />
          <motion.div
            variants={shimmerVariants}
            initial="initial"
            animate="animate"
            className="h-3 bg-muted rounded flex-1 min-w-0"
            style={{ width: `${Math.random() * 40 + 60}%` }}
          />
        </div>
        <motion.div
          variants={shimmerVariants}
          initial="initial"
          animate="animate"
          className="w-8 h-3 bg-muted rounded flex-shrink-0"
        />
      </div>
    </div>
  );

  const TimeGroupSkeleton = () => (
    <div className="mb-3">
      <motion.div
        variants={shimmerVariants}
        initial="initial"
        animate="animate"
        className="h-3 bg-muted rounded mb-2 px-2"
        style={{ width: `${Math.random() * 30 + 50}px` }}
      />
      <div className="space-y-1">
        {Array.from({ length: Math.floor(Math.random() * 3) + 2 }).map(
          (_, index) => (
            <ConversationSkeleton key={index} />
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="p-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <TimeGroupSkeleton key={index} />
      ))}
    </div>
  );
};

export default HistorySkeleton;
