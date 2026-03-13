"use client";

import React, { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  List,
  ArrowUpDown,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUsage } from "../provider/usageProvider";
import { useUsageFiltered } from "../hooks/useUsageFiltered";
import { formatTokens, formatCost } from "../lib/usage-metrics";
import type { SessionsUsageEntry } from "$/lib/openclaw-gateway-ws";

type SortMode = "tokens" | "cost" | "recent" | "messages" | "errors";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
  { value: "recent", label: "Recent" },
  { value: "messages", label: "Messages" },
  { value: "errors", label: "Errors" },
];

const MAX_VISIBLE = 50;

// Recently viewed sessions — stored in localStorage
const RECENTLY_VIEWED_KEY = "hyperclaw.usage.recently-viewed";

function getRecentlyViewed(): string[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRecentlyViewed(key: string) {
  const list = getRecentlyViewed().filter((k) => k !== key);
  list.unshift(key);
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list.slice(0, 50)));
  } catch { /* ignore */ }
}

type SessionUsage = SessionsUsageEntry["usage"] & {
  messageCounts?: { total?: number; errors?: number; toolCalls?: number };
  toolUsage?: { totalCalls?: number };
  firstActivity?: number;
  lastActivity?: number;
};

function getSessionValue(session: SessionsUsageEntry, mode: SortMode): number {
  const u = session.usage as SessionUsage | null;
  switch (mode) {
    case "tokens":
      return u?.totalTokens ?? 0;
    case "cost":
      return u?.totalCost ?? 0;
    case "recent":
      return u?.lastActivity ?? session.updatedAt ?? 0;
    case "messages":
      return u?.messageCounts?.total ?? 0;
    case "errors":
      return u?.messageCounts?.errors ?? 0;
    default:
      return 0;
  }
}

function SessionRow({
  session,
  isSelected,
  isTokenMode,
  maxValue,
  onClick,
}: {
  session: SessionsUsageEntry;
  isSelected: boolean;
  isTokenMode: boolean;
  maxValue: number;
  onClick: (key: string, shiftKey: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const u = session.usage as SessionUsage | null;
  const tokens = u?.totalTokens ?? 0;
  const cost = u?.totalCost ?? 0;
  const barValue = isTokenMode ? tokens : cost;
  const barFraction = maxValue > 0 ? barValue / maxValue : 0;

  const name = session.label ?? session.key;
  const displayName = name.length > 40 ? name.slice(0, 40) + "…" : name;

  const messages = u?.messageCounts?.total ?? 0;
  const errors = u?.messageCounts?.errors ?? 0;
  const tools = u?.toolUsage?.totalCalls ?? 0;
  const durationMs = (u?.firstActivity && u?.lastActivity)
    ? Math.abs(u.lastActivity - u.firstActivity)
    : 0;
  const durationLabel = durationMs > 0
    ? durationMs > 60_000
      ? `${Math.round(durationMs / 60_000)}m`
      : `${Math.round(durationMs / 1000)}s`
    : null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(session.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "group relative flex items-center gap-2 rounded-md px-2.5 py-2 cursor-pointer transition-colors overflow-hidden",
        "hover:bg-muted/30",
        isSelected && "bg-primary/8 ring-1 ring-primary/30"
      )}
      onClick={(e: React.MouseEvent) => {
        addRecentlyViewed(session.key);
        onClick(session.key, e.shiftKey);
      }}
    >
      {/* Bar background */}
      <div
        className="absolute inset-y-0 left-0 bg-primary/5 transition-all duration-300"
        style={{ width: `${barFraction * 100}%` }}
      />

      {/* Content */}
      <div className="relative flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate text-foreground">
            {displayName}
          </span>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          {session.channel && (
            <span className="bg-muted/60 px-1 rounded">{session.channel}</span>
          )}
          {session.agentId && (
            <span className="bg-muted/60 px-1 rounded">{session.agentId}</span>
          )}
          {session.modelProvider && (
            <span className="bg-muted/60 px-1 rounded">{session.modelProvider}</span>
          )}
          {session.model && (
            <span className="bg-muted/60 px-1 rounded">{session.model}</span>
          )}
          {messages > 0 && <span>{messages} msgs</span>}
          {tools > 0 && <span>{tools} tools</span>}
          {errors > 0 && <span className="text-destructive">{errors} err</span>}
          {durationLabel && <span>{durationLabel}</span>}
        </div>
      </div>

      {/* Value */}
      <div className="relative shrink-0 text-right">
        <div className="text-xs font-semibold tabular-nums">
          {isTokenMode ? formatTokens(tokens) : `$${formatCost(cost)}`}
        </div>
      </div>
    </motion.div>
  );
}

