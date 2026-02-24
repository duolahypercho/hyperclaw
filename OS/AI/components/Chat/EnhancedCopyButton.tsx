import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { Message } from "@OS/AI/shared";
import { stripEnvironmentDetails } from "@OS/AI/components/Chat";

// Enhanced copy button
export const EnhancedCopyButton = ({
  message,
  onCopy,
  variant = "ghost",
}: {
  message: Message;
  onCopy?: (message: Message) => void;
  variant?: "ghost" | "outline" | "secondary";
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async () => {
    try {
      const textToCopy = stripEnvironmentDetails(message.content || "");
      await navigator.clipboard.writeText(textToCopy);
      onCopy?.(message);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <HyperchoTooltip value={isCopied ? "Copied!" : "Copy to clipboard"}>
      <Button
        variant={variant}
        size="iconSm"
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          isCopied && "bg-green-500 text-white",
          isHovered && "scale-110"
        )}
        onClick={handleCopy}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={isCopied}
      >
        <AnimatePresence mode="wait">
          {isCopied ? (
            <motion.div
              key="check"
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
              <Check className="w-3 h-3" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
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
              <Copy className="w-3 h-3" />
            </motion.div>
          )}
        </AnimatePresence>
      </Button>
    </HyperchoTooltip>
  );
};