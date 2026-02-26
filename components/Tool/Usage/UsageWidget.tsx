"use client";

import React from "react";
import { motion } from "framer-motion";
import { BarChart3, ArrowDownToLine, ArrowUpFromLine, Hash } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsage } from "./provider/usageProvider";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Compact token usage widget for Tool pages (TodoList, Crons, Agents). Shows totals from ~/.openclaw sessions. */
export default function UsageWidget() {
  const { usage, loading, error } = useUsage();

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Token usage</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <span className="text-xs text-muted-foreground">Usage: unavailable</span>
      </div>
    );
  }

  const totals = usage?.totals ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  return (
    <motion.div
      className="rounded-lg border border-border bg-card p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-accent" />
        <span className="text-xs font-medium text-muted-foreground">Token usage</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <ArrowDownToLine className="h-3.5 w-3.5 mx-auto text-[hsl(var(--chart-1))] mb-0.5" />
          <div className="text-sm font-semibold tabular-nums">
            {formatTokens(totals.inputTokens)}
          </div>
          <div className="text-[10px] text-muted-foreground">In</div>
        </div>
        <div>
          <ArrowUpFromLine className="h-3.5 w-3.5 mx-auto text-[hsl(var(--chart-2))] mb-0.5" />
          <div className="text-sm font-semibold tabular-nums">
            {formatTokens(totals.outputTokens)}
          </div>
          <div className="text-[10px] text-muted-foreground">Out</div>
        </div>
        <div>
          <Hash className="h-3.5 w-3.5 mx-auto text-accent mb-0.5" />
          <div className="text-sm font-semibold tabular-nums">
            {formatTokens(totals.totalTokens)}
          </div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 border-t border-border pt-2">
        From ~/.openclaw agents & sessions
      </p>
    </motion.div>
  );
}
