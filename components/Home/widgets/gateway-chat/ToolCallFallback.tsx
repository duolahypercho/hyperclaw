"use client";

import React, { useState, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, RefreshCw, ChevronRight, X as XIcon } from "lucide-react";
import { JsonViewer } from "./JsonViewer";

export const ToolCallFallback: React.FC<{
  toolName: string;
  toolArgs: string;
  result?: string;
  isError?: boolean;
}> = memo(({ toolName, toolArgs, result, isError }) => {
  const [expanded, setExpanded] = useState(false);

  // Parse a human-readable summary from args
  const argsSummary = useMemo(() => {
    try {
      const parsed = JSON.parse(toolArgs);
      if (typeof parsed === "object" && parsed !== null) {
        // Show first meaningful value as a short hint
        const entries = Object.entries(parsed);
        if (entries.length === 0) return "";
        const [, val] = entries[0];
        const str = typeof val === "string" ? val : JSON.stringify(val);
        return str.length > 80 ? str.slice(0, 80) + "..." : str;
      }
    } catch {}
    return toolArgs.length > 80 ? toolArgs.slice(0, 80) + "..." : toolArgs;
  }, [toolArgs]);

  const hasResult = result !== undefined && result !== "";
  const statusIcon = hasResult
    ? isError
      ? <XIcon className="w-3 h-3 text-red-500" />
      : <Check className="w-3 h-3 text-green-600" />
    : <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw className="w-3 h-3 text-primary" /></motion.div>;

  return (
    <motion.div
      className={cn(
        "py-1.5 px-3 relative w-full max-w-full transition-all duration-300 select-text rounded-lg border",
        isError ? "border-red-500/40 bg-red-500/5" : "border-border/50 bg-muted/40",
        "hover:border-primary/50"
      )}
      style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: "10px", borderTopRightRadius: "10px", borderBottomRightRadius: "10px" }}
    >
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        {statusIcon}
        <span className="text-xs font-medium text-muted-foreground">
          {toolName}
          {hasResult ? " completed" : " executing..."}
        </span>
        {argsSummary && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px]">
            {argsSummary}
          </span>
        )}
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </motion.div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {toolArgs && toolArgs !== "{}" && (
                <div className="p-2 bg-primary/5 rounded text-xs font-mono border border-border/30 overflow-hidden">
                  <div className="text-muted-foreground mb-1">Arguments:</div>
                  <JsonViewer content={toolArgs} />
                </div>
              )}
              {hasResult && (
                <div className={cn(
                  "p-2 rounded text-xs border overflow-hidden",
                  isError ? "bg-red-500/10 border-red-500/40" : "bg-muted/50 border-border/50"
                )}>
                  <div className="text-muted-foreground mb-1">Result:</div>
                  <JsonViewer content={result!} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}, (prev, next) =>
  prev.toolName === next.toolName &&
  prev.toolArgs === next.toolArgs &&
  prev.result === next.result &&
  prev.isError === next.isError
);
