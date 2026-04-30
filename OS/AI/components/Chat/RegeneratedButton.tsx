import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw } from "lucide-react";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { Message } from "@OS/AI/shared";

// Enhanced regeneration button
export const RegenerateButton = ({
  message,
  onRegenerate,
  variant = "ghost",
  isLoading = false,
}: {
  message: Message;
  onRegenerate?: (messageId: string) => void;
  variant?: "ghost" | "outline" | "secondary";
  isLoading?: boolean;
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleRegenerate = () => {
    const messageId = (message as any).id || message.id || "";
    if (messageId && onRegenerate) {
      onRegenerate(messageId);
    }
  };

  return (
    <HyperchoTooltip value="Regenerate response">
      <Button
        variant={variant}
        size="iconSm"
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          isHovered && "scale-110",
          isLoading && "opacity-50 cursor-not-allowed"
        )}
        onClick={handleRegenerate}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={isLoading}
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
                duration: 0.2,
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
            </motion.div>
          ) : (
            <motion.div
              key="regenerate"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
                duration: 0.2,
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <RotateCcw className="w-3 h-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </HyperchoTooltip>
  );
};