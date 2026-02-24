import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trash2, AlertTriangle } from "lucide-react";
import { cn } from "$/utils";

interface DeleteConfirmationProps {
  // Content props
  initialText?: string;
  confirmText?: string;
  initialIcon?: React.ReactNode;
  confirmIcon?: React.ReactNode;

  // Behavior props
  onConfirm: () => void;
  onCancel?: () => void;
  resetAfterMs?: number;

  // Styling props
  className?: string;
  variant?: "button" | "dropdown" | "context";
  size?: "sm" | "md" | "lg";
  animationStyle?: "subtle" | "dramatic" | "bouncy" | "shake";

  // Custom render props
  children?: (props: {
    isConfirming: boolean;
    handleClick: (e: React.MouseEvent) => void;
    currentText: string;
    currentIcon: React.ReactNode;
  }) => React.ReactNode;
  classNames?: {
    button?: string;
    content?: string;
  };
}

export const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({
  initialText = "Delete",
  confirmText = "Confirm",
  initialIcon = <Trash2 className="flex-shrink-0 mr-2 h-3 w-3" />,
  confirmIcon = <AlertTriangle className="flex-shrink-0 mr-2 h-3 w-3" />,
  onConfirm,
  onCancel,
  resetAfterMs = 0,
  className,
  variant = "button",
  size = "md",
  animationStyle = "dramatic",
  children,
  classNames,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  useEffect(() => {
    if (isConfirming && resetAfterMs > 0) {
      const timer = setTimeout(() => {
        setIsConfirming(false);
        onCancel?.();
      }, resetAfterMs);
      return () => clearTimeout(timer);
    }
  }, [isConfirming, resetAfterMs, onCancel]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Trigger click animation
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 200);

    if (isConfirming) {
      onConfirm();
      setIsConfirming(false);
    } else {
      setIsConfirming(true);
    }
  };

  const currentText = isConfirming ? confirmText : initialText;
  const currentIcon = isConfirming ? confirmIcon : initialIcon;

  // Get variant styles
  const getVariantStyles = () => {
    switch (variant) {
      case "button":
        return cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50 relative overflow-hidden",
          size === "sm" && "h-8 px-3 text-xs",
          size === "md" && "h-9 px-4 text-sm",
          size === "lg" && "h-10 px-6 text-base",
          isConfirming
            ? "bg-red-600 text-white hover:bg-red-700 shadow-lg"
            : "bg-red-500 text-white hover:bg-red-600",
          classNames?.button
        );
      case "dropdown":
      case "context":
        return cn(
          "flex items-center w-full px-3 py-2 text-xs font-medium rounded-sm transition-all duration-200",
          isConfirming
            ? "text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-950 dark:hover:bg-red-900"
            : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950",
          classNames?.content
        );
      default:
        return "";
    }
  };

  // If custom render function is provided, use it
  if (children) {
    return (
      <>
        {children({
          isConfirming,
          handleClick,
          currentText,
          currentIcon,
        })}
      </>
    );
  }

  return (
    <motion.div
      className={cn(getVariantStyles(), className)}
      onClick={handleClick}
      initial={false}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
    >
      <motion.div
        className="flex items-center relative z-10"
        initial={false}
        animate={{
          x: isConfirming ? 2 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
      >
        <div className="flex-shrink-0">{currentIcon}</div>
        <motion.span
          initial={false}
          animate={{
            opacity: isConfirming ? 1 : 1,
            scale: isConfirming ? 1.05 : 1,
          }}
          transition={{
            duration: 0.2,
            type: "spring",
            stiffness: 400,
            damping: 20,
          }}
        >
          {currentText}
        </motion.span>
      </motion.div>
    </motion.div>
  );
};

export default DeleteConfirmation;
