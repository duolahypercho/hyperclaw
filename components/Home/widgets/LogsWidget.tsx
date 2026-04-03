import React, { memo, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  ScrollText,
  RefreshCw,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import {
  subscribeGatewayConnection,
  getGatewayConnectionState,
} from "$/lib/openclaw-gateway-ws";
import { useFocusMode } from "./hooks/useFocusMode";
import { cn } from "@/lib/utils";

// ── Types & Constants ────────────────────────────────
const LOGS_LIMIT = 500;
const AUTO_REFRESH_MS = 15_000;

/** Levels the OpenClaw JSONL can have — normalized to lowercase. */
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const VALID_LEVELS = new Set<string>(LOG_LEVELS);

export type LogEntry = {
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
};

type LevelFilters = Record<LogLevel, boolean>;
const ALL_ON: LevelFilters = { fatal: true, error: true, warn: true, info: true, debug: true, trace: true };

// ── Bridge → LogEntry mapping ────────────────────────
type BridgeEntry = { time?: string; level?: string; message?: string };

function toBridgeEntry(e: BridgeEntry): LogEntry {
  const raw = (e.level ?? "").toLowerCase();
  if (VALID_LEVELS.has(raw)) {
    return { time: e.time, level: raw as LogLevel, message: e.message, subsystem: null };
  }
  // Tag-like level ("ws", "gateway", "discord") → subsystem badge, classify as info
  return { time: e.time, level: "info", message: e.message, subsystem: e.level || null };
}

async function fetchLogs(): Promise<{ data: LogEntry[]; error?: string }> {
  try {
    const json = await bridgeInvoke("get-logs", { lines: LOGS_LIMIT });
    const err = (json as { error?: string })?.error;
    if (err) return { data: [], error: err };
    const raw = Array.isArray(json) ? json : ((json as { data?: BridgeEntry[] })?.data ?? []);
    return { data: (raw as BridgeEntry[]).map(toBridgeEntry) };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to fetch logs" };
  }
}

// ── Display helpers ──────────────────────────────────

function formatTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" }).toLowerCase();
  } catch { return iso; }
}

function levelDotClass(level?: LogLevel | null): string {
  if (level === "error" || level === "fatal") return "bg-destructive";
  if (level === "warn") return "bg-amber-500";
  if (level === "debug" || level === "trace") return "bg-muted-foreground";
  return "bg-emerald-500";
}

function levelBadgeClass(level?: LogLevel | null): string {
  if (level === "error" || level === "fatal") return "bg-destructive/15 text-destructive border-destructive/30";
  if (level === "warn") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (level === "debug" || level === "trace") return "bg-muted/80 text-muted-foreground border-border";
  return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
}

