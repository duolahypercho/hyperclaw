import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "$/utils";

interface RemoveButtonProps {
  onDelete: (e?: React.MouseEvent) => void;
  size?: "sm" | "md" | "base" | "lg";
  className?: string;
}

const buttonSize = {
  sm: "h-4 w-4 p-1.5",
  md: "h-5 w-5 p-1.5",
  base: "h-6 w-6 p-1.5",
  lg: "h-7 w-7 p-1.5",
};

const textSize = {
  sm: "text-xs",
  md: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

export const RemoveButton: React.FC<RemoveButtonProps> = ({
  onDelete,
  size = "base",
  className,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(e);
  };

  const buttonContent = (
    <motion.div
      className={cn(
        "flex items-center justify-center relative",
        buttonSize[size],
        textSize[size],
        "font-semibold text-muted-foreground transition-colors duration-200"
      )}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <AnimatePresence mode="wait">
        {isHovered ? (
          <motion.span
            key="x"
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            ×
          </motion.span>
        ) : (
          <motion.span
            key="minus"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            −
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "bg-muted transition-all duration-200 h-fit w-fit pointer-events-auto p-1 rounded-sm",
        "hover:bg-destructive/20 hover:text-destructive-foreground",
        className
      )}
    >
      {buttonContent}
    </Button>
  );
};

export default RemoveButton;
