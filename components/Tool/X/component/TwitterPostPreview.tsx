import React, { useState, memo, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BadgeCheck,
  MessageCircle,
  Repeat2,
  Heart,
  BarChart2,
  AlertTriangle,
} from "lucide-react";
import { TwitterAccountType } from "../types";
import { cn } from "@/lib/utils";

interface TwitterPostPreviewProps {
  content: string;
  twitterAccount?: TwitterAccountType;
  className?: string;
}

const CHARACTER_LIMIT = 280;

const TwitterPostPreviewComponent: React.FC<TwitterPostPreviewProps> = ({
  content,
  twitterAccount,
  className,
}) => {
  const [showFullContent, setShowFullContent] = useState(false);

  if (!content.trim()) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-8 text-muted-foreground text-sm",
          className
        )}
      >
        Start typing to see preview...
      </div>
    );
  }

  const isVerified = twitterAccount?.verified || false;
  // Always check if content exceeds 280 for preview purposes (timeline shows max 280)
  const exceedsLimit = useMemo(
    () => content.length > CHARACTER_LIMIT,
    [content.length]
  );
  // Only show warning for non-verified accounts (they can't post over 280)
  const showWarning = useMemo(
    () => !isVerified && exceedsLimit,
    [isVerified, exceedsLimit]
  );

  // Memoize the truncated content to avoid recalculating on every render
  const truncatedContent = useMemo(
    () => content.substring(0, CHARACTER_LIMIT),
    [content]
  );

  const displayContent =
    exceedsLimit && !showFullContent ? truncatedContent : content;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {showWarning && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/90 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Only the first {CHARACTER_LIMIT} characters will be visible on the
            timeline. The rest will be truncated. You cannot post tweets over{" "}
            {CHARACTER_LIMIT} characters with a non-verified account.
          </span>
        </div>
      )}
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <Avatar className="w-10 h-10">
            <AvatarImage
              src={
                twitterAccount?.profileImageUrl ||
                "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png"
              }
              alt="Profile"
            />
            <AvatarFallback className="bg-foreground/10">
              {twitterAccount?.username?.charAt(0).toUpperCase() || "X"}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <div className="flex items-center gap-1 mb-0.5">
            <div className="flex items-center gap-1 w-full">
              <span className="font-semibold text-foreground/90 whitespace-nowrap">
                {twitterAccount?.name || "Your Name"}
              </span>
              {twitterAccount?.verified && (
                <BadgeCheck className="w-4 h-4 fill-blue-400 flex-shrink-0 stroke-background" />
              )}
              <span className="truncate ml-1 flex items-center gap-2">
                <span className="text-foreground/50">
                  @{twitterAccount?.username || "username"}
                </span>
                <span className="text-foreground/50">· now</span>
              </span>
            </div>
          </div>

          <p className="text-foreground/80 whitespace-pre-wrap break-words cursor-text font-medium">
            {displayContent}
            {exceedsLimit && !showFullContent && (
              <>
                <br />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowFullContent(true);
                  }}
                  className="text-blue-400 hover:text-blue-600 hover:underline cursor-pointer font-normal inline"
                >
                  Show more
                </button>
              </>
            )}
          </p>

          <div className="flex items-center justify-between mt-3 text-foreground/50">
            <div className="flex items-center gap-1 hover:text-primary transition-colors">
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs flex items-center gap-1">1k</span>
            </div>
            <div className="flex items-center gap-1 hover:text-green-500 transition-colors">
              <Repeat2 className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1 hover:text-red-500 transition-colors">
              <Heart className="w-4 h-4" />
              <span className="text-xs flex items-center gap-1">10k</span>
            </div>
            <div className="flex items-center gap-1 hover:text-primary transition-colors">
              <BarChart2 className="w-4 h-4" />
              <span className="text-xs flex items-center gap-1">300k</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders when parent updates
export const TwitterPostPreview = memo(TwitterPostPreviewComponent);
