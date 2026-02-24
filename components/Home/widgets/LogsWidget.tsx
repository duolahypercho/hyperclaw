import React, { memo, useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { CustomProps } from "$/components/Home/widgets/types/widgets";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  ScrollText,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { useFocusMode } from "./hooks/useFocusMode";
import { cn } from "@/lib/utils";

const LINES_REQUEST = 200;
const AUTO_REFRESH_MS = 5000;

export type LogEntry = { time?: string; level?: string; message?: string };

async function fetchLogsFromBridge(lines: number): Promise<{ data: LogEntry[] | string; error?: string }> {
  const json = await bridgeInvoke("get-logs", { lines });
  const err = (json as { error?: string })?.error;
  if (err) return { data: [], error: err };
  const data = Array.isArray(json) ? json : ((json as { data?: LogEntry[] })?.data ?? []);
  return { data };
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" }).toLowerCase();
  } catch {
    return iso;
  }
}

function dotColor(level: string): string {
  const l = (level ?? "").toUpperCase();
  if (l === "ERROR") return "bg-destructive";
  if (l === "WARN" || l === "WARNING") return "bg-amber-500";
  if (l === "DEBUG") return "bg-muted-foreground";
  return "bg-emerald-500";
}

/** Tag badge color for gateway-style [tag] (reload, ws, hooks/..., agents/...). */
function tagBadgeClass(tag: string): string {
  const t = (tag ?? "").toLowerCase();
  if (t === "ws") return "bg-primary/20 text-primary border border-primary/30";
  if (t.startsWith("reload")) return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30";
  if (t.startsWith("hooks")) return "bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-500/30";
  if (t.startsWith("agents")) return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30";
  if (t === "error") return "bg-destructive/20 text-destructive border border-destructive/30";
  if (t === "warn" || t === "warning") return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30";
  return "bg-muted/80 text-muted-foreground border border-border";
}

/** Expand JSON messages so all fields (subsystem, module, storePath, etc.) are visible. */
function formatMessageForDisplay(msg: string): string {
  if (!msg || typeof msg !== "string") return msg ?? "";
  const trimmed = msg.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const o = JSON.parse(msg);
      if (o && typeof o === "object" && !Array.isArray(o)) {
        return Object.entries(o)
          .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
          .join(" · ");
      }
    } catch {
      // fall through to raw message
    }
  }
  return msg;
}

/** Match gateway-style "⇄ res ✓ method 70ms" or "⇄ res ✓chat.send53ms" (with or without spaces). */
const WS_RESPONSE = /^(⇄\s*res\s*✓)\s*([a-zA-Z._]+)(\d+ms)?(.*)$/;
/** Match gateway error response "⇄ res ✗ agent 0ms errorCode=UNAVAILABLE ..." */
const WS_RESPONSE_ERROR = /^(⇄\s*res\s*✗)\s*([a-zA-Z._]+)(\d+ms)?(.*)$/;
const CONFIG_READS = /^(config change (?:detected|applied));?\s*(.*)$/i;
const SESSION_SAVED = /^(Session context saved to)\s+(.+)$/i;
const IMAGE_RESIZED = /^(Image resized to fit limits:)\s+(.+)$/i;

function formatMessageContent(msg: string): React.ReactNode {
  if (!msg || typeof msg !== "string") return null;
  const raw = formatMessageForDisplay(msg);
  const m = raw.trim();

  const wsErrorMatch = m.match(WS_RESPONSE_ERROR);
  if (wsErrorMatch) {
    const [, iconPart, method, duration, tail] = wsErrorMatch;
    return (
      <>
        <span className="text-destructive font-medium" aria-hidden>{iconPart}</span>
        <span className="text-destructive mx-1">{method}</span>
        {duration && <span className="text-destructive/80 tabular-nums ml-0.5">{duration}</span>}
        {tail && <span className="text-destructive break-words ml-0.5" title={tail.trim()}>{tail.trim()}</span>}
      </>
    );
  }

  const wsMatch = m.match(WS_RESPONSE);
  if (wsMatch) {
    const [, iconPart, method, duration, tail] = wsMatch;
    return (
      <>
        <span className="text-emerald-500 dark:text-emerald-400" aria-hidden>{iconPart}</span>
        <span className="font-normal text-foreground mx-1">{method}</span>
        {duration && <span className="text-muted-foreground tabular-nums ml-0.5">{duration}</span>}
        {tail && <span className="text-muted-foreground break-words ml-0.5" title={tail.trim()}>{tail.trim()}</span>}
      </>
    );
  }

  const configMatch = m.match(CONFIG_READS);
  if (configMatch) {
    const [, action, rest] = configMatch;
    return (
      <>
        <span className="text-amber-600 dark:text-amber-400">{action}</span>
        {rest && <span className="text-muted-foreground"> {rest}</span>}
      </>
    );
  }

  const sessionMatch = m.match(SESSION_SAVED);
  if (sessionMatch) {
    const [, prefix, pathPart] = sessionMatch;
    return (
      <>
        <span className="text-muted-foreground">{prefix}</span>{" "}
        <code className="text-[11px] bg-muted/60 px-1 rounded break-all">{pathPart.trim()}</code>
      </>
    );
  }

  const imageMatch = m.match(IMAGE_RESIZED);
  if (imageMatch) {
    const [, prefix, details] = imageMatch;
    return (
      <>
        <span className="text-muted-foreground">{prefix}</span>{" "}
        <span className="text-foreground/90 tabular-nums">{details.trim()}</span>
      </>
    );
  }

  return highlightMessage(raw) ?? raw;
}

