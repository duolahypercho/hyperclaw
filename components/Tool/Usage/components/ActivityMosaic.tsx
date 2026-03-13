"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useUsage } from "../provider/usageProvider";
import { useUsageFiltered } from "../hooks/useUsageFiltered";
import { buildUsageMosaicStats, formatTokens, formatCost } from "../lib/usage-metrics";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function ActivityMosaic() {
  const ctx = useUsage();
  const { filteredSessions } = useUsageFiltered(ctx);

  const buckets = useMemo(
    () => buildUsageMosaicStats(filteredSessions, ctx.timeZone),
    [filteredSessions, ctx.timeZone]
  );

  const hasActivity = buckets.some((b) => b.tokens > 0);
  if (!hasActivity) return null;

  const isTokenMode = ctx.chartMode === "tokens";
  const selectedHoursSet = new Set(ctx.selectedHours);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.3 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Activity by hour</span>
            </div>
            {ctx.selectedHours.length > 0 && (
              <button
                type="button"
                onClick={ctx.onClearHours}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear selection
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <TooltipProvider delayDuration={100}>
            <div className="flex gap-1 flex-wrap">
              {buckets.map((bucket) => {
                const isSelected =
                  selectedHoursSet.size === 0 || selectedHoursSet.has(bucket.hour);
                const label = `${String(bucket.hour).padStart(2, "0")}:00`;
                const value = isTokenMode
                  ? formatTokens(Math.round(bucket.tokens))
                  : `$${formatCost(bucket.cost)}`;

                return (
                  <Tooltip key={bucket.hour}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "relative flex flex-col items-center gap-0.5 rounded-md border transition-all duration-150 cursor-pointer",
                          "w-[calc((100%-23*4px)/24)] min-w-[28px] py-1.5",
                          isSelected
                            ? "border-border/60 hover:border-primary/50"
                            : "border-transparent opacity-30",
                          selectedHoursSet.has(bucket.hour) &&
                            "ring-1 ring-primary/40 border-primary/40"
                        )}
                        onClick={(e) => ctx.onSelectHour(bucket.hour, e.shiftKey)}
                      >
                        {/* Intensity bar */}
                        <div
                          className="w-4 rounded-sm transition-all duration-200"
                          style={{
                            height: `${Math.max(bucket.intensity * 28, 2)}px`,
                            backgroundColor:
                              bucket.intensity > 0
                                ? `hsl(var(--primary) / ${0.15 + bucket.intensity * 0.75})`
                                : "hsl(var(--muted))",
                          }}
                        />
                        <span className="text-[9px] text-muted-foreground tabular-nums leading-none mt-0.5">
                          {bucket.hour}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-medium">{label}</div>
                      <div className="text-muted-foreground">
                        {value} {isTokenMode ? "tokens" : ""}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Click to filter by hour (shift-click to multi-select).{" "}
            {ctx.timeZone === "utc" ? "UTC" : "Local"} time.
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
