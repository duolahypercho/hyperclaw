"use client";

import React, { memo, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CopanionIcon from "@OS/assets/copanion";
import type { GatewayChatMessage } from "@OS/AI/core/hook/use-gateway-chat";
import { AnimatedThinkingText } from "@OS/AI/components/Chat";
import { createMergeToolCalls } from "@OS/AI/utils/mergeToolCalls";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import {
  EnhancedMessageBubble,
  shouldShowAvatarLocal,
} from "$/components/Home/widgets/gateway-chat/EnhancedMessageBubble";
import { GroupedToolActions } from "$/components/Home/widgets/gateway-chat/GroupedToolActions";
import { setupToolRenderers } from "@OS/AI/components/tool-renderers/setup";

// Ensure tool renderers are registered even when rendered outside OSProvider
// (e.g. voice overlay). Safe to call multiple times — overwrites same entries.
setupToolRenderers();

// ── Main CompactChatView ──────────────────────────────────────────────
interface CompactChatViewProps {
  messages: GatewayChatMessage[];
  isLoading: boolean;
  maxHeight?: number;
  minHeight?: number;
  actionChips?: Array<{ label: string; onClick: () => void }>;
  /** Avatar info for the assistant — same shape as GatewayChatWidget */
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
  /** Avatar info for the user */
  userAvatar?: { src?: string; fallback: string; alt?: string };
  /** Bot profile picture URL (passed to EnhancedMessageBubble) */
  botPic?: string;
}

export const CompactChatView = memo(({
  messages,
  isLoading,
  maxHeight = 300,
  minHeight,
  actionChips,
  assistantAvatar,
  userAvatar,
  botPic,
}: CompactChatViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const chainBreakerCacheRef = useRef<Map<string, GatewayChatMessage>>(new Map());

  // Per-instance merge function (avoids cross-widget cache thrashing)
  const mergeToolCalls = useMemo(() => createMergeToolCalls(), []);
  const mergedMessages = useMemo(() => mergeToolCalls(messages), [mergeToolCalls, messages]);

  // Unified tool state — same as GatewayChatWidget
  const { toolStates, toggleToolExpansion } = useUnifiedToolState(messages as any);

  // true when user has scrolled away from the bottom during generation
  const userScrolledAwayRef = useRef(false);

  // Auto-scroll only on initial load and when the user sends a message.
  // Do NOT auto-scroll during streaming or when assistant messages arrive.
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const prevLen = prevLenRef.current;

    if (messages.length <= prevLen) {
      prevLenRef.current = messages.length;
      // Streaming delta — do not auto-scroll.
      return;
    }

    // Bulk history load: previous was 0 or empty, now has many messages.
    if (prevLen === 0 && messages.length > 1) {
      prevLenRef.current = messages.length;
      userScrolledAwayRef.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }));
      return;
    }

    const newMsg = messages[messages.length - 1];
    if (newMsg?.role === "user") {
      // User just sent — always scroll and reset flag.
      userScrolledAwayRef.current = false;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
    // Do not auto-scroll for assistant messages or other new messages.
    prevLenRef.current = messages.length;
  }, [messages.length, messages]);

  // Auto-scroll when content changes (e.g. tool actions expand/collapse).
  // MutationObserver catches DOM changes from Radix Collapsible that don't
  // trigger React state changes in this component.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      // Only auto-scroll on DOM changes if user hasn't scrolled away
      if (userScrolledAwayRef.current) return;
      const nearBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 100;
      if (nearBottom) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  // Avatar callback
  const shouldShowAvatarCallback = useCallback(
    (index: number) => shouldShowAvatarLocal(mergedMessages, index),
    [mergedMessages]
  );

  // Copy & reply handlers
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    const text = message.content || "";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      });
    }
  }, []);

  const handleReply = useCallback((_message: GatewayChatMessage) => {
    // No-op in compact view — reply not supported in overlay
  }, []);

  const nodes = useMemo(() => {
    const result: React.ReactNode[] = [];

    const msgHasToolCalls = (m: GatewayChatMessage) =>
      m.role === "assistant" &&
      ((m as any).toolCalls?.length > 0 ||
        (m as any).contentBlocks?.some((b: any) => b.type === "toolCall"));

    for (let index = 0; index < mergedMessages.length; index++) {
      const message = mergedMessages[index];
      const isToolMessage = msgHasToolCalls(message);

      // Deduplicate consecutive identical assistant text
      if (
        !isToolMessage &&
        message.role === "assistant" &&
        message.content?.trim() &&
        index > 0
      ) {
        const prev = mergedMessages[index - 1];
        if (
          prev.role === "assistant" &&
          prev.content?.trim() === message.content.trim()
        ) {
          continue;
        }
      }

      // Group consecutive tool messages — same logic as GatewayChatWidget
      if (isToolMessage) {
        const toolMessages: GatewayChatMessage[] = [];
        let j = index;
        let chainBreakerContent: string | null = null;
        let chainBreakerKey: string = "";

        while (j < mergedMessages.length) {
          const m = mergedMessages[j];
          if (!msgHasToolCalls(m)) break;
          toolMessages.push(m);
          j++;
          if (m.content?.trim()) {
            chainBreakerContent = m.content;
            chainBreakerKey = m.id || `chain-${j}`;
            break;
          }
        }

        if (toolMessages.length >= 1) {
          result.push(
            <GroupedToolActions
              key={`tool-actions-${index}`}
              toolMessages={toolMessages}
              toolStates={toolStates}
              toggleToolExpansion={toggleToolExpansion}
              showAvatar={shouldShowAvatarCallback(index)}
              assistantAvatar={assistantAvatar}
            />
          );

          // Show chain-breaker text
          if (chainBreakerContent) {
            const cacheKey = `chain-${chainBreakerKey}`;
            let textOnly = chainBreakerCacheRef.current.get(cacheKey);
            if (!textOnly || textOnly.content !== chainBreakerContent) {
              textOnly = {
                id: chainBreakerKey,
                role: "assistant",
                content: chainBreakerContent,
                timestamp: 0,
              };
              chainBreakerCacheRef.current.set(cacheKey, textOnly);
            }
            result.push(
              <EnhancedMessageBubble
                key={`tool-text-${index}-${chainBreakerKey}`}
                message={textOnly}
                isUser={false}
                showAvatar={false}
                onCopy={handleCopy}
                onReply={handleReply}
                isLoading={false}
                botPic={botPic}
                userPic={userAvatar}
                assistantAvatar={assistantAvatar}
              />
            );
          }

          index = j - 1;
          continue;
        }
      }

      // Regular message — use EnhancedMessageBubble (same as GatewayChatWidget)
      result.push(
        <EnhancedMessageBubble
          key={message.id || index}
          message={message}
          isUser={message.role === "user"}
          showAvatar={shouldShowAvatarCallback(index)}
          onCopy={handleCopy}
          onReply={handleReply}
          isLoading={
            isLoading &&
            index === mergedMessages.length - 1 &&
            message.role === "assistant" &&
            !message.content.trim()
          }
          botPic={botPic}
          userPic={userAvatar}
          assistantAvatar={assistantAvatar}
        />
      );
    }

    // Thinking indicator — same as GatewayChatWidget
    if (isLoading) {
      const lastMsg = mergedMessages[mergedMessages.length - 1];
      const lastIsEmptyAssistant =
        lastMsg?.role === "assistant" &&
        !lastMsg.content?.trim() &&
        !(lastMsg as any).toolCalls?.length;
      const lastIsStreamingText =
        lastMsg?.role === "assistant" &&
        lastMsg.content?.trim() &&
        !(lastMsg as any).toolCalls?.length;

      if (!lastIsEmptyAssistant && !lastIsStreamingText) {
        const lastUserIdx = mergedMessages.reduce(
          (acc, m, i) => (m.role === "user" ? i : acc),
          -1
        );
        const currentTurn =
          lastUserIdx >= 0
            ? mergedMessages.slice(lastUserIdx + 1)
            : mergedMessages;
        const toolCallCount = currentTurn.filter(
          (m) =>
            m.role === "assistant" && (m as any).toolCalls?.length > 0
        ).length;

        let thinkingText = "AI is thinking";
        if (toolCallCount > 0) {
          thinkingText = `Executed ${toolCallCount} action${toolCallCount > 1 ? "s" : ""} — working`;
        }

        result.push(
          <div key="thinking-indicator" className="flex gap-3 justify-start">
            <div className="w-8 h-8 flex-shrink-0">
              <Avatar className="w-8 h-8">
                {assistantAvatar?.src ? (
                  <AvatarImage
                    src={assistantAvatar.src}
                    alt={assistantAvatar.alt}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary">
                  {assistantAvatar?.fallback ? (
                    <span className="text-xs">
                      {assistantAvatar.fallback}
                    </span>
                  ) : (
                    <CopanionIcon className="w-4 h-4" />
                  )}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex items-center px-3 py-1.5">
              <AnimatedThinkingText text={thinkingText} />
            </div>
          </div>
        );
      }
    }

    return result;
  }, [
    mergedMessages,
    toolStates,
    toggleToolExpansion,
    isLoading,
    botPic,
    userAvatar,
    assistantAvatar,
    shouldShowAvatarCallback,
    handleCopy,
    handleReply,
  ]);

  const isEmpty = messages.length === 0 && !isLoading;

  if (isEmpty && minHeight == null) return null;

  return (
    <div className="flex flex-col">
      <div
        ref={scrollRef}
        className="overflow-y-auto overflow-x-hidden space-y-2 p-4 min-w-0 customScrollbar2"
        style={{ maxHeight: `${maxHeight}px`, ...(minHeight != null && { minHeight: `${minHeight}px` }), overscrollBehavior: "contain" }}
        onScroll={() => {
          if (!scrollRef.current) return;
          const el = scrollRef.current;
          userScrolledAwayRef.current = el.scrollHeight - el.scrollTop > el.clientHeight + 10;
        }}
      >
        {nodes}
      </div>

      {/* Quick action chips */}
      <AnimatePresence>
        {actionChips && actionChips.length > 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15, delay: 0.1 }}
            className="flex items-center gap-1.5 px-4 pb-2 flex-wrap"
          >
            {actionChips.map((chip) => (
              <button
                key={chip.label}
                onClick={chip.onClick}
                className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

CompactChatView.displayName = "CompactChatView";