/** True if this log entry should be shown as an error (red styling). */
function isErrorLogEntry(e: LogEntry): boolean {
  if ((e.level ?? "").toUpperCase() === "ERROR") return true;
  const msg = e.message ?? "";
  return msg.includes("⇄ res ✗") || /errorCode=/i.test(msg);
}

/** True if message looks like markdown (AI/content block). */
function looksLikeMarkdown(msg: string): boolean {
  if (!msg || typeof msg !== "string") return false;
  const m = msg.trim();
  return /\n/.test(m) || /\*\*[^*]+\*\*/.test(m) || /^##\s/.test(m) || /^###\s/.test(m) || /```/.test(m) || /^---$/.test(m) || /^- /.test(m);
}

const HIGHLIGHT_KEYWORDS = /(\[?\b(webhook|telegram|hooks|gateway|OS\/browser|default|ms)\b\]?)/gi;
const IS_KEYWORD = /^\[?\b(webhook|telegram|hooks|gateway|OS\/browser|default|ms)\b\]?$/i;

function highlightMessage(msg: string): React.ReactNode {
  if (!msg) return null;
  const parts = msg.split(HIGHLIGHT_KEYWORDS);
  return parts.map((part, i) =>
    IS_KEYWORD.test(part) ? (
      <span key={i} className="text-emerald-400">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Merge consecutive INFO entries (e.g. long AI/markdown blocks) into single rows. */
const MAX_INFO_GROUP = 50;

function groupConsecutiveInfo(entries: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    const isInfo = (e.level ?? "").toUpperCase() === "INFO";
    if (!isInfo) {
      out.push(e);
      i++;
      continue;
    }
    const group: LogEntry[] = [];
    while (i < entries.length && (entries[i].level ?? "").toUpperCase() === "INFO" && group.length < MAX_INFO_GROUP) {
      group.push(entries[i]);
      i++;
    }
    if (group.length === 1) {
      out.push(group[0]);
    } else {
      const first = group[0];
      const time = first.time;
      const message = group.map((x) => (x.message ?? "").trim()).filter(Boolean).join("\n");
      out.push({ time, level: "INFO", message: message || first.message });
    }
  }
  return out;
}

/** Render inline markdown: **bold**, `code`, ## header, ### subheader. */
function renderInlineMarkdown(line: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let rest = line;
  let key = 0;
  while (rest.length > 0) {
    const bold = /^\*\*([^*]+)\*\*/.exec(rest);
    const code = /^`([^`]*)`/.exec(rest);
    if (bold) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{bold[1]}</strong>);
      rest = rest.slice(bold[0].length);
    } else if (code) {
      parts.push(<code key={key++} className="bg-muted/70 px-1 rounded text-[11px]">{code[1]}</code>);
      rest = rest.slice(code[0].length);
    } else {
      const next = rest.match(/\*\*[^*]*\*\*|`[^`]*`/);
      const plainEnd = next ? rest.indexOf(next[0]) : rest.length;
      parts.push(<span key={key++}>{rest.slice(0, plainEnd)}</span>);
      rest = rest.slice(plainEnd);
    }
  }
  return <>{parts}</>;
}

/** Render a (possibly multi-line) message with simple markdown: ##, ###, **, `, ```, ---. */
function renderMessageWithMarkdown(msg: string): React.ReactNode {
  if (!msg || typeof msg !== "string") return null;
  const raw = msg.trim();
  const lines = raw.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const block: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        block.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      nodes.push(
        <pre key={key++} className="bg-muted/50 rounded p-2 my-1 text-xs overflow-x-auto border border-border/50">
          <code>{block.join("\n")}</code>
        </pre>
      );
      continue;
    }
    if (line.trim() === "---") {
      nodes.push(<hr key={key++} className="border-border/50 my-1" />);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(<div key={key++} className="text-xs font-semibold text-foreground mt-1">{renderInlineMarkdown(line.slice(4))}</div>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<div key={key++} className="text-xs font-bold text-foreground mt-1.5">{renderInlineMarkdown(line.slice(3))}</div>);
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      nodes.push(<div key={key++} className="pl-2 text-muted-foreground">{renderInlineMarkdown(line.slice(2))}</div>);
      i++;
      continue;
    }
    nodes.push(<div key={key++} className="leading-relaxed">{renderInlineMarkdown(line)}</div>);
    i++;
  }
  return <div className="space-y-0.5">{nodes}</div>;
}

interface LogsCustomHeaderProps extends CustomProps {
  onRefresh?: () => void;
  refreshing?: boolean;
  eventCount?: number;
}