export default function SessionsList() {
  const ctx = useUsage();
  const { filteredSessions } = useUsageFiltered(ctx);
  const [sortMode, setSortMode] = useState<SortMode>("tokens");
  const [sortAsc, setSortAsc] = useState(false);
  const [showRecentlyViewed, setShowRecentlyViewed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const isTokenMode = ctx.chartMode === "tokens";

  const sortedSessions = useMemo(() => {
    const sorted = [...filteredSessions].sort((a, b) => {
      const va = getSessionValue(a, sortMode);
      const vb = getSessionValue(b, sortMode);
      return sortAsc ? va - vb : vb - va;
    });
    return sorted;
  }, [filteredSessions, sortMode, sortAsc]);

  const recentlyViewedKeys = useMemo(() => new Set(getRecentlyViewed()), []);

  const displaySessions = useMemo(() => {
    if (showRecentlyViewed) {
      return sortedSessions.filter((s) => recentlyViewedKeys.has(s.key));
    }
    return sortedSessions;
  }, [sortedSessions, showRecentlyViewed, recentlyViewedKeys]);

  const visibleSessions = displaySessions.slice(0, MAX_VISIBLE);
  const remainingCount = displaySessions.length - MAX_VISIBLE;

  const maxValue = useMemo(() => {
    if (visibleSessions.length === 0) return 1;
    return Math.max(
      ...visibleSessions.map((s) => {
        const u = s.usage;
        return isTokenMode ? (u?.totalTokens ?? 0) : (u?.totalCost ?? 0);
      }),
      1
    );
  }, [visibleSessions, isTokenMode]);

  // Compute stats
  const avgTokens = useMemo(() => {
    if (sortedSessions.length === 0) return 0;
    return (
      sortedSessions.reduce((sum, s) => sum + (s.usage?.totalTokens ?? 0), 0) /
      sortedSessions.length
    );
  }, [sortedSessions]);

  const avgCost = useMemo(() => {
    if (sortedSessions.length === 0) return 0;
    return (
      sortedSessions.reduce((sum, s) => sum + (s.usage?.totalCost ?? 0), 0) /
      sortedSessions.length
    );
  }, [sortedSessions]);

  const errorCount = useMemo(
    () =>
      sortedSessions.reduce(
        (sum, s) =>
          sum + ((s.usage as SessionUsage | null)?.messageCounts?.errors ?? 0),
        0
      ),
    [sortedSessions]
  );

  const handleSort = (mode: SortMode) => {
    if (sortMode === mode) {
      setSortAsc(!sortAsc);
    } else {
      setSortMode(mode);
      setSortAsc(false);
    }
  };

  if (filteredSessions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.35 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                className="flex items-center gap-1"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <List className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Sessions</span>
              </button>
              <Badge variant="secondary" className="text-xs">
                {sortedSessions.length}
              </Badge>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                avg {formatTokens(Math.round(avgTokens))} tokens · ${formatCost(avgCost)}
                {errorCount > 0 && (
                  <span className="text-destructive"> · {errorCount} errors</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant={showRecentlyViewed ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowRecentlyViewed(!showRecentlyViewed)}
              >
                <Eye className="h-3 w-3" />
                Recent
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <ArrowUpDown className="h-3 w-3" />
                    {SORT_OPTIONS.find((o) => o.value === sortMode)?.label}
                    {sortAsc ? " ↑" : " ↓"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => handleSort(option.value)}
                      className={cn(
                        sortMode === option.value && "font-medium"
                      )}
                    >
                      {option.label}
                      {sortMode === option.value && (sortAsc ? " ↑" : " ↓")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="pt-0">
                <ScrollArea className="max-h-[400px]">
                  <div className="space-y-0.5">
                    {visibleSessions.map((session) => (
                      <SessionRow
                        key={session.key}
                        session={session}
                        isSelected={ctx.selectedSessions.includes(session.key)}
                        isTokenMode={isTokenMode}
                        maxValue={maxValue}
                        onClick={ctx.onSelectSession}
                      />
                    ))}
                    {remainingCount > 0 && (
                      <div className="text-center py-2">
                        <span className="text-xs text-muted-foreground">
                          +{remainingCount} more session{remainingCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {visibleSessions.length === 0 && (
                      <div className="text-center py-4 text-xs text-muted-foreground">
                        {showRecentlyViewed
                          ? "No recently viewed sessions."
                          : "No sessions match current filters."}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
