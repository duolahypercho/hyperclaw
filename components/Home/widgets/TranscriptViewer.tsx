"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { bridgeInvoke } from "$/lib/hyperclaw-bridge-client";
import { Loader2, MessageSquare, User, Bot, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface TranscriptMessage {
  id?: number;
  session_key: string;
  run_id?: string;
  stream?: string;
  role?: string;
  content_json?: string;
  content?: unknown;
  created_at_ms: number;
}

export interface TranscriptViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionKey: string | null;
  label?: string;
  /** Render inline (no Dialog wrapper) — for embedding in panels */
  inline?: boolean;
}

function parseContent(msg: TranscriptMessage): string {
  const raw = msg.content_json ?? msg.content;
  if (!raw) return "";
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      // For arrays (e.g. content blocks), extract text parts
      if (Array.isArray(parsed)) {
        return parsed
          .map((b: any) => {
            if (typeof b === "string") return b;
            if (b.type === "text") return b.text || "";
            if (b.type === "thinking") return "";
            if (b.type === "tool_use") return `[Tool: ${b.name}]`;
            if (b.type === "tool_result") {
              const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
              return `[Result: ${text?.slice(0, 200)}]`;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n");
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return JSON.stringify(raw, null, 2);
}

function resolveRole(msg: TranscriptMessage): string {
  return msg.role || msg.stream || "unknown";
}

export function TranscriptViewer({
  open,
  onOpenChange,
  sessionKey,
  label,
  inline = false,
}: TranscriptViewerProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const data = await bridgeInvoke("get-session-messages", { sessionKey: key }) as any;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && sessionKey) {
      fetchMessages(sessionKey);
    } else {
      setMessages([]);
    }
  }, [open, sessionKey, fetchMessages]);

  // Auto-scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Filter out system/tool messages that have no useful content
  const visibleMessages = messages.filter((msg) => {
    const role = resolveRole(msg);
    const content = parseContent(msg);
    if (!content.trim()) return false;
    // Keep user, assistant, and tool results
    if (role === "system") return false;
    return true;
  });

  const messageList = (
    <div className={cn(
      "overflow-y-auto customScrollbar2",
      inline ? "px-2.5 py-2 max-h-[240px]" : "px-4 py-4",
    )} style={!inline ? { maxHeight: "min(65vh, 540px)" } : undefined}>
      {loading ? (
        <div className={cn("flex items-center justify-center", inline ? "py-6" : "py-16")}>
          <Loader2 className={cn("animate-spin text-muted-foreground", inline ? "w-4 h-4" : "w-6 h-6")} />
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className={cn("text-center text-muted-foreground", inline ? "py-4 text-xs" : "py-12 text-sm")}>
          No messages in this session.
        </div>
      ) : (
        <div className={cn(inline ? "space-y-2" : "space-y-3")}>
          {visibleMessages.map((msg, i) => {
            const role = resolveRole(msg);
            const isUser = role === "user";
            const isTool = role === "tool" || role === "toolResult";
            const content = parseContent(msg);
            const showAvatar = i === 0 || resolveRole(visibleMessages[i - 1]) !== role;

            return (
              <div
                key={msg.id ?? i}
                className={cn(
                  "flex gap-2",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                {/* Left avatar for assistant/tool */}
                {!isUser && (
                  <div className={cn("flex-shrink-0 mt-0.5", inline ? "w-5 h-5" : "w-6 h-6")}>
                    {showAvatar ? (
                      <div className={cn(
                        "rounded-full flex items-center justify-center",
                        inline ? "w-5 h-5" : "w-6 h-6",
                        isTool ? "bg-purple-500/10" : "bg-primary/10"
                      )}>
                        {isTool ? (
                          <Terminal className={cn(inline ? "h-2.5 w-2.5" : "h-3 w-3", "text-purple-500")} />
                        ) : (
                          <Bot className={cn(inline ? "h-2.5 w-2.5" : "h-3 w-3", "text-primary")} />
                        )}
                      </div>
                    ) : (
                      <div className={cn(inline ? "w-5 h-5" : "w-6 h-6")} />
                    )}
                  </div>
                )}

                <div
                  className={cn(
                    "relative flex flex-col max-w-[85%] min-w-0",
                    isUser ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "w-full max-w-full overflow-hidden select-text",
                      inline ? "py-1 px-2 text-xs" : "py-2 px-3 text-sm",
                      isUser
                        ? "bg-primary text-primary-foreground rounded-t-xl rounded-bl-xl rounded-br-sm"
                        : isTool
                          ? "bg-purple-500/5 border border-purple-500/20 rounded-t-xl rounded-br-xl rounded-bl-sm font-mono text-xs"
                          : "bg-muted/50 border border-border/50 rounded-t-xl rounded-br-xl rounded-bl-sm"
                    )}
                  >
                    {isTool ? (
                      <pre className={cn(
                        "whitespace-pre-wrap break-words leading-relaxed overflow-y-auto",
                        inline ? "text-[10px] max-h-[100px]" : "text-[11px] max-h-[200px]"
                      )}>
                        {content}
                      </pre>
                    ) : (
                      <div className={cn(
                        "prose dark:prose-invert max-w-none break-words",
                        inline
                          ? "prose-xs [&_p]:my-0.5 [&_p]:leading-snug [&_pre]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0 [&_code]:text-[10px] [&_pre]:text-[10px]"
                          : "prose-sm [&_p]:my-1 [&_p]:leading-relaxed [&_pre]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:text-xs [&_pre]:text-xs",
                        isUser && "[&_p]:text-primary-foreground [&_code]:text-primary-foreground/90 [&_strong]:text-primary-foreground [&_a]:text-primary-foreground"
                      )}>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                          {content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <span className={cn("text-muted-foreground mt-0.5 px-1", inline ? "text-[9px]" : "text-[10px]")}>
                    {format(new Date(msg.created_at_ms), "h:mm a")}
                  </span>
                </div>

                {/* Right avatar for user */}
                {isUser && (
                  <div className={cn("flex-shrink-0 mt-0.5", inline ? "w-5 h-5" : "w-6 h-6")}>
                    {showAvatar ? (
                      <div className={cn(
                        "rounded-full bg-blue-500/10 flex items-center justify-center",
                        inline ? "w-5 h-5" : "w-6 h-6"
                      )}>
                        <User className={cn(inline ? "h-2.5 w-2.5" : "h-3 w-3", "text-blue-500")} />
                      </div>
                    ) : (
                      <div className={cn(inline ? "w-5 h-5" : "w-6 h-6")} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );

  if (inline) return messageList;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-3 space-y-1 shrink-0 border-b border-border/30">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Session Transcript
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground break-all">
            {label || sessionKey || "—"}
          </DialogDescription>
        </DialogHeader>
        {messageList}
      </DialogContent>
    </Dialog>
  );
}
