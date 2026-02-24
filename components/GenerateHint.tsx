"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "$/utils";

interface GenerateHintProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  className?: string;
}

export function GenerateHint({
  title,
  description,
  icon = <Sparkles className="w-4 h-4 text-primary" />,
  className,
}: GenerateHintProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "p-4 rounded-lg border border-primary-foreground/10 bg-primary-foreground/5",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <p className="font-medium text-sm text-primary-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}