function chipClass(level: LogLevel, on: boolean): string {
  if (!on) return "text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 border-transparent";
  if (level === "error" || level === "fatal") return "bg-destructive/20 text-destructive border-destructive/30";
  if (level === "warn") return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30";
  if (level === "info") return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function isErrorRow(e: LogEntry): boolean {
  if (e.level === "error" || e.level === "fatal") return true;
  const msg = e.message ?? "";
  return msg.includes("⇄ res ✗") || /errorCode=/i.test(msg);
}

function matchesSearch(e: LogEntry, needle: string): boolean {
  if (!needle) return true;
  const haystack = [e.message, e.subsystem, e.level, e.time].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

// ── Header ───────────────────────────────────────────

interface LogsCustomHeaderProps extends CustomProps {
  onRefresh?: () => void;
  refreshing?: boolean;
  eventCount?: number;
  totalCount?: number;
}

export const LogsCustomHeader: React.FC<LogsCustomHeaderProps> = ({
  widget, isMaximized, onMaximize, isEditMode, onRefresh, refreshing = false, eventCount, totalCount,
}) => (
  <div className={cn("flex items-center justify-between px-4 py-2 transition-opacity duration-200", !isEditMode && "absolute top-0 left-0 right-0 z-10 bg-card/90 backdrop-blur-sm rounded-t-md opacity-0 group-hover:opacity-100")}>
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {isEditMode && (
        <div className="cursor-move h-7 w-7 flex items-center justify-center flex-shrink-0">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="text-primary flex-shrink-0"><ScrollText className="w-3.5 h-3.5" /></div>
      <h3 className="text-xs font-normal text-foreground truncate">{widget.title}</h3>
      {eventCount != null && eventCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">
          {eventCount}{totalCount != null && totalCount !== eventCount ? ` / ${totalCount}` : ""} events
        </span>
      )}
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      {onRefresh && (
        <Button variant="ghost" size="iconSm" onClick={onRefresh} disabled={refreshing} className="h-7 w-7">
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
        </Button>
      )}
      <Button variant="ghost" size="iconSm" onClick={onMaximize} className="h-7 w-7">
        {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </Button>
    </div>
  </div>
);

// ── Widget content ───────────────────────────────────

const LogsWidgetContent = memo((props: CustomProps) => {
  const { widget, onConfigChange } = props;
  const { isFocusModeActive } = useFocusMode();

  const config = widget.config as Record<string, unknown> | undefined;
  const savedLevels = config?.levelFilters as LevelFilters | undefined;
  const savedSearch = config?.searchQuery as string | undefined;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [levelFilters, setLevelFilters] = useState<LevelFilters>(savedLevels ?? { ...ALL_ON });
  const [searchQuery, setSearchQuery] = useState(savedSearch ?? "");
  const isMounted = useRef(true);

  // Persist settings (debounced)
  const onConfigChangeRef = useRef(onConfigChange);
  onConfigChangeRef.current = onConfigChange;
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      onConfigChangeRef.current?.({ levelFilters, searchQuery: searchQuery || undefined });
    }, 500);
    return () => { if (persistTimer.current) clearTimeout(persistTimer.current); };
  }, [levelFilters, searchQuery]);

  const toggleLevel = useCallback((lvl: LogLevel) => {
    setLevelFilters((prev) => ({ ...prev, [lvl]: !prev[lvl] }));
  }, []);

  const doFetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const { data, error: err } = await fetchLogs();
    if (!isMounted.current) return;
    if (!silent) setLoading(false);
    if (err) { setError(err); setLogs([]); }
    else { setLogs(data); }
  }, []);

  // Initial load + polling
  useEffect(() => {
    isMounted.current = true;
    doFetchLogs(false);
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!t) t = setInterval(() => doFetchLogs(true), AUTO_REFRESH_MS); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => { document.visibilityState === "visible" ? start() : stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { isMounted.current = false; stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [doFetchLogs]);

  // Re-fetch on gateway reconnect
  useEffect(() => {
    return subscribeGatewayConnection(() => {
      if (getGatewayConnectionState().connected) doFetchLogs(true);
    });
  }, [doFetchLogs]);

  // ── Filtering (OpenClaw style: entry.level checked against chips) ──
  const allLevelsOn = LOG_LEVELS.every((l) => levelFilters[l]);
  const isFiltering = !allLevelsOn || searchQuery.trim() !== "";
  const needle = searchQuery.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    if (!isFiltering) return logs;
    return logs.filter((e) => {
      if (e.level && !levelFilters[e.level]) return false;
      return matchesSearch(e, needle);
    });
  }, [logs, levelFilters, needle, isFiltering]);

  // Auto-scroll to bottom
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (filteredEntries.length > 0) {
      const vp = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
      if (vp) vp.scrollTop = vp.scrollHeight;
    }
  }, [filteredEntries.length]);

  return (
    <motion.div
      animate={{ opacity: isFocusModeActive ? 0.8 : 1, scale: isFocusModeActive ? 0.98 : 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full w-full"
    >
      <Card className={cn(
        "group h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all duration-300 rounded-md",
        isFocusModeActive && "border-transparent grayscale-[30%]",
      )}>
        <LogsCustomHeader
          {...props}
          onRefresh={() => doFetchLogs(false)}
          refreshing={loading}
          eventCount={isFiltering ? filteredEntries.length : logs.length}
          totalCount={isFiltering ? logs.length : undefined}
        />
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 min-w-0 px-2 pb-2">
          {error && logs.length === 0 ? (
            <div className="flex-1 rounded-md bg-destructive/10 border border-destructive/20 p-3 overflow-auto">
              <p className="text-sm text-destructive font-mono whitespace-pre-wrap">{error}</p>
              <Button variant="outline" size="sm" className="mt-2 h-7 text-sm"
                onClick={() => doFetchLogs(false)} disabled={loading}>
                <RefreshCw className={cn("w-3 h-3 mr-1", loading && "animate-spin")} /> Retry
              </Button>
            </div>
          ) : loading && logs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading logs...</span>
            </div>
          ) : (
            <>
              {/* Level chips + search */}
              {logs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5 shrink-0">
                  {LOG_LEVELS.map((lvl) => (
                    <button key={lvl} onClick={() => toggleLevel(lvl)}
                      className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border", chipClass(lvl, levelFilters[lvl]))}>
                      {lvl}
                    </button>
                  ))}
                  <div className="flex-1 relative min-w-[120px]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                    <input type="text" value={searchQuery}
                      onChange={(ev) => setSearchQuery(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Escape") { setSearchQuery(""); (ev.target as HTMLInputElement).blur(); } }}
                      placeholder="Search logs..."
                      className="w-full h-6 pl-6 pr-6 text-xs bg-muted/30 border border-border/50 rounded placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <ScrollArea ref={scrollAreaRef} className="flex-1 min-w-0 rounded-md border border-border/50 bg-background/40 overflow-x-hidden">
                <div className="p-2 min-h-0 min-w-0 w-full overflow-hidden">
                  {filteredEntries.length > 0 ? (
                    <ul className="text-xs min-w-0 w-full overflow-hidden divide-y divide-border/50">
                      {filteredEntries.map((e, i) => (
                        <li key={i} className={cn(
                          "flex items-start gap-2 py-2 px-2 min-w-0 group",
                          isErrorRow(e) && "bg-destructive/5 border-l-2 border-l-destructive",
                        )}>
                          <span className={cn("shrink-0 w-1.5 h-1.5 rounded-full mt-1.5", levelDotClass(e.level))} aria-hidden />
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {e.level && (
                                <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0", levelBadgeClass(e.level))}>
                                  {e.level}
                                </span>
                              )}
                              {e.subsystem && (
                                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]" title={e.subsystem}>
                                  {e.subsystem}
                                </span>
                              )}
                            </div>
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="text-muted-foreground shrink-0 tabular-nums whitespace-nowrap" title={e.time ?? undefined}>
                                {formatTime(e.time)}
                              </span>
                              <span className={cn(
                                "min-w-0 flex-1 break-words [overflow-wrap:anywhere] leading-relaxed font-mono whitespace-pre-wrap",
                                isErrorRow(e) ? "text-destructive" : "text-foreground/90",
                              )} title={e.message ?? undefined}>
                                {e.message}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : logs.length > 0 && isFiltering ? (
                    <p className="text-muted-foreground text-sm py-4 text-center">No logs matching filters.</p>
                  ) : (
                    <p className="text-muted-foreground text-sm py-4 text-center">
                      No log output yet. Refreshing every {AUTO_REFRESH_MS / 1000}s.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

LogsWidgetContent.displayName = "LogsWidgetContent";

const LogsWidget = memo((props: CustomProps) => {
  return <LogsWidgetContent {...props} />;
});

LogsWidget.displayName = "LogsWidget";

export default LogsWidget;
