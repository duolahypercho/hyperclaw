"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  MessageSquare,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { cn } from "$/utils";

interface SessionItem {
  key: string;
  label?: string;
  createdAt?: number;
  updatedAt?: number;
  status?: string;
  preview?: string;
}

interface SessionHistoryDropdownProps {
  sessions: SessionItem[];
  isLoading: boolean;
  onLoadSession: (sessionKey: string) => void;
  onNewChat: () => void;
  onFetchSessions: () => void;
  currentSessionKey?: string;
  error?: string | null;
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) return "now";
  if (diffInHours < 24) return `${Math.floor(diffInHours)}h`;
  if (diffInHours < 48) return "1d";
  if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getTimeGroup(timestamp?: number) {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 24) return "Today";
  if (diffInHours < 48) return "Yesterday";
  if (diffInHours < 168) return "This Week";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupSessionsByTime(sessions: SessionItem[]) {
  const groups: { [key: string]: SessionItem[] } = {};
  sessions.forEach((session) => {
    const group = getTimeGroup(session.updatedAt);
    if (!groups[group]) groups[group] = [];
    groups[group].push(session);
  });
  return groups;
}

// Session key name helper
function getSessionName(session: SessionItem) {
  const parts = session.key.split(":");
  return parts.slice(3).join(":") || session.key;
}

// ─── Chat Sessions Content ──────────────────────────────────────────
function ChatSessionsContent({
  sessions,
  isLoading,
  error,
  currentSessionKey,
  onLoadSession,
  onNewChat,
  onFetchSessions,
  onClose,
}: SessionHistoryDropdownProps & { onClose: () => void }) {
  return (
    <>
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-medium text-xs">Recent Sessions</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => {
            onNewChat();
            onClose();
          }}
        >
          + New Chat
        </Button>
      </div>

      <div className="max-h-80 overflow-y-auto customScrollbar2">
        {isLoading ? (
          <div className="p-4 text-center">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2" />
              <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            </div>
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <div className="w-8 h-8 text-destructive mx-auto mb-2 flex items-center justify-center">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <p className="text-xs text-destructive font-medium">
              Failed to load sessions
            </p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <button
              onClick={onFetchSessions}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No sessions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start a new chat to see it here
            </p>
          </div>
        ) : (
          <div className="p-2">
            {Object.entries(groupSessionsByTime(sessions)).map(
              ([timeGroup, groupSessions]) => (
                <div key={timeGroup} className="mb-3">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                    {timeGroup}
                  </h4>
                  {groupSessions.map((session) => {
                    const isActive = session.status === "active";
                    const isWaiting = session.status === "waiting";
                    const isSuccess = session.status === "completed" || session.status === "success" || session.status === "done";
                    const isError = session.status === "error" || session.status === "failed" || session.status === "aborted";
                    const title = session.label || getSessionName(session) || "Untitled Session";
                    return (
                      <motion.div
                        key={session.key}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          "px-2 py-2 rounded-lg cursor-pointer transition-colors",
                          session.key === currentSessionKey
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/80"
                        )}
                        onClick={() => {
                          onLoadSession(session.key);
                          onClose();
                        }}
                      >
                        {/* Title row: status icon + label + time */}
                        <div className="flex items-center gap-2">
                          <div className="shrink-0 w-3 flex items-center justify-center">
                            {isActive ? (
                              <span className="relative flex w-2 h-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
                              </span>
                            ) : isWaiting ? (
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                            ) : isSuccess ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : isError ? (
                              <X className="w-3 h-3 text-destructive" />
                            ) : (
                              <MessageSquare className={cn(
                                "w-3 h-3",
                                session.key === currentSessionKey ? "text-primary" : "text-muted-foreground/50"
                              )} />
                            )}
                          </div>
                          <p className={cn(
                            "text-xs font-medium flex-1 min-w-0 truncate",
                            session.key === currentSessionKey ? "text-primary" : "text-foreground/80"
                          )}>
                            {title}
                          </p>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatDate(session.updatedAt)}
                          </span>
                        </div>
                        {/* Message preview — max 2 lines */}
                        {session.preview && (
                          <p className="text-[11px] text-muted-foreground/60 line-clamp-2 [overflow-wrap:anywhere] mt-1 pl-5">
                            {session.preview}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Dropdown ───────────────────────────────────────────────────
export const SessionHistoryDropdown: React.FC<SessionHistoryDropdownProps> = (
  props
) => {
  const { onFetchSessions } = props;
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      onFetchSessions();
    }
  }, [isOpen]);

  return (
    <div className="relative h-6 w-6 inline-block">
      <HyperchoTooltip value="Chat History">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setIsOpen(!isOpen)}
        >
          <History className="w-4 h-4" />
        </Button>
      </HyperchoTooltip>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full w-80 z-50"
          >
            <Card className="bg-background/95 backdrop-blur-sm border border-solid border-border shadow-lg">
              <CardContent className="p-0">
                <ChatSessionsContent
                  {...props}
                  onClose={() => setIsOpen(false)}
                />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SessionHistoryDropdown;
