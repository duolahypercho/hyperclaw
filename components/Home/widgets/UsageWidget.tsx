"use client";

import React, { memo, useMemo, useCallback, useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  BarChart3,
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  RefreshCw,
  ExternalLink,
  Filter,
  Calendar,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useUsage } from "$/components/Tool/Usage/provider/usageProvider";
import { UsageProvider } from "$/components/Tool/Usage/provider/usageProvider";
import { useOS } from "@OS/Provider/OSProv";
import { useFocusMode } from "./hooks/useFocusMode";
import { cn } from "@/lib/utils";
import { loadLocalUsage, saveLocalUsage, type LocalUsageData } from "$/lib/hyperclaw-bridge-client";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(c: number): string {
  if (c < 0.01 && c > 0) return c.toFixed(4);
  return c.toFixed(2);
}

// Auto-refresh interval in milliseconds
const AUTO_REFRESH_INTERVAL = 30_000;

const DATE_PRESETS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

// Get the preset label for the current date range
function getCurrentPresetLabel(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return null;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const preset = DATE_PRESETS.find(p => p.days === diffDays);
  if (preset) return preset.label;

  // Show custom range as dates
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startStr} - ${endStr}`;
}

export const UsageCustomHeader: React.FC<CustomProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
}) => {
  const { loading, refetch, applyPreset, startDate, endDate, setStartDate, setEndDate } = useUsage();
  const { toolAbstracts } = useOS();
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);

  const usageTool = useMemo(
    () => toolAbstracts.find((t) => t.id === "usage"),
    [toolAbstracts]
  );

  // Sync temp dates when dropdown opens
  useEffect(() => {
    if (customDateOpen) {
      setTempStart(startDate);
      setTempEnd(endDate);
    }
  }, [customDateOpen, startDate, endDate]);

  const handlePresetClick = useCallback((days: number) => {
    applyPreset(days);
  }, [applyPreset]);

  const handleApplyCustomRange = useCallback(() => {
    if (tempStart && tempEnd) {
      setStartDate(tempStart);
      setEndDate(tempEnd);
      setCustomDateOpen(false);
    }
  }, [tempStart, tempEnd, setStartDate, setEndDate]);

  // Get current date range label
  const currentRangeLabel = getCurrentPresetLabel(startDate, endDate);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 min-h-0">
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        {isEditMode && (
          <div className="cursor-move h-7 w-7 flex shrink-0 items-center justify-center">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="text-primary shrink-0">
          {usageTool?.icon || <BarChart3 className="w-3.5 h-3.5" />}
        </div>
        <h3
          className="text-xs font-normal text-foreground truncate min-w-0"
          title={widget.title}
        >
          {widget.title}
        </h3>
        {currentRangeLabel && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
            {currentRangeLabel}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="h-6 w-6"
              title="Filter date range"
            >
              <Filter className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {DATE_PRESETS.map((preset) => (
              <DropdownMenuItem
                key={preset.days}
                onClick={() => handlePresetClick(preset.days)}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setCustomDateOpen(true);
              }}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Custom range...
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {customDateOpen && <Popover open={customDateOpen} onOpenChange={setCustomDateOpen}>
          <PopoverTrigger asChild>
            <div />
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-3">
              <div className="text-xs font-medium">Custom Date Range</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Start</label>
                  <Input
                    type="date"
                    value={tempStart}
                    onChange={(e) => setTempStart(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">End</label>
                  <Input
                    type="date"
                    value={tempEnd}
                    onChange={(e) => setTempEnd(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleApplyCustomRange}
                disabled={!tempStart || !tempEnd}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>}

        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => refetch()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw
            className={cn("w-3 h-3", loading && "animate-spin")}
          />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          className="h-6 w-6"
          onClick={() => window.open("/Tool/Usage", "_blank")}
          title="Open Usage"
        >
          <ExternalLink className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onMaximize}
          className="h-6 w-6"
        >
          {isMaximized ? (
            <Minimize2 className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
};

const UsageWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const { usage, sessionsUsage, loading, error, refetch, startDate, endDate } = useUsage();
  const [localUsage, setLocalUsage] = useState<LocalUsageData | null>(null);

  // Ref to access localUsage inside effects without re-triggering them
  const localUsageRef = useRef(localUsage);
  useEffect(() => { localUsageRef.current = localUsage; }, [localUsage]);

  // Load local usage data on mount
  useEffect(() => {
    async function loadLocal() {
      try {
        const result = await loadLocalUsage();
        if (result.success && result.data) {
          setLocalUsage(result.data);
        }
      } catch (e) {
        console.error("Failed to load local usage:", e);
      }
    }
    loadLocal();
  }, []);

  // Merge OpenClaw data with local data when new data arrives
  // NOTE: localUsage is read via ref to avoid infinite loop (effect updates localUsage)
  useEffect(() => {
    if (!usage && !sessionsUsage) return;

    async function mergeAndSave() {
      try {
        // Get OpenClaw daily data
        const openClawDaily = usage?.daily ?? [];

        // Get existing local data via ref (not dependency)
        const localData = localUsageRef.current?.daily ?? {};

        // Merge: for each date, keep the one with higher totalTokens (assuming more recent)
        const mergedDaily: LocalUsageData["daily"] = { ...localData };

        for (const day of openClawDaily) {
          const existing = mergedDaily[day.date];
          if (!existing || day.totalTokens > existing.totalTokens) {
            mergedDaily[day.date] = {
              input: day.input,
              output: day.output,
              totalTokens: day.totalTokens,
              totalCost: day.totalCost,
              inputCost: day.inputCost,
              outputCost: day.outputCost,
              cacheRead: day.cacheRead,
              cacheWrite: day.cacheWrite,
              cacheReadCost: day.cacheReadCost,
              cacheWriteCost: day.cacheWriteCost,
            };
          }
        }

        // Save merged data
        const newLocalData: LocalUsageData = {
          daily: mergedDaily,
          lastUpdated: new Date().toISOString(),
        };

        await saveLocalUsage(newLocalData);
        setLocalUsage(newLocalData);
      } catch (e) {
        console.error("Failed to merge/save local usage:", e);
      }
    }

    mergeAndSave();
  }, [usage, sessionsUsage]);

  // Totals: prefer sessions.usage (primary, matches OpenClaw), then usage.cost, then local cache
  const totals = useMemo(() => {
    // Primary: sessions.usage totals (complete token counts including cache reads)
    const liveTotals = sessionsUsage?.totals ?? usage?.totals;
    if (liveTotals) {
      return {
        inputTokens: liveTotals.input,
        outputTokens: liveTotals.output,
        totalTokens: liveTotals.totalTokens,
        totalCost: liveTotals.totalCost ?? 0,
      };
    }

    // Fallback: local cache (historical persistence when gateway is unavailable)
    const localDaily = localUsage?.daily ?? {};
    if (Object.keys(localDaily).length === 0) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0 };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    let input = 0, output = 0, totalTokens = 0, totalCost = 0;

    for (const [date, data] of Object.entries(localDaily)) {
      const d = new Date(date);
      if (d >= start && d <= end) {
        input += data.input;
        output += data.output;
        totalTokens += data.totalTokens;
        totalCost += data.totalCost;
      }
    }

    return { inputTokens: input, outputTokens: output, totalTokens, totalCost };
  }, [sessionsUsage, usage, localUsage, startDate, endDate]);

  // Auto-refresh (pauses when tab is hidden)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (!interval) interval = setInterval(() => refetch(), AUTO_REFRESH_INTERVAL);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch]);

  const isInitialLoading = loading && !usage && !sessionsUsage && !localUsage;
  const showError = error && !usage && !sessionsUsage && !localUsage;

  return (
    <motion.div
      animate={{
        opacity: isFocusModeActive ? 0.8 : 1,
        scale: isFocusModeActive ? 0.98 : 1,
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card
        className={cn(
          "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <UsageCustomHeader {...props} />

        <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-3">
          {isInitialLoading ? (
            <div className="flex flex-col h-full justify-center gap-2">
              <div className="grid grid-cols-4 gap-1">
                {["Input", "Output", "Total", "Cost"].map((label) => (
                  <div key={label} className="flex flex-col items-center">
                    <Skeleton className="h-3 w-3 rounded mb-0.5" />
                    <Skeleton className="h-6 w-12 rounded" />
                    <Skeleton className="h-2 w-8 rounded mt-0.5" />
                  </div>
                ))}
              </div>
            </div>
          ) : showError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Unable to load usage data
              </p>
              <p className="text-xs text-destructive mb-3 max-w-[240px]">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => refetch()}
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex flex-col h-full justify-center">
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="flex flex-col items-center">
                  <ArrowDownToLine className="h-3 w-3 text-[hsl(var(--chart-1))] mb-0.5" />
                  <div
                    className={cn(
                      "text-lg font-semibold tabular-nums transition-colors",
                      isFocusModeActive
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {formatTokens(totals.inputTokens)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Input
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <ArrowUpFromLine className="h-3 w-3 text-[hsl(var(--chart-2))] mb-0.5" />
                  <div
                    className={cn(
                      "text-lg font-semibold tabular-nums transition-colors",
                      isFocusModeActive
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {formatTokens(totals.outputTokens)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Output
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <Hash className="h-3 w-3 text-accent mb-0.5" />
                  <div
                    className={cn(
                      "text-lg font-semibold tabular-nums transition-colors",
                      isFocusModeActive
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {formatTokens(totals.totalTokens)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Total
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <DollarSign className="h-3 w-3 text-primary mb-0.5" />
                  <div
                    className={cn(
                      "text-lg font-semibold tabular-nums transition-colors",
                      isFocusModeActive
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    ${formatCost(totals.totalCost)}
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    Cost
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

UsageWidgetContent.displayName = "UsageWidgetContent";

const UsageWidget = memo((props: CustomProps) => {
  return (
    <UsageProvider>
      <UsageWidgetContent {...props} />
    </UsageProvider>
  );
});

UsageWidget.displayName = "UsageWidget";

export default UsageWidget;
