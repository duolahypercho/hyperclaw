"use client";

import React, { useState, useCallback, useEffect, useRef, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, ChevronRight, Check, RefreshCw, Reply, Paperclip } from "lucide-react";
import { X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  useGatewayChat,
  GatewayChatMessage,
  GatewayChatAttachment,
} from "@OS/AI/core/hook/use-gateway-chat";
import { useUser } from "$/Providers/UserProv";
import { useOpenClawContext } from "$/Providers/OpenClawProv";
import ReactMarkdown, { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { getMediaUrl } from "$/utils";
import { gatewayConnection } from "$/lib/openclaw-gateway-ws";
import {
  AnimatedThinkingText,
  ChatLoadingSkeleton,
} from "@OS/AI/components/Chat";
import type { AttachmentType } from "@OS/AI/components/Chat";
import { InputContainer } from "@OS/AI/components/InputContainer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as Collapsible from "@radix-ui/react-collapsible";
import createMarkdownComponents from "@OS/AI/components/createMarkdownComponents";
import CopanionIcon from "@OS/assets/copanion";
import {
  useAgentIdentity,
  resolveAvatarUrl,
  isAvatarText,
} from "$/hooks/useAgentIdentity";
import { PanelRight, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingChatOS } from "@OS/Provider/OSProv";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { useUnifiedToolState } from "@OS/AI/components/hooks/useUnifiedToolState";
import { GenericToolMessage } from "@OS/AI/components/GenericToolMessage";
import { UnifiedToolState } from "@OS/AI/components/ToolRegistry";

// Module-level guard: tracks which task IDs have already had auto-send fired.
// Survives component unmount/remount (e.g. toggling the floating chat) so we
// don't re-send the task context message every time the chat is reopened.
const autoSendFiredTasks = new Set<string>();

// Memoized ReactMarkdown
const MemoizedReactMarkdown: React.FC<Options> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.components === nextProps.components
);

const memoizedMarkdownComponents = {
  user: createMarkdownComponents(true),
  assistant: createMarkdownComponents(false),
};

function shouldShowAvatarLocal(messages: GatewayChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prevMsg = messages[index - 1];
  const currMsg = messages[index];
  if (!prevMsg || !currMsg) return true;
  return prevMsg.role !== currMsg.role;
}

// ── Detect error from result content JSON ─────────────────────────────
function isResultContentError(content: string | undefined): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed?.status === "error" || parsed?.status === "failed";
  } catch {
    return false;
  }
}

// ── Merge tool calls with their results ───────────────────────────────
function mergeToolCallsWithResults(messages: GatewayChatMessage[]): GatewayChatMessage[] {
  const merged: GatewayChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if ((msg.role as string) === "toolResult" || msg.role === "tool") continue;

    const hasToolCalls =
      (msg.toolCalls?.length || 0) > 0 ||
      (msg.contentBlocks?.some((b: any) => b.type === "toolCall") || false);

    if (msg.role === "assistant" && hasToolCalls) {
      const toolCalls = msg.toolCalls || [];

      const mergedToolCalls = toolCalls.map((tc) => {
        const toolId = tc.id || tc.function?.name || "";
        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId = (m as any).toolCallId || (m as any).toolResults?.[0]?.toolCallId;
          return msgToolCallId === toolId;
        });

        const resultContent = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.content || (toolResultMsg as any).content)
          : undefined;
        const resultIsError = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.isError || (toolResultMsg as any).isError || isResultContentError(resultContent) || false)
          : false;

        return { ...tc, result: resultContent, isError: resultIsError };
      });

      const contentBlocks = msg.contentBlocks?.filter((b: any) => b.type === "toolCall") || [];
      const mergedContentBlocks = contentBlocks.map((block: any) => {
        const toolId = block.id;
        const toolResultMsg = messages.find((m) => {
          const role = m.role as string;
          if (role !== "tool" && role !== "toolResult") return false;
          const msgToolCallId = (m as any).toolCallId || (m as any).toolResults?.[0]?.toolCallId;
          return msgToolCallId === toolId;
        });
        const blockResultContent = toolResultMsg
          ? ((toolResultMsg as any).toolResults?.[0]?.content || (toolResultMsg as any).content)
          : undefined;
        return {
          ...block,
          result: blockResultContent,
          isError: toolResultMsg
            ? ((toolResultMsg as any).toolResults?.[0]?.isError || (toolResultMsg as any).isError || isResultContentError(blockResultContent) || false)
            : false,
        };
      });

      merged.push({
        ...msg,
        toolCalls: mergedToolCalls as any,
        contentBlocks: [
          ...(msg.contentBlocks?.filter((b: any) => b.type !== "toolCall") || []),
          ...mergedContentBlocks,
        ],
      } as GatewayChatMessage);
    } else {
      merged.push(msg);
    }
  }

  return merged;
}

