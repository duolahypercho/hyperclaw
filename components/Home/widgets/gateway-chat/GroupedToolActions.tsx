"use client";

import React, { useState, useCallback, useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CopanionIcon from "@OS/assets/copanion";
import * as Collapsible from "@radix-ui/react-collapsible";
import { RefreshCw, ChevronRight } from "lucide-react";
import { GenericToolMessage } from "@OS/AI/components/GenericToolMessage";
import { UnifiedToolState } from "@OS/AI/components/ToolRegistry";
import { ToolCallFallback } from "./ToolCallFallback";

export const GroupedToolActions: React.FC<{
  toolMessages: GatewayChatMessage[];
  toolStates?: Map<string, UnifiedToolState>;
  toggleToolExpansion?: (toolCallId: string) => void;
  showAvatar: boolean;
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
}> = memo(({ toolMessages, toolStates, toggleToolExpansion, showAvatar, assistantAvatar }) => {
  // Check completion by looking up each toolCallId in the states map (not message ID).
  // A message is "completed" when ALL its tool calls are in a terminal state.
  const isMessageCompleted = (msg: GatewayChatMessage) => {
    const tcs = (msg as any).toolCalls || [];
    if (tcs.length === 0) return true;
    return tcs.every((tc: any) => {
      const tcId = tc.id || tc.function?.name || "";
      const state = toolStates?.get(tcId);
      return state?.status === "completed" || state?.status === "rejected" || state?.status === "expired";
    });
  };

  const hasExecutingTools = toolMessages.some((m) => !isMessageCompleted(m));

  // Start expanded — avoids collapsed→expanded flash when tools are streaming in
  const [groupOpen, setGroupOpen] = useState(true);
  // Track whether the user has manually re-opened the group after auto-collapse
  const userOpenedRef = useRef(false);

  // Auto-collapse when all tools are done, unless user has an individual tool expanded
  const allDone = !hasExecutingTools;
  const anyToolExpanded = toolMessages.some((m) => {
    const tcs = (m as any).toolCalls || [];
    return tcs.some((tc: any) => {
      const tcId = tc.id || tc.function?.name || "";
      const state = toolStates?.get(tcId);
      return state?.isExpanded;
    });
  });

  useEffect(() => {
    if (allDone && !anyToolExpanded && !userOpenedRef.current) {
      setGroupOpen(false);
    }
  }, [allDone, anyToolExpanded]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) userOpenedRef.current = true;
    setGroupOpen(open);
  }, []);

  // Stable toggle callbacks per toolCallId — prevents new function refs on each render
  const toggleCallbacksRef = useRef<Map<string, () => void>>(new Map());
  const getToggleCallback = useCallback((tcId: string) => {
    let cb = toggleCallbacksRef.current.get(tcId);
    if (!cb) {
      cb = () => toggleToolExpansion?.(tcId);
      toggleCallbacksRef.current.set(tcId, cb);
    }
    return cb;
  }, [toggleToolExpansion]);

  // Count total tool calls across all messages (a single message can have multiple)
  const totalToolCalls = toolMessages.reduce((sum, m) => sum + ((m as any).toolCalls?.length || 1), 0);
  const completedToolCalls = toolMessages.reduce((sum, m) => {
    const tcs = (m as any).toolCalls || [];
    return sum + tcs.filter((tc: any) => {
      const tcId = tc.id || tc.function?.name || "";
      const state = toolStates?.get(tcId);
      return state?.status === "completed" || state?.status === "rejected" || state?.status === "expired";
    }).length;
  }, 0);
  const executingCount = totalToolCalls - completedToolCalls;

  return (
    <Collapsible.Root
      open={groupOpen}
      onOpenChange={handleOpenChange}
    >
      <div className="flex gap-3 justify-start">
        {/* Avatar */}
        <div className="w-8 h-8 flex-shrink-0">
          {showAvatar ? (
            <Avatar className="w-8 h-8">
              {assistantAvatar?.src ? (
                <AvatarImage src={assistantAvatar.src} alt={assistantAvatar.alt} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                {assistantAvatar?.fallback
                  ? <span className="text-xs">{assistantAvatar.fallback}</span>
                  : <CopanionIcon className="w-4 h-4" />}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8 h-8 flex-shrink-0" />
          )}
        </div>

        <div className="relative flex flex-col max-w-full min-w-0 justify-start items-start">
          {/* Group Header Button */}
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className={cn(
                "py-1.5 px-3 relative w-fit transition-all duration-300 select-none rounded-lg border",
                hasExecutingTools
                  ? "border-primary/40 text-foreground/80"
                  : "border-border/50 text-muted-foreground hover:text-foreground/80 hover:border-primary/50"
              )}
              style={{
                borderTopRightRadius: "10px",
                borderBottomRightRadius: "10px",
                borderTopLeftRadius: "0px",
                borderBottomLeftRadius: "10px",
              }}
            >
              <div className="flex items-center gap-2">
                {hasExecutingTools && (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                    <RefreshCw className="w-3 h-3 text-primary" />
                  </motion.div>
                )}
                <span className="text-xs font-medium">
                  {totalToolCalls} action{totalToolCalls === 1 ? "" : "s"}
                </span>
                {executingCount > 0 && (
                  <span className="text-[10px] text-primary">
                    {executingCount} running
                  </span>
                )}
                <motion.div
                  animate={{ rotate: groupOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="w-3 h-3" />
                </motion.div>
              </div>
            </button>
          </Collapsible.Trigger>

          {/* Expanded Content */}
          <Collapsible.Content>
            <div className="overflow-x-auto overflow-y-hidden">
              <div className="mt-2 space-y-2">
                {toolMessages.map((toolMsg, msgIdx) => {
                  // Render each tool call individually, keyed by toolCallId
                  const allToolCalls = (toolMsg as any).toolCalls || [];
                  const msgId = toolMsg.id || "";

                  return (
                    <React.Fragment key={msgId || `tool-${msgIdx}`}>
                      {allToolCalls.map((tc: any, tcIdx: number) => {
                        const tcId = tc.id || tc.function?.name || "";
                        const state = toolStates?.get(tcId);

                        if (state && toggleToolExpansion) {
                          return (
                            <GenericToolMessage
                              key={tcId || `${msgId}-tc-${tcIdx}`}
                              toolState={state}
                              message={toolMsg as any}
                              onToggleExpand={getToggleCallback(tcId)}
                              assistantAvatar={undefined}
                              botPic={undefined}
                              showAvatar={false}
                            />
                          );
                        }

                        // Fallback: render from merged message data
                        const toolName = tc?.function?.name || tc?.name || "action";
                        const toolArgs = tc?.function?.arguments || tc?.arguments || "";
                        const mergedResult = tc?.result as string | undefined;
                        const mergedIsError = tc?.isError as boolean | undefined;
                        return (
                          <ToolCallFallback
                            key={tcId || `${msgId}-tc-${tcIdx}`}
                            toolName={toolName}
                            toolArgs={toolArgs}
                            result={mergedResult}
                            isError={mergedIsError}
                          />
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </div>
    </Collapsible.Root>
  );
}, (prev, next) => {
  // Shallow-compare arrays by length + item identity
  if (prev.toolMessages.length !== next.toolMessages.length) return false;
  for (let i = 0; i < prev.toolMessages.length; i++) {
    if (prev.toolMessages[i] !== next.toolMessages[i]) return false;
  }
  if (prev.toolStates !== next.toolStates) return false;
  if (prev.showAvatar !== next.showAvatar) return false;
  if (prev.toggleToolExpansion !== next.toggleToolExpansion) return false;
  return true;
});
