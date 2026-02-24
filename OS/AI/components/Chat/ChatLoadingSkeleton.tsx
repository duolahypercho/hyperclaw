import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import CopanionIcon from "@OS/assets/copanion";

export const ChatLoadingSkeleton = () => {
  return (
    <motion.div
      className="flex gap-3 justify-start"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="w-8 h-8 flex-shrink-0">
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-primary/10 text-primary">
            <CopanionIcon className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="relative flex flex-col w-[85%] min-w-0 justify-start items-start">
        <div
          className="py-1.5 px-3 relative w-full bg-muted border border-border/50 rounded-lg"
          style={{
            borderTopRightRadius: "10px",
            borderBottomRightRadius: "10px",
            borderTopLeftRadius: "0px",
            borderBottomLeftRadius: "10px",
          }}
        >
          <div className="mt-3 space-y-2">
            <div
              className="h-3 bg-muted-foreground/20 rounded animate-pulse"
              style={{ width: "85%" }}
            />
            <div
              className="h-3 bg-muted-foreground/20 rounded animate-pulse"
              style={{ width: "92%" }}
            />
            <div
              className="h-3 bg-muted-foreground/20 rounded animate-pulse"
              style={{ width: "78%" }}
            />
            <div
              className="h-3 bg-muted-foreground/20 rounded animate-pulse"
              style={{ width: "65%" }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