// ── Compact ToolCallFallback ──────────────────────────────────────────
const ToolCallFallback: React.FC<{
  toolName: string;
  toolArgs: string;
  result?: string;
  isError?: boolean;
}> = memo(({ toolName, toolArgs, result, isError }) => {
  const [expanded, setExpanded] = useState(false);

  const argsSummary = useMemo(() => {
    try {
      const parsed = JSON.parse(toolArgs);
      if (typeof parsed === "object" && parsed !== null) {
        const entries = Object.entries(parsed);
        if (entries.length === 0) return "";
        const [, val] = entries[0];
        const str = typeof val === "string" ? val : JSON.stringify(val);
        return str.length > 60 ? str.slice(0, 60) + "..." : str;
      }
    } catch {}
    return toolArgs.length > 60 ? toolArgs.slice(0, 60) + "..." : toolArgs;
  }, [toolArgs]);

  const hasResult = result !== undefined && result !== "";
  const statusIcon = hasResult
    ? isError
      ? <XIcon className="w-3 h-3 text-red-500" />
      : <Check className="w-3 h-3 text-green-600" />
    : (
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
        <RefreshCw className="w-3 h-3 text-primary" />
      </motion.div>
    );

  return (
    <motion.div
      className={cn(
        "py-1 px-2.5 relative w-full max-w-full transition-all duration-300 select-text rounded-lg border text-xs",
        isError ? "border-red-500/40 bg-red-500/5" : "border-border/50 bg-muted/40",
        "hover:border-primary/50"
      )}
      style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: "10px", borderTopRightRadius: "10px", borderBottomRightRadius: "10px" }}
    >
      <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        {statusIcon}
        <span className="font-medium text-muted-foreground">
          {toolName}
          {hasResult ? (isError ? " failed" : " completed") : " executing..."}
        </span>
        {argsSummary && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[140px]">
            {argsSummary}
          </span>
        )}
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </motion.div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-1.5">
              {toolArgs && toolArgs !== "{}" && (
                <div className="p-1.5 bg-primary/5 rounded text-[11px] font-mono border border-border/30 overflow-hidden">
                  <div className="text-muted-foreground mb-0.5">Arguments:</div>
                  <pre className="whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto">{toolArgs}</pre>
                </div>
              )}
              {hasResult && (
                <div className={cn(
                  "p-1.5 rounded text-[11px] border overflow-hidden",
                  isError ? "bg-red-500/10 border-red-500/40" : "bg-muted/50 border-border/50"
                )}>
                  <div className="text-muted-foreground mb-0.5">Result:</div>
                  <pre className="whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto">{result}</pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}, (prev, next) =>
  prev.toolName === next.toolName &&
  prev.toolArgs === next.toolArgs &&
  prev.result === next.result &&
  prev.isError === next.isError
);

