import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { Message } from "@OS/AI/shared";

// Feedback buttons component
export const FeedbackButton = ({
  message,
  onThumbsUp,
  onThumbsDown,
  variant = "ghost",
}: {
  message: Message;
  onThumbsUp?: (message: Message) => void;
  onThumbsDown?: (message: Message) => void;
  variant?: "ghost" | "outline" | "secondary";
}) => {
  const [thumbsUpClicked, setThumbsUpClicked] = useState(false);
  const [thumbsDownClicked, setThumbsDownClicked] = useState(false);

  const handleThumbsUp = () => {
    if (!thumbsUpClicked && !thumbsDownClicked) {
      setThumbsUpClicked(true);
      onThumbsUp?.(message);
    }
  };

  const handleThumbsDown = () => {
    if (!thumbsUpClicked && !thumbsDownClicked) {
      setThumbsDownClicked(true);
      onThumbsDown?.(message);
    }
  };

  return (
    <div className="flex gap-1">
      <HyperchoTooltip value="Good response">
        <Button
          variant={variant}
          size="iconSm"
          className={cn(
            "transition-all duration-300",
            thumbsUpClicked && "bg-green-500 text-white",
            thumbsDownClicked && "opacity-50"
          )}
          onClick={handleThumbsUp}
          disabled={thumbsUpClicked || thumbsDownClicked}
        >
          <ThumbsUp className="w-3 h-3" />
        </Button>
      </HyperchoTooltip>
      <HyperchoTooltip value="Poor response">
        <Button
          variant={variant}
          size="iconSm"
          className={cn(
            "transition-all duration-300",
            thumbsDownClicked && "bg-red-500 text-white",
            thumbsUpClicked && "opacity-50"
          )}
          onClick={handleThumbsDown}
          disabled={thumbsUpClicked || thumbsDownClicked}
        >
          <ThumbsDown className="w-3 h-3" />
        </Button>
      </HyperchoTooltip>
    </div>
  );
};
