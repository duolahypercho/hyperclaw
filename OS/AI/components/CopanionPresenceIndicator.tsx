import React from "react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAssistant } from "$/Providers/AssistantProv";
import { getMediaUrl } from "$/utils";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoaderFive } from "./TextGenerating";

export interface CopanionPresenceIndicatorProps {
  className?: string;
  showText?: boolean;
  text?: string;
  size?: "sm" | "md" | "lg";
}

export const CopanionPresenceIndicator: React.FC<
  CopanionPresenceIndicatorProps
> = ({
  className,
  showText = true,
  text,
  size = "md",
}) => {
  const { personality } = useAssistant();

  const sizeClasses = {
    sm: {
      avatar: "w-4 h-4",
      icon: "w-2 h-2",
      indicator: "w-1.5 h-1.5",
      text: "text-[10px]",
    },
    md: {
      avatar: "w-5 h-5",
      icon: "w-3 h-3",
      indicator: "w-2 h-2",
      text: "text-xs",
    },
    lg: {
      avatar: "w-6 h-6",
      icon: "w-4 h-4",
      indicator: "w-2.5 h-2.5",
      text: "text-sm",
    },
  };

  const currentSize = sizeClasses[size];
  const displayText = text || `${personality.name || "Hyperclaw"} is here`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md bg-primary/5 border border-primary/20",
        className
      )}
    >
      <div className="relative">
        <Avatar className={currentSize.avatar}>
          {personality.coverPhoto ? (
            <AvatarImage
              src={getMediaUrl(personality.coverPhoto)}
              className="object-cover object-center"
            />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary">
            <Bot className={currentSize.icon} />
          </AvatarFallback>
        </Avatar>
        {/* Active indicator pulse */}
        <motion.div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full border-1 border-solid border-background",
            currentSize.indicator
          )}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
      {showText && (
          <LoaderFive text={displayText} className={currentSize.text} />
      )}
    </motion.div>
  );
};

export default CopanionPresenceIndicator;
