"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
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
  toggleToolExpansion?: (messageId: string) => void;
  showAvatar: boolean;
  index: number;
  shouldShowAvatar: (index: number) => boolean;
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
}> = ({ toolMessages, toolStates, toggleToolExpansion, showAvatar, index, shouldShowAvatar, assistantAvatar }) => {
  // Use toolStates for accurate status — checking `result === undefined` on merged
  // messages is unreliable because phase:"update" events create toolResult messages
  // with content:"", which mergeToolCallsWithResults sets as result:"" (not undefined).
  const isToolCompleted = (msgId: string) => {
    const state = toolStates?.get(msgId);
    return state?.status === "completed" || state?.status === "rejected" || state?.status === "expired";
  };

  const hasExecutingTools = toolMessages.some((m) => !isToolCompleted(m.id || ""));

  // Start expanded — avoids collapsed→expanded flash when tools are streaming in
  const [groupOpen, setGroupOpen] = useState(true);
  // Track whether the user has manually re-opened the group after auto-collapse
  const userOpenedRef = useRef(false);

  // Auto-collapse when all tools are done, unless user has an individual tool expanded
  const allDone = !hasExecutingTools;
  const anyToolExpanded = toolMessages.some((m) => {
    const state = toolStates?.get(m.id || "");
    return state?.isExpanded;
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

  // Stable toggle callbacks per message ID — prevents new function refs on each render
  const toggleCallbacksRef = useRef<Map<string, () => void>>(new Map());
  const getToggleCallback = useCallback((msgId: string) => {
    let cb = toggleCallbacksRef.current.get(msgId);
    if (!cb) {
      cb = () => toggleToolExpansion?.(msgId);
      toggleCallbacksRef.current.set(msgId, cb);
    }
    return cb;
  }, [toggleToolExpansion]);

  // Count completed vs executing using toolStates
  const completedCount = toolMessages.filter((m) => isToolCompleted(m.id || "")).length;
  const executingCount = toolMessages.length - completedCount;

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
                  {toolMessages.length} action{toolMessages.length === 1 ? "" : "s"}
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
                  const msgId = toolMsg.id || "";
                  const state = toolStates?.get(msgId);

                  if (state && toggleToolExpansion) {
                    return (
                      <GenericToolMessage
                        key={msgId || msgIdx}
                        toolState={state}
                        message={toolMsg as any}
                        onToggleExpand={getToggleCallback(msgId)}
                        assistantAvatar={undefined}
                        botPic={undefined}
                        showAvatar={false}
                      />
                    );
                  }

                  // Fallback: render tool info directly from message data
                  const tc = toolMsg.toolCalls?.[0];
                  const toolName = tc?.function?.name || tc?.name || "action";
                  const toolArgs = tc?.function?.arguments || tc?.arguments || "";
                  // Check merged result from mergeToolCallsWithResults
                  const mergedResult = (tc as any)?.result as string | undefined;
                  const mergedIsError = (tc as any)?.isError as boolean | undefined;

                  return (
                    <ToolCallFallback
                      key={msgId || `tool-fallback-${msgIdx}`}
                      toolName={toolName}
                      toolArgs={toolArgs}
                      result={mergedResult}
                      isError={mergedIsError}
                    />
                  );
                })}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </div>
    </Collapsible.Root>
  );
};
