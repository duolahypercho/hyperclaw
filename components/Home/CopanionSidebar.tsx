import React from "react";
import { CopilotChat } from "@OS/AI/components/CopilotChat";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CopanionSidebarProps {
  className?: string;
}

export const CopanionSidebar: React.FC<CopanionSidebarProps> = ({
  className,
}) => {
  return (
    <div
      className={cn(
        "h-full w-full flex flex-col",
        "bg-background/95 backdrop-blur-xl",
        "border-l border-border/50",
        className
      )}
    >
      <CopilotChat />
    </div>
  );
};
