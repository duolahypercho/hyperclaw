"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Check, ChevronRight, X as XIcon } from "lucide-react";

export const SystemEventItem: React.FC<{
  evt: { name: string; isError: boolean; detail: string };
}> = ({ evt }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      className={cn(
        "py-1.5 px-3 transition-all duration-300 select-text rounded-lg border overflow-hidden",
        evt.isError ? "border-red-500/40 bg-red-500/5" : "border-border/50 bg-muted/40",
        "hover:border-primary/50",
        expanded ? "w-full" : "w-fit"
      )}
      style={{
        borderTopRightRadius: "0px",
        borderBottomRightRadius: "10px",
        borderTopLeftRadius: "10px",
        borderBottomLeftRadius: "10px",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, width: expanded ? "100%" : "auto" }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        {evt.isError
          ? <XIcon className="w-3 h-3 flex-shrink-0 text-red-500" />
          : <Check className="w-3 h-3 flex-shrink-0 text-green-600" />
        }
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {evt.name}
        </span>
        <motion.div
          className="ml-auto flex-shrink-0"
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </motion.div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={cn(
              "mt-2 p-2 rounded text-xs border overflow-hidden",
              evt.isError ? "bg-red-500/10 border-red-500/40" : "bg-muted/50 border-border/50"
            )}>
              <div className="text-muted-foreground mb-1 text-[10px]">Output:</div>
              <pre className="whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto text-[11px]">{evt.detail}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const SystemEventsGroup: React.FC<{
  events: Array<{ name: string; isError: boolean; detail: string }>;
  completedCount: number;
  failedCount: number;
}> = ({ events, completedCount, failedCount }) => {
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <Collapsible.Root open={groupOpen} onOpenChange={setGroupOpen}>
      <div className="flex gap-3 justify-end w-full overflow-hidden">
        <div className="relative flex flex-col min-w-0 items-end flex-1">
          {/* Group Header */}
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className={cn(
                "py-1.5 px-3 w-fit transition-all duration-300 select-none rounded-lg border",
                "border-border/50 text-muted-foreground hover:text-foreground/80 hover:border-primary/50"
              )}
              style={{
                borderTopRightRadius: "0px",
                borderBottomRightRadius: "10px",
                borderTopLeftRadius: "10px",
                borderBottomLeftRadius: "10px",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {events.length} System Event{events.length > 1 ? "s" : ""}
                </span>
                <motion.div
                  animate={{ rotate: groupOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="w-3 h-3" />
                </motion.div>
              </div>
            </button>
          </Collapsible.Trigger>

          {/* Expanded: individual event items */}
          <Collapsible.Content className="w-full">
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1 flex flex-col items-end">
                {events.map((evt, i) => (
                  <SystemEventItem key={i} evt={evt} />
                ))}
              </div>
            </motion.div>
          </Collapsible.Content>
        </div>
        <div className="w-8 h-8 flex-shrink-0" />
      </div>
    </Collapsible.Root>
  );
};