// ── Grouped Tool Actions ──────────────────────────────────────────────
const GroupedToolActions: React.FC<{
  toolMessages: GatewayChatMessage[];
  toolStates?: Map<string, UnifiedToolState>;
  toggleToolExpansion?: (messageId: string) => void;
  showAvatar: boolean;
  assistantAvatar?: { src?: string; fallback: string; alt?: string };
}> = ({ toolMessages, toolStates, toggleToolExpansion, showAvatar, assistantAvatar }) => {
  const getToolCallId = (msg: GatewayChatMessage) => {
    const tc = msg.toolCalls?.[0];
    return tc?.id || tc?.function?.name || msg.id || "";
  };

  const isToolCompleted = (msg: GatewayChatMessage) => {
    const state = toolStates?.get(getToolCallId(msg));
    return state?.status === "completed" || state?.status === "rejected" || state?.status === "expired";
  };

  const hasExecutingTools = toolMessages.some((m) => !isToolCompleted(m));

  const [groupOpen, setGroupOpen] = useState(true);
  const userOpenedRef = useRef(false);

  const allDone = !hasExecutingTools;
  const anyToolExpanded = toolMessages.some((m) => {
    const state = toolStates?.get(getToolCallId(m));
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

  const toggleCallbacksRef = useRef<Map<string, () => void>>(new Map());
  const getToggleCallback = useCallback((msgId: string) => {
    let cb = toggleCallbacksRef.current.get(msgId);
    if (!cb) {
      cb = () => toggleToolExpansion?.(msgId);
      toggleCallbacksRef.current.set(msgId, cb);
    }
    return cb;
  }, [toggleToolExpansion]);

  const executingCount = toolMessages.length - toolMessages.filter((m) => isToolCompleted(m)).length;

  return (
    <Collapsible.Root open={groupOpen} onOpenChange={handleOpenChange}>
      <div className="flex gap-2 justify-start">
        <div className="w-6 h-6 flex-shrink-0">
          {showAvatar ? (
            <Avatar className="w-6 h-6">
              {assistantAvatar?.src ? (
                <AvatarImage src={assistantAvatar.src} alt={assistantAvatar.alt} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-[8px]">
                {assistantAvatar?.fallback
                  ? <span>{assistantAvatar.fallback}</span>
                  : <CopanionIcon className="w-3 h-3" />}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-6 h-6 flex-shrink-0" />
          )}
        </div>

        <div className="relative flex flex-col max-w-full min-w-0 justify-start items-start">
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className={cn(
                "py-1 px-2.5 relative w-fit transition-all duration-300 select-none rounded-lg border text-xs",
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
              <div className="flex items-center gap-1.5">
                {hasExecutingTools && (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                    <RefreshCw className="w-3 h-3 text-primary" />
                  </motion.div>
                )}
                <span className="font-medium">
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

          <Collapsible.Content>
            <div className="overflow-x-auto overflow-y-hidden">
              <div className="mt-1.5 space-y-1.5">
                {toolMessages.map((toolMsg, msgIdx) => {
                  const tcId = getToolCallId(toolMsg);
                  const state = toolStates?.get(tcId);

                  if (state && toggleToolExpansion) {
                    return (
                      <GenericToolMessage
                        key={tcId || msgIdx}
                        toolState={state}
                        message={toolMsg as any}
                        onToggleExpand={getToggleCallback(tcId)}
                        assistantAvatar={undefined}
                        botPic={undefined}
                        showAvatar={false}
                      />
                    );
                  }

                  const tc = toolMsg.toolCalls?.[0];
                  const toolName = tc?.function?.name || tc?.name || "action";
                  const toolArgs = tc?.function?.arguments || tc?.arguments || "";
                  const mergedResult = (tc as any)?.result as string | undefined;
                  const mergedIsError = (tc as any)?.isError as boolean | undefined;

                  return (
                    <ToolCallFallback
                      key={tcId || `tool-fallback-${msgIdx}`}
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

// ── Message Bubble ────────────────────────────────────────────────────
const MessageBubble = memo(
  ({
    message,
    isUser,
    showAvatar = true,
    isLoading = false,
    botPic,
    userPic,
    assistantAvatar,
    toolStates,
    toggleToolExpansion,
    onCopy,
    onReply,
  }: {
    message: GatewayChatMessage;
    isUser: boolean;
    showAvatar?: boolean;
    isLoading?: boolean;
    botPic?: string;
    userPic?: { src?: string; fallback: string; alt?: string };
    assistantAvatar?: { src?: string; fallback: string; alt?: string };
    toolStates?: Map<string, UnifiedToolState>;
    toggleToolExpansion?: (messageId: string) => void;
    onCopy?: (message: GatewayChatMessage) => void;
    onReply?: (message: GatewayChatMessage) => void;
  }) => {
    if (message.role === "system" || message.role === "tool") return null;

    // Handle tool calls — render tool element, optionally alongside text
    let toolCallElement: React.ReactNode = null;
    if (message.role === "assistant" && (message as any).toolCalls?.length > 0) {
      const tc0 = (message as any).toolCalls?.[0];
      const toolCallId = tc0?.id || tc0?.function?.name || message.id || "";
      const toolState = toolStates?.get(toolCallId);
      const hasTextForTool = !!message.content?.trim();

      if (toolState && toggleToolExpansion) {
        toolCallElement = (
          <GenericToolMessage
            toolState={toolState}
            message={message as any}
            onToggleExpand={() => toggleToolExpansion(toolCallId)}
            assistantAvatar={assistantAvatar}
            botPic={botPic}
            showAvatar={showAvatar && !hasTextForTool}
          />
        );
      } else {
        const tc = (message as any).toolCalls?.[0];
        const toolName = tc?.function?.name || tc?.name || "action";
        const toolArgs = tc?.function?.arguments || tc?.arguments || "";
        const mergedResult = (tc as any)?.result as string | undefined;
        const mergedIsError = (tc as any)?.isError as boolean | undefined;
        toolCallElement = (
          <div className="flex gap-2 justify-start min-w-0 max-w-full">
            <div className="w-6 h-6 flex-shrink-0">
              {showAvatar && !hasTextForTool ? (
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="bg-primary/10 text-primary text-[8px]">
                    {assistantAvatar?.fallback
                      ? <span>{assistantAvatar.fallback}</span>
                      : <CopanionIcon className="w-3 h-3" />}
                  </AvatarFallback>
                </Avatar>
              ) : <div className="w-6 h-6" />}
            </div>
            <div className="relative flex flex-col min-w-0 overflow-hidden flex-1">
              <ToolCallFallback
                toolName={toolName}
                toolArgs={toolArgs}
                result={mergedResult}
                isError={mergedIsError}
              />
            </div>
          </div>
        );
      }

      if (!message.content?.trim()) {
        return toolCallElement;
      }
    }

    let content = message.content || "";

    // Strip system lines and timestamp prefixes from user messages
    if (isUser) {
      const lines = content.split("\n");
      const userLines: string[] = [];
      for (const line of lines) {
        if (/^\s*System:\s*\[/.test(line)) continue;
        const stripped = line.replace(/^\s*\[\w{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\w+\]\s*/, "");
        userLines.push(stripped);
      }
      content = userLines.join("\n").trim();
    }

    const hasTextContent = content.trim();
    const hasAttachments = isUser && message.attachments && message.attachments.length > 0;

    if (!hasTextContent && !hasAttachments && !isLoading && !toolCallElement) return null;

    // Handle content blocks (thinking, etc.)
    const contentBlocks = (message as any).contentBlocks;

    const renderContent = () => {
      if (isLoading && !message.content?.trim()) {
        return <AnimatedThinkingText />;
      }

      // Content blocks rendering
      if (contentBlocks && contentBlocks.length > 0) {
        return (
          <div className="space-y-1.5">
            {contentBlocks.map((block: any, idx: number) => {
              if (block.type === "thinking" && block.thinking) {
                return (
                  <Accordion key={`thinking-${idx}`} type="single" collapsible defaultValue="">
                    <AccordionItem value="thoughts" className="border-0">
                      <AccordionTrigger className="flex items-center gap-1.5 justify-start py-0 px-0 text-[11px] font-medium hover:no-underline [&>svg]:h-3 [&>svg]:w-3 [&>svg]:-rotate-90 [&[data-state=open]>svg]:rotate-0">
                        <span className="text-muted-foreground hover:text-foreground/80">
                          Thoughts
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="px-0 pb-0 pt-0">
                        <div className="p-2 bg-primary/5 rounded-lg border border-primary/20">
                          <div className="text-[10px] text-foreground/80 leading-relaxed prose prose-xs dark:prose-invert max-w-none [&_p]:text-[10px] [&_code]:text-[9px]">
                            <MemoizedReactMarkdown
                              components={memoizedMarkdownComponents.assistant}
                              remarkPlugins={[remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]}
                              rehypePlugins={[rehypeRaw]}
                            >
                              {block.thinking}
                            </MemoizedReactMarkdown>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                );
              }

              if (block.type === "toolResult") {
                return (
                  <div key={`toolresult-${idx}`} className={cn(
                    "p-1.5 rounded-md text-[11px] font-mono overflow-hidden max-w-full",
                    block.isError ? "bg-red-500/10 text-red-500" : "text-muted-foreground"
                  )}>
                    <pre className="whitespace-pre-wrap break-words overflow-x-auto max-h-[150px] overflow-y-auto">{block.content}</pre>
                  </div>
                );
              }

              if (block.type === "text" && block.text) {
                let blockText = block.text;
                if (isUser) {
                  blockText = blockText
                    .split("\n")
                    .filter((l: string) => !/^\s*System:\s*\[/.test(l))
                    .map((l: string) => l.replace(/^\s*\[\w{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\w+\]\s*/, ""))
                    .join("\n")
                    .trim();
                  if (!blockText) return null;
                }
                const processedContent = blockText.replace(/<(\w+)>/g, "@$1");
                return (
                  <MemoizedReactMarkdown
                    key={`text-${idx}`}
                    components={isUser ? memoizedMarkdownComponents.user : memoizedMarkdownComponents.assistant}
                    remarkPlugins={
                      isUser
                        ? [remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]
                        : [remarkGfm, [remarkMath, { singleDollarTextMath: false }]]
                    }
                    rehypePlugins={[rehypeRaw]}
                  >
                    {processedContent}
                  </MemoizedReactMarkdown>
                );
              }

              return null;
            })}
          </div>
        );
      }

      // Simple content fallback
      const processedContent = content.replace(/<(\w+)>/g, "@$1");
      return (
        <MemoizedReactMarkdown
          components={isUser ? memoizedMarkdownComponents.user : memoizedMarkdownComponents.assistant}
          remarkPlugins={
            isUser
              ? [remarkGfm, remarkBreaks, [remarkMath, { singleDollarTextMath: false }]]
              : [remarkGfm, [remarkMath, { singleDollarTextMath: false }]]
          }
          rehypePlugins={[rehypeRaw]}
        >
          {processedContent}
        </MemoizedReactMarkdown>
      );
    };

    const defaultIcon = isUser ? (
      <span className="text-[8px]">U</span>
    ) : (
      assistantAvatar?.fallback
        ? <span className="text-[8px]">{assistantAvatar.fallback}</span>
        : <CopanionIcon className="w-3 h-3" />
    );

    return (
      <>
        {(hasTextContent || hasAttachments || isLoading) && (
          <motion.div
            className={cn("flex gap-2 group", isUser ? "justify-end" : "justify-start")}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {!isUser && (
              <div className="w-6 h-6 flex-shrink-0 mt-0.5">
                {showAvatar ? (
                  <Avatar className="w-6 h-6">
                    {botPic ? (
                      <AvatarImage src={botPic.startsWith("http") || botPic.startsWith("data:") ? botPic : getMediaUrl(botPic)} />
                    ) : assistantAvatar?.src ? (
                      <AvatarImage src={assistantAvatar.src} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {defaultIcon}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-6 h-6 flex-shrink-0" />
                )}
              </div>
            )}

            <div
              className={cn(
                "relative flex flex-col max-w-[85%] min-w-0",
                isUser ? "justify-end items-end" : "justify-start items-start"
              )}
            >
              <div
                className={cn(
                  "py-1.5 px-2.5 relative w-full max-w-full overflow-hidden transition-all duration-200 select-text font-normal text-sm",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/50"
                )}
                style={{
                  borderTopRightRadius: isUser ? "0px" : "10px",
                  borderBottomRightRadius: "10px",
                  borderTopLeftRadius: isUser ? "10px" : "0px",
                  borderBottomLeftRadius: "10px",
                }}
              >
                {hasAttachments && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {message.attachments!.map((att) => (
                      <img
                        key={att.id}
                        src={att.dataUrl}
                        alt={att.name}
                        className="max-w-[160px] max-h-[120px] rounded-md object-contain"
                      />
                    ))}
                  </div>
                )}
                {renderContent()}
              </div>

              {/* Hover actions */}
              {message.content?.trim() && !isLoading && (
                <div className={cn(
                  "flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                  isUser ? "mr-2 justify-end" : "ml-2"
                )}>
                  {message.role === "assistant" && (
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => onCopy?.(message)}
                      className="h-5 w-5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </svg>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() => onReply?.(message)}
                    className="h-5 w-5"
                  >
                    <Reply className="w-2.5 h-2.5" />
                  </Button>
                </div>
              )}
            </div>

            {isUser && (
              <div className="w-6 h-6 flex-shrink-0 mt-0.5">
                {showAvatar ? (
                  <Avatar className="w-6 h-6">
                    {userPic?.src && <AvatarImage src={userPic.src} alt={userPic.alt} />}
                    <AvatarFallback className="bg-secondary text-[8px]">
                      {userPic?.fallback || "U"}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-6 h-6 flex-shrink-0" />
                )}
              </div>
            )}
          </motion.div>
        )}
        {toolCallElement}
      </>
    );
  },
  (prevProps, nextProps) => {
    const prevTc = (prevProps.message as any).toolCalls;
    const nextTc = (nextProps.message as any).toolCalls;
    return (
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.role === nextProps.message.role &&
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.showAvatar === nextProps.showAvatar &&
      prevProps.userPic?.src === nextProps.userPic?.src &&
      prevProps.toolStates === nextProps.toolStates &&
      prevTc?.[0]?.result === nextTc?.[0]?.result &&
      prevTc?.length === nextTc?.length
    );
  }
);

// ── Main FloatingChatViewer ───────────────────────────────────────────
export function FloatingChatViewer() {
  const { agentId, sessionKey: providedSessionKey, taskContext, closeChat } = useFloatingChatOS();
  const { agents } = useOpenClawContext();
  const { userInfo } = useUser();

  // Detail panel toggle — open by default when task context is present
  const [showDetail, setShowDetail] = useState(!!taskContext);
  const prevTaskRef = useRef(taskContext);
  useEffect(() => {
    if (taskContext && taskContext !== prevTaskRef.current) {
      setShowDetail(true);
    } else if (!taskContext) {
      setShowDetail(false);
    }
    prevTaskRef.current = taskContext;
  }, [taskContext]);

  // Auto-send toggle — persisted in localStorage
  const [autoSend, setAutoSend] = useState(() => {
    try { return localStorage.getItem("floatingChat.autoSend") !== "false"; } catch { return true; }
  });
  const toggleAutoSend = useCallback(() => {
    setAutoSend((v) => {
      const next = !v;
      try { localStorage.setItem("floatingChat.autoSend", String(next)); } catch {}
      return next;
    });
  }, []);

  // Allow switching agents within the floating chat
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(agentId);

  // Sync when opened with a new agent from StatusWidget
  useEffect(() => {
    if (agentId) setCurrentAgentId(agentId);
  }, [agentId]);

  const effectiveAgentId = currentAgentId || agentId || agents[0]?.id || "main";
  const isTaskMode = !!taskContext;
  const defaultSessionKey = `agent:${effectiveAgentId}:main`;
  const [resolvedSessionKey, setResolvedSessionKey] = useState(defaultSessionKey);

  // Resolve session key.
  // Task mode: WAIT for providedSessionKey from KanbanWidget's background
  // resolution (get-task-sessions / sessions.spawn). Show skeleton until
  // the real session key arrives. Fallback to task-scoped key after 5s timeout.
  // Non-task mode: use providedSessionKey → auto-detect latest → fallback.
  const [sessionResolved, setSessionResolved] = useState(false);
  useEffect(() => {
    // Task mode: wait for the real session key from KanbanWidget
    if (isTaskMode && taskContext) {
      if (providedSessionKey) {
        setResolvedSessionKey(providedSessionKey);
        setSessionResolved(true);
      } else {
        // Not resolved yet — keep showing skeleton while KanbanWidget resolves
        setSessionResolved(false);
      }
      return;
    }
    // Non-task: use provided key if available
    if (providedSessionKey) {
      setResolvedSessionKey(providedSessionKey);
      setSessionResolved(true);
      return;
    }
    const fallback = `agent:${effectiveAgentId}:main`;
    setSessionResolved(false);
    if (!gatewayConnection.isConnected()) {
      setResolvedSessionKey(fallback);
      setSessionResolved(true);
      return;
    }
    gatewayConnection.listSessions(effectiveAgentId, 1).then((result) => {
      const latest = result.sessions?.[0];
      setResolvedSessionKey(latest?.key || fallback);
    }).catch(() => {
      setResolvedSessionKey(fallback);
    }).finally(() => {
      setSessionResolved(true);
    });
  }, [effectiveAgentId, providedSessionKey, isTaskMode, taskContext]);

  // Fallback timeout: if KanbanWidget's background resolution doesn't provide
  // a session key within 5s, use a task-scoped fallback so the chat isn't stuck
  // on the skeleton forever (e.g. bridge call failed).
  useEffect(() => {
    if (!isTaskMode || !taskContext || providedSessionKey) return;
    const timer = setTimeout(() => {
      setResolvedSessionKey((prev) => {
        // Only apply fallback if still unresolved
        if (prev === `agent:${effectiveAgentId}:main` || !prev) {
          return `agent:${effectiveAgentId}:task-${taskContext._id}`;
        }
        return prev;
      });
      setSessionResolved(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isTaskMode, taskContext, providedSessionKey, effectiveAgentId]);

  const {
    messages,
    isLoading,
    isConnected,
    error,
    sendMessage,
    stopGeneration,
    loadChatHistory,
    clearChat,
    setSessionKey,
  } = useGatewayChat({ sessionKey: resolvedSessionKey, autoConnect: true });

  // Keep the hook's internal session key in sync — without this, the hook may
  // filter out streaming events that arrive with a session key differing from
  // the stale initial prop value (same pattern GatewayChatWidget uses).
  useEffect(() => {
    setSessionKey(resolvedSessionKey);
  }, [resolvedSessionKey, setSessionKey]);

  // Unified tool state management
  const { toolStates, toggleToolExpansion } = useUnifiedToolState(messages as any);

  // Merge tool calls with results
  const mergedMessages = useMemo(() => mergeToolCallsWithResults(messages), [messages]);

  // Agent identity
  const identity = useAgentIdentity(effectiveAgentId);
  const avatarUrl = resolveAvatarUrl(identity?.avatar);
  const avatarText = isAvatarText(identity?.avatar) ? identity!.avatar! : undefined;
  const agent = agents.find((a) => a.id === effectiveAgentId);
  const agentName = identity?.name || agent?.name || effectiveAgentId;

  // User avatar (memoized to avoid new object refs on every render)
  const userAvatarUrl = userInfo?.profilePic ? getMediaUrl(userInfo.profilePic) : undefined;
  const userAvatar = useMemo(() => ({
    src: userAvatarUrl,
    fallback: userInfo?.username?.charAt(0).toUpperCase() || "U",
    alt: userInfo?.username || "User",
  }), [userAvatarUrl, userInfo?.username]);
  const assistantAvatar = useMemo(() => ({
    src: avatarUrl,
    fallback: avatarText || identity?.emoji || agentName.slice(0, 2).toUpperCase() || "AI",
    alt: agentName || "AI Assistant",
  }), [avatarUrl, avatarText, identity?.emoji, agentName]);

  // Scroll
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<GatewayChatMessage | null>(null);
  const [inputAreaHeight, setInputAreaHeight] = useState(60);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  const checkScroll = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const el = scrollAreaRef.current;
    setShowScrollBtn(el.scrollHeight - el.scrollTop > el.clientHeight + 10);
  }, []);

  // Measure input area height
  useEffect(() => {
    const el = inputAreaRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.offsetHeight;
      if (height > 0) setInputAreaHeight(height + 8);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Auto-scroll on new messages
  const prevLenRef = useRef(0);
  useEffect(() => {
    const prevLen = prevLenRef.current;
    if (messages.length <= prevLen) {
      prevLenRef.current = messages.length;
      return;
    }
    if (prevLen === 0 && messages.length > 1) {
      prevLenRef.current = messages.length;
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToBottom()));
      return;
    }
    const newMsg = messages[messages.length - 1];
    const isToolAction = newMsg?.toolCalls?.length || newMsg?.toolResults?.length;
    if (newMsg?.role === "user") {
      requestAnimationFrame(() => scrollToBottom());
    } else if (!isToolAction && scrollAreaRef.current) {
      const el = scrollAreaRef.current;
      if (el.scrollHeight - el.scrollTop <= el.clientHeight + 150) {
        requestAnimationFrame(() => scrollToBottom());
      }
    }
    prevLenRef.current = messages.length;
  }, [messages.length, messages, scrollToBottom]);

  // Show skeleton until first history load completes
  const initialLoadDoneRef = useRef(false);
  const [initialReady, setInitialReady] = useState(false);

  useEffect(() => {
    initialLoadDoneRef.current = false;
    setInitialReady(false);
  }, [effectiveAgentId, resolvedSessionKey]);

  useEffect(() => {
    if (!sessionResolved) return;
    loadChatHistory().finally(() => {
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;
        setInitialReady(true);
      }
    });
  }, [sessionResolved, resolvedSessionKey, loadChatHistory]);

  // Auto-send task context once per task when the task session is empty.
  // Uses module-level `autoSendFiredTasks` Set so the guard survives unmount/remount
  // (toggling the floating chat). Only fires after the real session is loaded:
  //   - sessionResolved + initialReady (history fetched for the correct session)
  //   - isConnected (gateway connected → history is real, not empty due to no connection)
  //   - messages.length === 0 (session genuinely has no messages)
  useEffect(() => {
    if (!isTaskMode || !taskContext || !autoSend || !sessionResolved || !initialReady || isLoading || !isConnected || !sendMessage) return;
    if (messages.length > 0) return;
    // Module-level guard — survives unmount/remount
    if (autoSendFiredTasks.has(taskContext._id)) return;
    autoSendFiredTasks.add(taskContext._id);

    const lines = [
      `I need help with this task:`,
      ``,
      `**${taskContext.title}**`,
      `**Task ID:** ${taskContext._id}`,
      `**Status:** ${taskContext.status.replace("_", " ")}`,
    ];
    if (taskContext.createdAt)
      lines.push(`**Created:** ${new Date(taskContext.createdAt).toISOString().split("T")[0]}`);
    if (taskContext.assignedAgent || taskContext.assignedAgentId)
      lines.push(`**Agent:** ${taskContext.assignedAgent || taskContext.assignedAgentId}`);
    if (taskContext.description?.trim())
      lines.push(``, taskContext.description.trim());
    if (taskContext.linkedDocumentUrl)
      lines.push(``, `**Doc:** ${taskContext.linkedDocumentUrl}`);

    sendMessage(lines.join("\n"));
  }, [isTaskMode, taskContext, autoSend, sessionResolved, initialReady, isLoading, isConnected, messages.length, sendMessage]);

  // Handle agent change
  const handleAgentChange = useCallback((newAgentId: string) => {
    setCurrentAgentId(newAgentId);
  }, []);

  // Send handler
  const handleSend = useCallback(
    async (text: string, attachments?: AttachmentType[]) => {
      if (!text.trim() && (!attachments || attachments.length === 0)) return;

      let finalMessage = text;

      if (quotedMessage) {
        const quoted = quotedMessage.content.trim();
        const quotedLines = quoted.split("\n").map((l) => `> ${l}`).join("\n");
        const sender = quotedMessage.role === "user" ? "User" : "Assistant";
        finalMessage = `Replying to ${sender}:\n${quotedLines}\n\n${finalMessage}`;
        setQuotedMessage(null);
      }

      let gatewayAttachments: GatewayChatAttachment[] | undefined;
      if (attachments?.length) {
        gatewayAttachments = attachments.map((att) => {
          const dataUrl = att.url || "";
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          const mimeType = mimeMatch?.[1] || `${att.type}/*`;
          return { id: att.id, type: att.type, mimeType, name: att.name, dataUrl };
        });
      }

      await sendMessage(finalMessage, gatewayAttachments);
    },
    [sendMessage, quotedMessage]
  );

  // Copy & reply handlers
  const handleCopy = useCallback((message: GatewayChatMessage) => {
    navigator.clipboard.writeText(message.content || "");
  }, []);

  const handleReply = useCallback((message: GatewayChatMessage) => {
    setQuotedMessage(message);
  }, []);

  // Avatar callback
  const shouldShowAvatarCallback = useCallback(
    (index: number) => shouldShowAvatarLocal(mergedMessages, index),
    [mergedMessages]
  );

  // Memoize the entire message node list so it doesn't rebuild on unrelated
  // state changes (e.g. quotedMessage, showScrollBtn, inputAreaHeight).
  const messageNodes = useMemo(() => {
    const nodes: React.ReactNode[] = [];

    for (let index = 0; index < mergedMessages.length; index++) {
      const message = mergedMessages[index];
      const isToolMessage = message.role === "assistant" &&
        ((message as any).toolCalls?.length > 0 ||
         (message as any).contentBlocks?.some((b: any) => b.type === "toolCall"));

      // Group consecutive tool call messages
      if (isToolMessage) {
        const toolMessages: GatewayChatMessage[] = [];
        let j = index;

        while (j < mergedMessages.length) {
          const m = mergedMessages[j];
          const isToolResultMsg = m.role === "tool" || (m.role as string) === "toolResult";
          const isToolMsg = m.role === "assistant" &&
            ((m as any).toolCalls?.length > 0 ||
             (m as any).contentBlocks?.some((b: any) => b.type === "toolCall"));

          if (isToolResultMsg || !isToolMsg) break;
          toolMessages.push(m);
          j++;
        }

        if (toolMessages.length >= 1) {
          nodes.push(
            <GroupedToolActions
              key={`tool-actions-${index}`}
              toolMessages={toolMessages}
              toolStates={toolStates}
              toggleToolExpansion={toggleToolExpansion}
              showAvatar={shouldShowAvatarCallback(index)}
              assistantAvatar={assistantAvatar}
            />
          );
          index = j - 1;
          continue;
        }
      }

      // Single message
      nodes.push(
        <MessageBubble
          key={message.id || index}
          message={message}
          isUser={message.role === "user"}
          showAvatar={shouldShowAvatarCallback(index)}
          isLoading={
            isLoading &&
            index === mergedMessages.length - 1 &&
            message.role === "assistant" &&
            !message.content.trim()
          }
          botPic={avatarUrl}
          userPic={userAvatar}
          assistantAvatar={assistantAvatar}
          toolStates={toolStates}
          toggleToolExpansion={toggleToolExpansion}
          onCopy={handleCopy}
          onReply={handleReply}
        />
      );
    }

    // Thinking indicator
    if (isLoading) {
      const lastMsg = mergedMessages[mergedMessages.length - 1];
      const lastIsEmptyAssistant = lastMsg?.role === "assistant" && !lastMsg.content?.trim() && !(lastMsg as any).toolCalls?.length;
      const lastIsStreamingText = lastMsg?.role === "assistant" && lastMsg.content?.trim() && !(lastMsg as any).toolCalls?.length;

      if (!lastIsEmptyAssistant && !lastIsStreamingText) {
        const lastUserIdx = mergedMessages.reduce((acc, m, i) => m.role === "user" ? i : acc, -1);
        const currentTurn = lastUserIdx >= 0 ? mergedMessages.slice(lastUserIdx + 1) : mergedMessages;
        const toolCallCount = currentTurn.filter(m =>
          m.role === "assistant" && (m as any).toolCalls?.length > 0
        ).length;

        let thinkingText = "AI is thinking";
        if (toolCallCount > 0) {
          thinkingText = `Executed ${toolCallCount} action${toolCallCount > 1 ? "s" : ""} — working`;
        }

        nodes.push(
          <motion.div
            key="thinking-indicator"
            className="flex gap-2 justify-start"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
          >
            <div className="w-6 h-6 flex-shrink-0">
              <Avatar className="w-6 h-6">
                {assistantAvatar?.src ? (
                  <AvatarImage src={assistantAvatar.src} alt={assistantAvatar.alt} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-[8px]">
                  {assistantAvatar?.fallback
                    ? <span>{assistantAvatar.fallback}</span>
                    : <CopanionIcon className="w-3 h-3" />}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex items-center py-1">
              <AnimatedThinkingText text={thinkingText} />
            </div>
          </motion.div>
        );
      }
    }

    return nodes;
  }, [mergedMessages, toolStates, toggleToolExpansion, isLoading, avatarUrl, userAvatar, assistantAvatar, shouldShowAvatarCallback, handleCopy, handleReply]);

  if (!agentId) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col min-h-0 bg-background"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="w-7 h-7 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={agentName} />}
            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
              {avatarText || identity?.emoji || agentName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {agents.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 hover:opacity-80 transition-opacity text-left min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">
                    {agentName}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {agents.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    onClick={() => handleAgentChange(a.id)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span>{a.name}</span>
                    {a.id === effectiveAgentId && <Check className="w-3 h-3" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-sm font-medium text-foreground truncate">
              {agentName}
            </span>
          )}
          {/* Connection dot */}
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              isConnected ? "bg-emerald-500" : "bg-muted-foreground/40"
            )}
          />
        </div>
        <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-0.5 shrink-0">
          {taskContext && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={autoSend ? "secondary" : "ghost"}
                    size="iconSm"
                    className={cn("h-7 w-7", autoSend ? "bg-amber-500/10 text-amber-500" : "text-muted-foreground")}
                    onClick={toggleAutoSend}
                  >
                    <Zap className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {autoSend ? "Auto-send task context is ON — click to disable" : "Auto-send task context is OFF — click to enable"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDetail ? "secondary" : "ghost"}
                    size="iconSm"
                    className={cn("h-7 w-7", showDetail && "bg-primary/10 text-primary")}
                    onClick={() => setShowDetail((v) => !v)}
                  >
                    <PanelRight className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {showDetail ? "Hide task details" : "Show task details"}
                </TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                className="h-7 w-7"
                onClick={loadChatHistory}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reload chat history</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                className="h-7 w-7"
                onClick={closeChat}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close chat</TooltipContent>
          </Tooltip>
        </div>
        </TooltipProvider>
      </div>

      {/* Content area: chat + optional detail panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Chat messages */}
      <div className="flex-1 min-h-0 relative min-w-0">
        <div
          ref={scrollAreaRef}
          className="h-full overflow-y-auto overflow-x-hidden px-3 py-2 customScrollbar2"
          onScroll={checkScroll}
          style={{ overscrollBehavior: "contain" }}
        >
          {!initialReady ? (
            <div className="p-3">
              <ChatLoadingSkeleton />
            </div>
          ) : messages.length === 0 && !isLoading ? (
            <div className="flex items-center justify-center h-full px-6">
              <p className="text-xs text-muted-foreground text-center">
                {isTaskMode
                  ? `Ask ${agentName} anything about this task — context is auto-included`
                  : `Start a conversation with ${agentName}`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {messageNodes}
              </AnimatePresence>

              {/* Spacer for input overlay */}
              <div style={{ height: `${inputAreaHeight}px` }} />
            </div>
          )}
        </div>

        {/* Scroll to bottom */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute w-full flex justify-center z-50"
              style={{ bottom: `${inputAreaHeight}px` }}
            >
              <Button
                variant="secondary"
                size="iconSm"
                className="h-7 w-7 rounded-full shadow-md"
                onClick={scrollToBottom}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div
          ref={inputAreaRef}
          className={cn(
            "absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-transparent pointer-events-none",
            !initialReady && "hidden"
          )}
        >
          {/* Quoted message preview */}
          <AnimatePresence>
            {quotedMessage && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="pointer-events-auto mb-1.5 flex items-start gap-2 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-background/90 backdrop-blur-sm"
              >
                <div className="flex-shrink-0 w-0.5 self-stretch rounded-full bg-primary/50" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                    Replying to {quotedMessage.role === "user" ? "yourself" : "assistant"}
                  </p>
                  <p className="text-xs text-foreground/80 line-clamp-2">
                    {quotedMessage.content?.slice(0, 120) || "..."}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => setQuotedMessage(null)}
                  className="h-5 w-5 flex-shrink-0 pointer-events-auto"
                >
                  <X className="w-3 h-3" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <InputContainer
            onSendMessage={handleSend}
            placeholder={`Message ${agentName}...`}
            isLoading={isLoading}
            onStopGeneration={stopGeneration}
            sessionKey={resolvedSessionKey}
            agentId={effectiveAgentId}
            showAttachments={true}
            showVoiceInput={false}
            showEmojiPicker={false}
            showActions={true}
            autoResize={true}
            allowEmptySend={false}
            maxAttachments={5}
            maxFileSize={5 * 1024 * 1024}
            allowedFileTypes={["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"]}
          />
        </div>
      </div>

      {/* Task detail panel (right side) */}
      <AnimatePresence>
        {showDetail && taskContext && (
          <motion.div
            key="task-detail-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="shrink-0 min-h-0 bg-background/60 overflow-hidden border-l border-border/30"
          >
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.08, ease: "easeOut" }}
              className="w-[260px] h-full"
            >
              <TaskDetailPanel task={taskContext} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
}
