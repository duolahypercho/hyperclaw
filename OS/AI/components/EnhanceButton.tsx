import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "$/utils";

interface EnhanceButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "accent";
  size?: "default" | "sm" | "lg" | "icon";
  buttonText?: string;
  loadingText?: string;
}

export const EnhanceButton: React.FC<EnhanceButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  className,
  variant = "outline",
  size = "default",
  buttonText = "Enhance",
  loadingText = "Thinking",
}) => {
  const [dots, setDots] = useState("");

  // Text animation effect for loading state
  useEffect(() => {
    if (!isLoading) {
      setDots("");
      return;
    }

    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isLoading]);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
      }}
    >
      <Button
        onClick={onClick}
        disabled={disabled || isLoading}
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          isLoading && "bg-primary/10 border-primary/20",
          className
        )}
        variant={variant}
        size={size}
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="generating"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="mr-2"
              >
                <Loader2 className="w-4 h-4" />
              </motion.div>
              <motion.span
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {loadingText}
                {dots}
              </motion.span>
            </motion.div>
          ) : (
            <motion.div
              key="enhance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center"
            >
              <span>{buttonText}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Subtle loading background animation */}
        {isLoading && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </Button>
    </motion.div>
  );
};

export default EnhanceButton;
