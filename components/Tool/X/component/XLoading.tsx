"use client";

import React from "react";
import { motion } from "framer-motion";
import { Loader2, Twitter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const XLoading: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-6">
      {/* Main loading animation */}
      <motion.div
        className="flex flex-col items-center space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Twitter icon with loading animation */}
        <motion.div
          className="relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Twitter className="w-12 h-12 text-primary" />
        </motion.div>

        {/* Loading spinner */}
        <motion.div
          className="flex items-center space-x-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-muted-foreground text-sm">
            Loading Twitter accounts...
          </span>
        </motion.div>
      </motion.div>

      {/* Progress indicator */}
      <motion.div
        className="w-full max-w-xs mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
      >
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span>Connecting to X (Twitter)</span>
          <span>Please wait...</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <motion.div
            className="bg-primary h-2 rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{
              duration: 3,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
        </div>
      </motion.div>
    </div>
  );
};

export default XLoading;
