import { LoaderFive } from "../TextGenerating";
import { cn } from "@/lib/utils";

export const AnimatedThinkingText = ({ 
  text = "AI is thinking",
  className 
}: { 
  text?: string;
  className?: string;
}) => {
  return (
    <LoaderFive 
      text={text} 
      className={cn("text-xs text-muted-foreground", className)} 
    />
  );
};
