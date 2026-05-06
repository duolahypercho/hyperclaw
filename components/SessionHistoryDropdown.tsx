"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  MessageSquare,
  Check,
  X,
  Search,
  Pin,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";
import { cn } from "$/utils";

export interface SessionItem {
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
  newChatLabel?: string;
  currentSessionKey?: string;
  error?: string | null;
  disabled?: boolean;
  /** The current primary session key — used to show a pin indicator */
  primarySessionKey?: string;
  /** Callback to designate a session as primary */
  onSetPrimary?: (sessionKey: string) => void;
  /** Callback to archive a session from the list */
  onArchiveSession?: (sessionKey: string) => Promise<void> | void;
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
  newChatLabel = "+ New Chat",
  onClose,
  primarySessionKey,
  onSetPrimary,
  onArchiveSession,
  disabled = false,
}: SessionHistoryDropdownProps & { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [archivingKey, setArchivingKey] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const showBlockingLoading = isLoading && sessions.length === 0;

  // Filter sessions by query against label, preview, and key (UUID fallback).
  // Kept lightweight — runs in-memory on the already-fetched session list.
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = [
        s.label ?? "",
        s.preview ?? "",
        s.key,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, query]);

  // Only surface the search bar once the list is large enough to need it.
  // Below 6 the grouped layout already fits in one screen of the dropdown.
  const showSearch = sessions.length > 6;

  const handleArchiveSession = useCallback(async (sessionKey: string) => {
    if (!onArchiveSession || disabled || archivingKey) return;
    setArchiveError(null);
    setArchivingKey(sessionKey);
    try {
      await onArchiveSession(sessionKey);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Failed to archive session");
    } finally {
      setArchivingKey(null);
    }
  }, [archivingKey, disabled, onArchiveSession]);

  return (
    <>
      <div className="p-3 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="font-medium text-xs">Recent Sessions</h3>
          {sessions.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {filteredSessions.length === sessions.length
                ? sessions.length
                : `${filteredSessions.length} / ${sessions.length}`}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs shrink-0"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            onNewChat();
            onClose();
          }}
        >
          {newChatLabel}
        </Button>
      </div>

      {showSearch && (
        <div className="px-3 py-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="w-full h-7 pl-7 pr-7 rounded-md bg-muted/40 border border-border/40 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:bg-background transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3 h-3 text-muted-foreground/60" />
              </button>
            )}
          </div>
        </div>
      )}

      {archiveError && (
        <div role="alert" className="px-3 py-2 border-b border-border/40 text-[11px] text-destructive">
          {archiveError}
        </div>
      )}

      <div className="max-h-96 overflow-y-auto customScrollbar2">
        {showBlockingLoading ? (
          <div className="p-4 text-center">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2" />
              <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            </div>
          </div>
        ) : error && sessions.length === 0 ? (
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
        ) : filteredSessions.length === 0 ? (
          <div className="p-4 text-center">
            <Search className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No matches for &ldquo;{query}&rdquo;</p>
            <button
              onClick={() => setQuery("")}
              className="mt-2 text-[11px] text-primary hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="p-2">
            {Object.entries(groupSessionsByTime(filteredSessions)).map(
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
                          "group/session px-2 py-2 rounded-lg cursor-pointer transition-colors",
                          disabled
                            ? "cursor-not-allowed opacity-50"
                          : session.key === currentSessionKey
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/80"
                        )}
                        onClick={() => {
                          if (disabled) return;
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
                          {primarySessionKey === session.key && (
                            <span title="Primary session"><Pin className="w-2.5 h-2.5 text-primary shrink-0" /></span>
                          )}
                          {onSetPrimary && primarySessionKey !== session.key && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onSetPrimary(session.key); }}
                              className="shrink-0 opacity-0 group-hover/session:opacity-100 transition-opacity px-1 py-0.5 rounded text-[9px] text-muted-foreground hover:text-primary hover:bg-primary/10"
                            >
                              <Pin className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {onArchiveSession && session.key.startsWith("agent:") && (
                            <button
                              type="button"
                              title="Archive session"
                              aria-label="Archive session"
                              disabled={disabled || Boolean(archivingKey)}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleArchiveSession(session.key);
                              }}
                              className="shrink-0 opacity-0 group-hover/session:opacity-100 transition-opacity px-1 py-0.5 rounded text-[9px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                            >
                              <Archive className="w-2.5 h-2.5" />
                            </button>
                          )}
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const onFetchSessionsRef = useRef(onFetchSessions);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    onFetchSessionsRef.current = onFetchSessions;
  }, [onFetchSessions]);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      onFetchSessionsRef.current();
    }
  }, [isOpen, updatePosition]);

  return (
    <div className="relative h-6 w-6 inline-block">
      <HyperchoTooltip value="Chat History">
        <Button
          ref={btnRef}
          variant="ghost"
          size="iconSm"
          onClick={() => setIsOpen(!isOpen)}
        >
          <History className="w-4 h-4" />
        </Button>
      </HyperchoTooltip>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60]"
                  onClick={() => setIsOpen(false)}
                />
              )}
            </AnimatePresence>

            {/* Dropdown */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="fixed w-80 z-[70]"
                  style={{ top: pos.top, right: pos.right }}
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
          </>,
          document.body
        )}
    </div>
  );
};

export default SessionHistoryDropdown;
