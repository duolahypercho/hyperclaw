"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, MessageSquare, User, Bot, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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
}

const roleIcons: Record<string, React.ReactNode> = {
  user: <User className="h-3.5 w-3.5 shrink-0 text-blue-500" />,
  assistant: <Bot className="h-3.5 w-3.5 shrink-0 text-emerald-500" />,
  system: <Terminal className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
  tool: <Terminal className="h-3.5 w-3.5 shrink-0 text-purple-500" />,
};

function parseContent(msg: TranscriptMessage): string {
  const raw = msg.content_json ?? msg.content;
  if (!raw) return "";
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return JSON.stringify(raw, null, 2);
}

export function TranscriptViewer({
  open,
  onOpenChange,
  sessionKey,
  label,
}: TranscriptViewerProps) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async (key: string) => {
    setLoading(true);
    try {
      const resp = await fetch("/api/hyperclaw-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-session-messages", sessionKey: key }),
      });
      const data = await resp.json();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 sm:rounded-xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 space-y-1 shrink-0">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Transcript
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground break-all">
            {label || sessionKey || "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 min-h-0">
          <ScrollArea
            className="w-full rounded-md border border-border/40"
            style={{ height: "min(60vh, 500px)" }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No transcript messages found.
              </div>
            ) : (
              <ul className="space-y-1.5 p-3">
                {messages.map((msg, i) => {
                  const role = msg.role || msg.stream || "unknown";
                  const icon = roleIcons[role] ?? (
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  );
                  const content = parseContent(msg);
                  return (
                    <li
                      key={msg.id ?? i}
                      className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {icon}
                        <span className="font-medium capitalize text-foreground/80">
                          {role}
                        </span>
                        {msg.run_id && (
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                            {msg.run_id}
                          </span>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-foreground/90 font-mono text-[11px] leading-relaxed">
                        {content}
                      </pre>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