export const LogsCustomHeader: React.FC<LogsCustomHeaderProps> = ({
  widget,
  isMaximized,
  onMaximize,
  isEditMode,
  onRefresh,
  refreshing = false,
  eventCount,
}) => (
  <div className="flex items-center justify-between px-4 py-2">
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {isEditMode && (
        <div className="cursor-move h-7 w-7 flex items-center justify-center flex-shrink-0">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="text-primary flex-shrink-0">
        <ScrollText className="w-3.5 h-3.5" />
      </div>
      <h3 className="text-xs font-normal text-foreground truncate">
        {widget.title}
      </h3>
      {eventCount != null && eventCount > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">
          {eventCount} events
        </span>
      )}
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      {onRefresh && (
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-7 w-7"
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", refreshing && "animate-spin")}
          />
        </Button>
      )}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onMaximize}
        className="h-7 w-7"
      >
        {isMaximized ? (
          <Minimize2 className="w-3.5 h-3.5" />
        ) : (
          <Maximize2 className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  </div>
);

const LogsWidgetContent = memo((props: CustomProps) => {
  const { isFocusModeActive } = useFocusMode();
  const [logs, setLogs] = useState<LogEntry[] | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const { data, error: err } = await fetchLogsFromBridge(LINES_REQUEST);
    if (!isMounted.current) return;
    if (!silent) setLoading(false);
    if (err) {
      setError(err);
      setLogs(null);
    } else {
      setLogs(data);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchLogs(false);
    const t = setInterval(() => fetchLogs(true), AUTO_REFRESH_MS);
    return () => {
      isMounted.current = false;
      clearInterval(t);
    };
  }, [fetchLogs]);

  const rawEntries = Array.isArray(logs) ? logs : [];
  const entries = groupConsecutiveInfo(rawEntries);
  const isStringFallback = logs != null && typeof logs === "string";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (entries.length > 0 || isStringFallback) {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [entries.length, isStringFallback]);

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
          "h-full w-full flex flex-col overflow-hidden bg-card/70 backdrop-blur-xl border border-border transition-all shadow-sm duration-300 rounded-md",
          isFocusModeActive && "border-transparent grayscale-[30%]"
        )}
      >
        <LogsCustomHeader
          {...props}
          onRefresh={fetchLogs}
          refreshing={loading}
          eventCount={rawEntries.length}
        />
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 min-w-0 px-2 pb-2">
          {error ? (
            <div className="flex-1 rounded-md bg-destructive/10 border border-destructive/20 p-3 overflow-auto">
              <p className="text-sm text-destructive font-mono whitespace-pre-wrap">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-sm"
                onClick={async () => { await fetchLogs(false); }}
                disabled={loading}
              >
                <RefreshCw
                  className={cn("w-3 h-3 mr-1", loading && "animate-spin")}
                />
                Retry
              </Button>
            </div>
          ) : loading && !logs ? (
            <div className="flex-1 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading logs...
              </span>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 min-w-0 rounded-md border border-border/50 bg-background/40 overflow-x-hidden">
                <div className="p-2 min-h-0 min-w-0 overflow-hidden">
                  {isStringFallback ? (
                    <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground max-w-full">
                      {logs}
                    </pre>
                  ) : entries.length > 0 ? (
                    <ul className="text-xs min-w-0 overflow-hidden divide-y divide-border/50">
                      {entries.map((e, i) => (
                        <li
                          key={i}
                          className={cn(
                            "flex items-start gap-2 py-2 px-2 min-w-0 overflow-hidden group border-b border-solid border-t-0 border-l-0 border-r-0 border-border/50",
                            isErrorLogEntry(e) && "bg-destructive/5 border-l-2 border-l-destructive"
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
                              isErrorLogEntry(e) ? "bg-destructive" : dotColor(e.level ?? "INFO")
                            )}
                            aria-hidden
                          />
                          <div className="flex flex-col items-start gap-1 mr-1">
                          <span
                            className="text-muted-foreground shrink-0 tabular-nums whitespace-nowrap w-16"
                            title={e.time ?? undefined}
                          >
                            {formatTime(e.time)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 px-1.5 py-0.5 rounded text-xs font-normal border",
                              tagBadgeClass(e.level ?? "info")
                            )}
                            title={e.level ?? undefined}
                          >
                            {e.level ?? "info"}
                          </span>

                          </div>
                          <span
                            className={cn(
                              "min-w-0 flex-1 overflow-hidden break-words leading-relaxed",
                              isErrorLogEntry(e) ? "text-destructive" : "text-foreground/90"
                            )}
                          >
                            {(e.level ?? "").toUpperCase() === "INFO" && looksLikeMarkdown(e.message ?? "")
                              ? renderMessageWithMarkdown(e.message ?? "")
                              : formatMessageContent(e.message ?? "")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm py-4 text-center">
                      No log output yet. Refreshing every {AUTO_REFRESH_MS / 1000}s.
                    </p>
                  )}
                  {(entries.length > 0 || isStringFallback) && (
                    <div ref={bottomRef} aria-hidden className="h-0 shrink-0" />
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
