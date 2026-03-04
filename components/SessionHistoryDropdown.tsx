"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, MessageSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import HyperchoTooltip from "$/components/UI/HyperchoTooltip";

interface SessionItem {
  key: string;
  label?: string;
  createdAt?: number;
  updatedAt?: number;
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

export const SessionHistoryDropdown: React.FC<SessionHistoryDropdownProps> = ({
  sessions,
  isLoading,
  onLoadSession,
  onNewChat,
  onFetchSessions,
  currentSessionKey,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      onFetchSessions();
    }
  }, [isOpen]);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else if (diffInHours < 48) {
      return "1d";
    } else if (diffInHours < 168) {
      return `${Math.floor(diffInHours / 24)}d`;
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const getTimeGroup = (timestamp?: number) => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return "Today";
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else if (diffInHours < 168) {
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const groupSessionsByTime = (sessions: SessionItem[]) => {
    const groups: { [key: string]: SessionItem[] } = {};

    sessions.forEach((session) => {
      const group = getTimeGroup(session.updatedAt);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(session);
    });

    return groups;
  };

  // Extract a readable name from the session key
  const getSessionName = (session: SessionItem) => {
    // Session key format: agent:{agentId}:web:dm:{unique}
    const parts = session.key.split(":");
    const name = parts.slice(3).join(":") || session.key;
    return name;
  };

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
                <div className="p-3 border-b border-border/50 flex items-center justify-between">
                  <h3 className="font-medium text-xs">Recent Sessions</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      onNewChat();
                      setIsOpen(false);
                    }}
                  >
                    + New Chat
                  </Button>
                </div>

                <div className="max-h-80 overflow-y-auto customScrollbar2">
                  {isLoading ? (
                    <div className="p-4 text-center">
                      <div className="animate-pulse">
                        <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-2"></div>
                        <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
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
                      <p className="text-xs text-muted-foreground mt-1">
                        {error}
                      </p>
                      <button
                        onClick={() => {
                          onFetchSessions();
                        }}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="p-4 text-center">
                      <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">
                        No sessions yet
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Start a new chat to see it here
                      </p>
                    </div>
                  ) : (
                    <div className="p-2">
                      {Object.entries(
                        groupSessionsByTime(sessions)
                      ).map(([timeGroup, groupSessions]) => (
                        <div key={timeGroup} className="mb-3">
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                            {timeGroup}
                          </h4>
                          {groupSessions.map((session) => (
                            <motion.div
                              key={session.key}
                              whileTap={{ scale: 0.98 }}
                              className={`p-2 rounded-lg hover:bg-muted/80 cursor-pointer transition-colors ${
                                session.key === currentSessionKey
                                  ? "bg-muted"
                                  : ""
                              }`}
                              onClick={() => {
                                onLoadSession(session.key);
                                setIsOpen(false);
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  <p className="text-xs font-medium flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
                                    {session.label || getSessionName(session) ||
                                      "Untitled Session"}
                                  </p>
                                </div>
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {formatDate(session.updatedAt)}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
