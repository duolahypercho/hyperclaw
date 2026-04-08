import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CopanionIcon from "@OS/assets/copanion";
import { cn } from "@/lib/utils";

// Mimics the exact bubble shape from EnhancedMessageBubble
const BUBBLE_RADIUS = {
  user: {
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "0px",
    borderBottomRightRadius: "10px",
    borderBottomLeftRadius: "10px",
  },
  assistant: {
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "10px",
    borderBottomRightRadius: "10px",
    borderBottomLeftRadius: "10px",
  },
};

// Each row: isUser, whether to render avatar, bubble width, and shimmer line widths (% of bubble)
const SKELETON_ROWS: Array<{
  isUser: boolean;
  showAvatar: boolean;
  bubbleWidth: string;
  lines: number[];
}> = [
  { isUser: false, showAvatar: true,  bubbleWidth: "75%", lines: [72, 88, 55] },
  { isUser: true,  showAvatar: true,  bubbleWidth: "62%", lines: [60, 80] },
  { isUser: false, showAvatar: false, bubbleWidth: "80%", lines: [85, 92, 70, 50] },
  { isUser: true,  showAvatar: false, bubbleWidth: "52%", lines: [70, 55] },
  { isUser: false, showAvatar: true,  bubbleWidth: "68%", lines: [78, 60] },
];

function ShimmerLines({ lines, delay }: { lines: number[]; delay: number }) {
  return (
    <div className="space-y-2 py-0.5">
      {lines.map((w, i) => (
        <div
          key={i}
          className="h-2.5 rounded-full bg-muted-foreground/15 animate-pulse"
          style={{
            width: `${w}%`,
            animationDelay: `${delay + i * 80}ms`,
            animationDuration: "1.4s",
          }}
        />
      ))}
    </div>
  );
}

function SkeletonAvatar({
  assistantAvatar,
}: {
  assistantAvatar?: { src?: string; fallback?: string; alt?: string };
}) {
  return (
    <Avatar className="w-8 h-8 shrink-0">
      {assistantAvatar?.src && (
        <AvatarImage src={assistantAvatar.src} alt={assistantAvatar.alt} />
      )}
      <AvatarFallback className="bg-primary/10 text-primary">
        {assistantAvatar?.fallback
          ? <span className="text-xs">{assistantAvatar.fallback}</span>
          : <CopanionIcon className="w-4 h-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

export const ChatLoadingSkeleton = ({
  assistantAvatar,
}: {
  assistantAvatar?: { src?: string; fallback?: string; alt?: string };
} = {}) => {
  return (
    <div className="space-y-3">
      {SKELETON_ROWS.map((row, i) => (
        <motion.div
          key={i}
          className={cn("flex gap-3 items-end", row.isUser ? "justify-end" : "justify-start")}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i * 0.06 }}
        >
          {/* Assistant avatar — left side */}
          {!row.isUser && (
            <div className="w-8 h-8 shrink-0 self-end">
              {row.showAvatar
                ? <SkeletonAvatar assistantAvatar={assistantAvatar} />
                : <div className="w-8 h-8" />}
            </div>
          )}

          {/* Bubble — explicit width so shimmer lines have a real parent to size against */}
          <div
            className={cn(
              "relative flex flex-col min-w-0",
              row.isUser ? "items-end" : "items-start"
            )}
            style={{ width: row.bubbleWidth }}
          >
            <div
              className={cn(
                "py-2 px-3 w-full",
                row.isUser
                  ? "bg-primary/15"
                  : "bg-muted border border-border/40"
              )}
              style={row.isUser ? BUBBLE_RADIUS.user : BUBBLE_RADIUS.assistant}
            >
              <ShimmerLines lines={row.lines} delay={i * 60} />
            </div>
          </div>

          {/* User avatar placeholder — right side */}
          {row.isUser && (
            <div className="w-8 h-8 shrink-0 self-end">
              {row.showAvatar
                ? <div className="w-8 h-8 rounded-full bg-secondary animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                : <div className="w-8 h-8" />}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
};
