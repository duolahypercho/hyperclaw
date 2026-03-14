"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MessageSquare,
  Wrench,
  AlertTriangle,
  Clock,
  Cpu,
  Server,
  User as UserIcon,
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUsage } from "../provider/usageProvider";
import { formatTokens, formatCost } from "../lib/usage-metrics";
import { gatewayConnection, getGatewayConnectionState } from "$/lib/openclaw-gateway-ws";
import type { SessionsUsageEntry } from "$/lib/openclaw-gateway-ws";

// ── Types ──

interface TimeSeriesPoint {
  index: number;
  role?: string;
  timestamp?: number;
  totalTokens: number;
  totalCost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface SessionLogEntry {
  index: number;
  role: string;
  timestamp?: number;
  content?: string;
  tokens?: number;
  cost?: number;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
}

type SessionUsage = SessionsUsageEntry["usage"] & {
  messageCounts?: { total?: number; user?: number; assistant?: number; errors?: number; toolCalls?: number; toolResults?: number };
  toolUsage?: { totalCalls?: number; uniqueTools?: number; tools?: Array<{ name: string; count?: number }> };
  modelUsage?: Array<{ provider?: string; model?: string; count?: number }>;
  firstActivity?: number;
  lastActivity?: number;
};

// ── API helpers ──

async function loadTimeSeries(sessionKey: string): Promise<TimeSeriesPoint[]> {
  if (!getGatewayConnectionState().connected) return [];
  try {
    const result = await gatewayConnection.request<{ points?: TimeSeriesPoint[] }>(
      "sessions.usage.timeseries",
      { sessionKey }
    );
    return result?.points ?? [];
  } catch (e) {
    console.warn("[SessionDetail] timeseries failed:", e);
    return [];
  }
}

async function loadSessionLogs(sessionKey: string): Promise<SessionLogEntry[]> {
  if (!getGatewayConnectionState().connected) return [];
  try {
    const result = await gatewayConnection.request<{ logs?: SessionLogEntry[] }>(
      "sessions.usage.logs",
      { sessionKey, limit: 1000 }
    );
    return result?.logs ?? [];
  } catch (e) {
    console.warn("[SessionDetail] logs failed:", e);
    return [];
  }
}

// ── Time series mini chart (SVG) ──

function TimeSeriesChart({
  points,
  mode,
}: {
  points: TimeSeriesPoint[];
  mode: "cumulative" | "per-turn";
}) {
  if (points.length === 0) return null;

  const W = 480;
  const H = 100;
  const PAD = 4;

  const data = useMemo(() => {
    if (mode === "cumulative") {
      let cumTokens = 0;
      return points.map((p) => {
        cumTokens += p.totalTokens;
        return { ...p, displayValue: cumTokens };
      });
    }
    return points.map((p) => ({ ...p, displayValue: p.totalTokens }));
  }, [points, mode]);

  const maxVal = Math.max(...data.map((d) => d.displayValue), 1);
  const barWidth = Math.max(Math.min((W - PAD * 2) / data.length - 1, 12), 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
      {data.map((d, i) => {
        const barHeight = (d.displayValue / maxVal) * (H - PAD * 2);
        const x = PAD + i * ((W - PAD * 2) / data.length);
        const y = H - PAD - barHeight;
        const color =
          d.role === "user"
            ? "hsl(var(--chart-1))"
            : d.role === "assistant"
              ? "hsl(var(--chart-2))"
              : "hsl(var(--chart-3))";

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(barHeight, 1)}
            rx={1}
            fill={color}
            opacity={0.7}
          >
            <title>
              {d.role ?? "msg"} #{d.index}: {formatTokens(d.displayValue)} tokens
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

// ── Log entry row ──

const ROLE_ICONS: Record<string, React.ElementType> = {
  user: UserIcon,
  assistant: Bot,
  tool: Wrench,
  toolResult: Wrench,
};

const ROLE_COLORS: Record<string, string> = {
  user: "text-blue-500",
  assistant: "text-emerald-500",
  tool: "text-amber-500",
  toolResult: "text-amber-600",
};

function LogEntryRow({ entry, expanded, onToggle }: { entry: SessionLogEntry; expanded: boolean; onToggle: () => void }) {
  const Icon = ROLE_ICONS[entry.role] ?? MessageSquare;
  const roleColor = ROLE_COLORS[entry.role] ?? "text-muted-foreground";
  const timeStr = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const preview =
    entry.content && entry.content.length > 120
      ? entry.content.slice(0, 120) + "…"
      : entry.content;

  return (
    <div className={cn("border-b border-border/30 last:border-b-0", entry.isError && "bg-destructive/5")}>
      <button
        type="button"
        className="flex items-start gap-2 w-full px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors"
        onClick={onToggle}
      >
        <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", roleColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[11px] font-medium", roleColor)}>{entry.role}</span>
            {entry.toolName && (
              <span className="text-[10px] text-muted-foreground bg-muted/60 px-1 rounded">
                {entry.toolName}
              </span>
            )}
            {timeStr && (
              <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                {timeStr}
              </span>
            )}
            {entry.tokens != null && entry.tokens > 0 && (
              <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                {formatTokens(entry.tokens)}
              </span>
            )}
          </div>
          {!expanded && preview && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{preview}</p>
          )}
        </div>
        {entry.content && (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
          )
        )}
      </button>
      <AnimatePresence>
        {expanded && entry.content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <pre className="px-8 pb-2 text-[11px] text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono">
              {entry.content}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main SessionDetail panel ──

export default function SessionDetail() {
  const ctx = useUsage();
  const selectedKey = ctx.selectedSessions.length === 1 ? ctx.selectedSessions[0] : null;

  const session = useMemo(() => {
    if (!selectedKey) return null;
    return ctx.sessionsUsage?.sessions?.find((s) => s.key === selectedKey) ?? null;
  }, [selectedKey, ctx.sessionsUsage?.sessions]);

  // Time series state
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false);
  const [timeSeriesMode, setTimeSeriesMode] = useState<"cumulative" | "per-turn">("per-turn");

  // Logs state
  const [logs, setLogs] = useState<SessionLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [expandedLogIndices, setExpandedLogIndices] = useState<Set<number>>(new Set());
  const [logRoleFilter, setLogRoleFilter] = useState<Set<string>>(
    new Set(["user", "assistant", "tool", "toolResult"])
  );
  const [logSearch, setLogSearch] = useState("");

  // Load data when session changes
  useEffect(() => {
    if (!selectedKey) {
      setTimeSeries([]);
      setLogs([]);
      return;
    }

    setTimeSeriesLoading(true);
    setLogsLoading(true);
    setExpandedLogIndices(new Set());
    setLogSearch("");

    loadTimeSeries(selectedKey)
      .then(setTimeSeries)
      .finally(() => setTimeSeriesLoading(false));

    loadSessionLogs(selectedKey)
      .then(setLogs)
      .finally(() => setLogsLoading(false));
  }, [selectedKey]);

  const toggleLogEntry = useCallback((index: number) => {
    setExpandedLogIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const filteredLogs = useMemo(() => {
    let filtered = logs.filter((l) => logRoleFilter.has(l.role));
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.content?.toLowerCase().includes(q) ||
          l.toolName?.toLowerCase().includes(q) ||
          l.role.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [logs, logRoleFilter, logSearch]);

  const toggleRole = useCallback((role: string) => {
    setLogRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }, []);

  if (!session || !selectedKey) return null;

  const u = session.usage as SessionUsage | null;
  const mc = u?.messageCounts;
  const tu = u?.toolUsage;
  const mu = u?.modelUsage;
  const durationMs =
    u?.firstActivity && u?.lastActivity
      ? Math.abs(u.lastActivity - u.firstActivity)
      : 0;
  const durationLabel = durationMs > 0
    ? durationMs > 3_600_000
      ? `${(durationMs / 3_600_000).toFixed(1)}h`
      : durationMs > 60_000
        ? `${Math.round(durationMs / 60_000)}m`
        : `${Math.round(durationMs / 1000)}s`
    : "–";

  const sessionName = session.label ?? session.key;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{sessionName}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => ctx.onClearSessions()}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* Metadata badges */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {session.channel && (
              <Badge variant="outline" className="text-[10px]">
                {session.channel}
              </Badge>
            )}
            {session.agentId && (
              <Badge variant="outline" className="text-[10px]">
                {session.agentId}
              </Badge>
            )}
            {session.modelProvider && (
              <Badge variant="outline" className="text-[10px]">
                {session.modelProvider}
              </Badge>
            )}
            {session.model && (
              <Badge variant="outline" className="text-[10px]">
                {session.model}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-center">
              <MessageSquare className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm font-semibold tabular-nums">{mc?.total ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Messages</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-center">
              <Wrench className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm font-semibold tabular-nums">{tu?.totalCalls ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Tool Calls</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-center">
              <AlertTriangle className={cn("h-3.5 w-3.5 mx-auto mb-1", (mc?.errors ?? 0) > 0 ? "text-destructive" : "text-muted-foreground")} />
              <div className="text-sm font-semibold tabular-nums">{mc?.errors ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">Errors</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-center">
              <Clock className="h-3.5 w-3.5 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm font-semibold tabular-nums">{durationLabel}</div>
              <div className="text-[10px] text-muted-foreground">Duration</div>
            </div>
          </div>

          {/* Top tools */}
          {tu?.tools && tu.tools.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Top Tools</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tu.tools.slice(0, 6).map((tool, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {tool.name}
                    {tool.count != null && tool.count > 1 && (
                      <span className="ml-1 text-muted-foreground">×{tool.count}</span>
                    )}
                  </Badge>
                ))}
                {tu.tools.length > 6 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{tu.tools.length - 6} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Model mix */}
          {mu && mu.length > 1 && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Model Mix</span>
              </div>
              <div className="space-y-1">
                {mu.slice(0, 4).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate">
                      {m.provider && <span className="text-muted-foreground">{m.provider}/</span>}
                      {m.model ?? "unknown"}
                    </span>
                    {m.count != null && (
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {m.count} msg{m.count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time series */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Time Series</span>
              </div>
              <Tabs
                value={timeSeriesMode}
                onValueChange={(v) => setTimeSeriesMode(v as "cumulative" | "per-turn")}
              >
                <TabsList className="h-6">
                  <TabsTrigger value="per-turn" className="text-[10px] px-2 h-5">
                    Per-turn
                  </TabsTrigger>
                  <TabsTrigger value="cumulative" className="text-[10px] px-2 h-5">
                    Cumulative
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {timeSeriesLoading ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Loading time series...</span>
              </div>
            ) : timeSeries.length > 0 ? (
              <div className="rounded-lg border border-border/60 bg-muted/10 overflow-hidden">
                <TimeSeriesChart points={timeSeries} mode={timeSeriesMode} />
                <div className="px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border/30">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-[hsl(var(--chart-1))]" />
                    User
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-[hsl(var(--chart-2))]" />
                    Assistant
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-[hsl(var(--chart-3))]" />
                    Tool
                  </span>
                  <span className="ml-auto tabular-nums">
                    {timeSeries.length} turn{timeSeries.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No time series data available for this session.
              </div>
            )}
          </div>

          {/* Session logs */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                className="flex items-center gap-1.5"
                onClick={() => setLogsExpanded(!logsExpanded)}
              >
                {logsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Logs
                  {logs.length > 0 && (
                    <span className="ml-1 text-muted-foreground/60">
                      ({filteredLogs.length} of {logs.length})
                    </span>
                  )}
                </span>
              </button>
              {logsExpanded && logs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setExpandedLogIndices(new Set(filteredLogs.map((l) => l.index)))}
                  >
                    Expand All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setExpandedLogIndices(new Set())}
                  >
                    Collapse
                  </Button>
                </div>
              )}
            </div>
            <AnimatePresence initial={false}>
              {logsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {logsLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Loading logs...</span>
                    </div>
                  ) : logs.length > 0 ? (
                    <div className="space-y-2">
                      {/* Log filters */}
                      <div className="flex flex-wrap items-center gap-2">
                        {["user", "assistant", "tool", "toolResult"].map((role) => (
                          <label
                            key={role}
                            className="flex items-center gap-1.5 text-[11px] cursor-pointer"
                          >
                            <Checkbox
                              checked={logRoleFilter.has(role)}
                              onCheckedChange={() => toggleRole(role)}
                              className="h-3.5 w-3.5"
                            />
                            <span className={cn(ROLE_COLORS[role] ?? "text-muted-foreground")}>
                              {role}
                            </span>
                          </label>
                        ))}
                        <Input
                          className="h-6 text-[11px] flex-1 min-w-[120px] max-w-[200px]"
                          placeholder="Search logs..."
                          value={logSearch}
                          onChange={(e) => setLogSearch(e.target.value)}
                        />
                      </div>

                      {/* Log entries */}
                      <ScrollArea className="max-h-[400px] rounded-lg border border-border/60">
                        {filteredLogs.map((entry) => (
                          <LogEntryRow
                            key={entry.index}
                            entry={entry}
                            expanded={expandedLogIndices.has(entry.index)}
                            onToggle={() => toggleLogEntry(entry.index)}
                          />
                        ))}
                        {filteredLogs.length === 0 && (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            No logs match current filters.
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-4 text-center">
                      No log data available for this session.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
